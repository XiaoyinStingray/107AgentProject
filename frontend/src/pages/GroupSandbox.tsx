import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAgents } from "../api/agents";
import {
  useCreateWorld,
  useDeleteWorld,
  usePauseWorld,
  useResetWorld,
  useStartWorld,
  useWorldRelationships,
  useWorlds,
} from "../api/worlds";
import { useSSE } from "../hooks/useSSE";
import { useThrottledEvents } from "../hooks/useThrottledEvents";
import { useSandboxStore } from "../stores/useSandboxStore";
import type { AgentResponse } from "../types/agent";
import type { SSEEvent } from "../types/events";
import type { RelationshipState } from "../types/relationships";
import type { SandboxSpeed } from "../types/sandbox";
import AgentStatusPanel from "../components/world/AgentStatusPanel";
import EventFeed from "../components/world/EventFeed";
import Timeline from "../components/world/Timeline";
import RelationshipGraph from "../components/world/RelationshipGraph";
import SandboxHeader from "../components/world/SandboxHeader";
import SandboxSetup from "../components/world/SandboxSetup";
import ThoughtStream from "../components/agent/ThoughtStream";
import Card from "../components/shared/Card";

/** Drive a real multi-Agent World through REST control and SSE events. */
export default function GroupSandbox() {
  const location = useLocation();
  const initialScenario = (location.state as { scenario?: string; agentCount?: number } | null)?.scenario;
  const initialAgentCount = (location.state as { scenario?: string; agentCount?: number } | null)?.agentCount;
  const { data: agents = [], isLoading: agentsLoading, error: agentsError } = useAgents();
  const initializedAgents = useRef(false);
  const [phase, setPhase] = useState<"setup" | "running">("setup");
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [selectedScenario, setSelectedScenario] = useState(initialScenario ?? "期末周");
  const [selectedTick, setSelectedTick] = useState<number | null>(null);
  const [speed, setSpeed] = useState<SandboxSpeed>(1);
  const [worldId, setWorldId] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replayEvent, setReplayEvent] = useState<SSEEvent | null>(null);
  const [startGen, setStartGen] = useState(0); // 递增以重置节流器（仅新启动时）
  const [feedFilterIds, setFeedFilterIds] = useState<string[]>([]);
  const { activeWorldId, setActiveWorld } = useSandboxStore();
  const queryClient = useQueryClient();
  const { data: allWorlds = [] } = useWorlds();
  const worlds = useMemo(() => allWorlds.filter((w) => w.world_type === "group"), [allWorlds]);
  const createWorld = useCreateWorld();
  const startWorld = useStartWorld();
  const pauseWorld = usePauseWorld();
  const resetWorld = useResetWorld();
  const deleteWorld = useDeleteWorld();
  const relationshipQuery = useWorldRelationships(worldId);
  const {
    events,
    totalEventCount,
    connected,
    relationships,
    lastRelationshipKey,
    hydrateRelationships,
    disconnect,
    clear,
  } = useSSE(worldId);
  const displayedEvents = useThrottledEvents(events, speed, String(startGen));

  const [restoring, setRestoring] = useState(false);
  const restoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 清理 restoreTimer（组件卸载时）
  useEffect(() => {
    return () => {
      if (restoreTimerRef.current) clearTimeout(restoreTimerRef.current);
    };
  }, []);

  // 模拟自然结束时清理活跃 World
  useEffect(() => {
    const hasSessionEnd = events.some((e) => e.type === "session_end");
    if (hasSessionEnd && activeWorldId) {
      setActiveWorld(null);
    }
  }, [events, activeWorldId, setActiveWorld]);

  useEffect(() => {
    if (initializedAgents.current || agents.length === 0) return;
    const count = initialAgentCount ?? 3;
    setSelectedAgentIds(agents.slice(0, count).map((agent) => agent.id));
    initializedAgents.current = true;
  }, [agents, initialAgentCount]);

  useEffect(() => {
    if (relationshipQuery.data) hydrateRelationships(relationshipQuery.data);
  }, [hydrateRelationships, relationshipQuery.data]);

  // 暂停状态只由按钮和首次 connected 事件控制
  const didSyncRef = useRef(false);
  useEffect(() => {
    const streamError = [...events].reverse().find((event) => event.type === "error");
    if (streamError) {
      setError(streamError.message ?? streamError.content ?? "SSE 连接发生错误");
    }
    // 仅首次 connected 事件同步 isPaused
    if (!didSyncRef.current) {
      const ce = [...events].reverse().find((event) => event.type === "connected");
      if (ce?.status) {
        didSyncRef.current = true;
        setIsPaused(ce.status === "paused");
      }
    }
  }, [events]);

  // 新 World 启动或 resume 时允许重新同步
  useEffect(() => {
    didSyncRef.current = false;
  }, [startGen]);

  const selectedAgents = useMemo(
    () => agents.filter((agent) => selectedAgentIds.includes(agent.id)),
    [agents, selectedAgentIds],
  );
  const visibleEvents = useMemo(() => {
    // 恢复模式：直接展示全量事件，绕过节流器
    const source = restoring ? events : displayedEvents;
    return source.filter((event) => {
      if (INFRASTRUCTURE_EVENT_TYPES.has(event.type)) return false;
      // 恢复模式：不过滤 Agent
      if (restoring) return true;
      // 正常运行 / 暂停：只显示选中 Agent 的事件
      return !event.agent_id || selectedAgentIds.includes(event.agent_id);
    });
  }, [restoring, events, displayedEvents, selectedAgentIds]);

  const relationshipValues = useMemo(
    () => Object.values(relationships),
    [relationships],
  );
  const pending = createWorld.isPending || startWorld.isPending
    || pauseWorld.isPending || resetWorld.isPending;

  const handleToggleAgent = useCallback((agentId: string) => {
    setSelectedAgentIds((current) => current.includes(agentId)
      ? current.filter((id) => id !== agentId)
      : [...current, agentId]);
  }, []);

  const handleToggleFeedAgent = useCallback((agentId: string) => {
    setFeedFilterIds((current) => current.includes(agentId)
      ? current.filter((id) => id !== agentId)
      : [...current, agentId]);
  }, []);

  const handleStart = async () => {
    if (selectedAgentIds.length < 2 || pending) return;
    setError(null);
    clear();
    try {
      const world = await createWorld.mutateAsync({
        name: `群体沙盒 - ${selectedScenario}`,
        world_type: "group",
        scenario: { name: selectedScenario },
        agent_ids: selectedAgentIds,
      });
      await startWorld.mutateAsync(world.id);
      setWorldId(world.id);
      setActiveWorld(world.id);
      setStartGen((n) => n + 1); // 重置节流器
      setSelectedTick(null);
      setIsPaused(false);
      setFeedFilterIds(selectedAgentIds);
      setPhase("running");
    } catch (cause) {
      setError(getErrorMessage(cause, "群体模拟启动失败"));
    }
  };

  const togglingRef = useRef(false);
  const handleToggleRunning = async () => {
    if (!worldId || pending || togglingRef.current) return;
    togglingRef.current = true;
    setError(null);
    try {
      if (isPaused) {
        await startWorld.mutateAsync(worldId);
        setIsPaused(false);
      } else {
        await pauseWorld.mutateAsync(worldId);
        setIsPaused(true);
      }
    } catch (cause) {
      setError(getErrorMessage(cause, "模拟状态切换失败"));
    } finally {
      togglingRef.current = false;
    }
  };

  /** 返回列表——先暂停后端，等当前 tick 完成（事件落库），再断开 SSE。 */
  const handleBack = useCallback(async () => {
    setActiveWorld(null);
    const wid = worldId;
    if (wid) {
      try {
        await pauseWorld.mutateAsync(wid);
        // 等 2 秒让 SSE generator 完成当前 tick 并 persist 事件
        await new Promise(r => setTimeout(r, 2000));
      } catch (e) {
        console.error("返回暂停失败:", e);
      }
    }
    disconnect();
    setWorldId(null);
    didSyncRef.current = false;
    queryClient.invalidateQueries({ queryKey: ["worlds"] });
    setPhase("setup");
  }, [worldId, disconnect, pauseWorld, queryClient, setActiveWorld]);

  const handleReset = async () => {
    if (!worldId || pending) return;
    setError(null);
    try {
      await resetWorld.mutateAsync(worldId);
      disconnect();
      clear();
      setWorldId(null);
      setActiveWorld(null);
      setSelectedTick(null);
      setIsPaused(false);
      setPhase("setup");
    } catch (cause) {
      setError(getErrorMessage(cause, "模拟重置失败"));
    }
  };

  /** 从 World 列表恢复已有实验。 */
  const handleResumeWorld = useCallback((id: string) => {
    setError(null);
    clear();
    setWorldId(id);
    setActiveWorld(id);
    setSelectedTick(null);
    const world = allWorlds.find((w) => w.id === id);
    if (world) {
      setIsPaused(world.status === "paused");
      setSelectedScenario(world.scenario?.name ?? selectedScenario);
      setSelectedAgentIds(world.agent_ids ?? []);
      setFeedFilterIds(world.agent_ids ?? []);
    }
    didSyncRef.current = false; // 允许下次 connected 同步
    setRestoring(true);
    if (restoreTimerRef.current) clearTimeout(restoreTimerRef.current);
    restoreTimerRef.current = setTimeout(() => setRestoring(false), 2000);
    setPhase("running");
  }, [clear, setActiveWorld, allWorlds, selectedScenario]);

  /** 从 World 列表删除实验 */
  const handleDeleteWorld = useCallback(async (id: string) => {
    setError(null);
    try {
      await deleteWorld.mutateAsync(id);
      if (activeWorldId === id) setActiveWorld(null);
    } catch (cause) {
      setError(getErrorMessage(cause, "删除失败"));
    }
  }, [deleteWorld, activeWorldId, setActiveWorld]);

  if (phase === "setup") {
    return (
      <SandboxSetup
        agents={agents}
        worlds={worlds}
        selectedAgentIds={selectedAgentIds}
        selectedScenario={selectedScenario}
        isLoading={agentsLoading || pending}
        error={error ?? (agentsError ? "Agent 列表加载失败" : null)}
        onToggleAgent={handleToggleAgent}
        onSelectScenario={setSelectedScenario}
        onStart={handleStart}
        onResumeWorld={handleResumeWorld}
        onDeleteWorld={handleDeleteWorld}
      />
    );
  }

  return (
    <div className="h-full min-h-0 flex flex-col bg-bg-primary">
      <SandboxHeader
        scenario={selectedScenario}
        currentTick={getCurrentTick(visibleEvents)}
        connected={connected}
        isPaused={isPaused}
        isPending={pending}
        speed={speed}
        onToggleSpeed={() => setSpeed((value) => value === 1 ? 2 : 1)}
        onToggleRunning={handleToggleRunning}
        onBack={handleBack}
        onReset={handleReset}
      />
      {error && <p role="alert" className="px-4 py-2 text-sm text-accent-red">{error}</p>}
      <SandboxRuntime
        agents={selectedAgents}
        events={visibleEvents}
        relationships={relationshipValues}
        lastRelationshipKey={lastRelationshipKey}
        selectedTick={selectedTick}
        onSelectTick={setSelectedTick}
        onEventClick={setReplayEvent}
        feedFilterIds={feedFilterIds}
        onToggleFeedAgent={handleToggleFeedAgent}
      />
      <SandboxFooter
        selectedTick={selectedTick}
        eventCount={totalEventCount}
        agentCount={selectedAgents.length}
        onClearTick={() => setSelectedTick(null)}
      />
      {/* 决策回放详情面板 */}
      {replayEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setReplayEvent(null)}>
          <div className="bg-bg-card border border-border rounded-lg max-w-lg w-full mx-4 p-5 space-y-3 max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-mono text-sm text-text-primary">🔍 决策回放</h3>
              <button onClick={() => setReplayEvent(null)} className="text-text-secondary hover:text-text-primary text-lg">✕</button>
            </div>
            <div className="text-xs font-mono text-text-secondary space-y-1">
              <p>Agent: {replayEvent.agent_name ?? replayEvent.agent_id ?? "Unknown"}</p>
              <p>类型: {replayEvent.type} · Tick #{replayEvent.tick}</p>
              {replayEvent.action && <p>行动: {replayEvent.action}{replayEvent.target ? ` → ${replayEvent.target}` : ""}</p>}
            </div>
            <div className="border-t border-border pt-3">
              <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">
                {replayEvent.content ?? replayEvent.message ?? replayEvent.description ?? "（无内容）"}
              </p>
            </div>
            {replayEvent.data && Object.keys(replayEvent.data).length > 0 && (
              <details className="border border-border rounded">
                <summary className="text-xs font-mono text-text-secondary px-2 py-1 cursor-pointer hover:text-text-primary">原始数据</summary>
                <pre className="text-xs font-mono text-text-secondary p-2 overflow-x-auto">{JSON.stringify(replayEvent.data, null, 2)}</pre>
              </details>
            )}
            {replayEvent.subtext && (
              <p className="text-xs text-text-secondary italic">{replayEvent.subtext}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface SandboxRuntimeProps {
  agents: AgentResponse[];
  events: SSEEvent[];
  relationships: RelationshipState[];
  lastRelationshipKey: string | null;
  selectedTick: number | null;
  onSelectTick: (tick: number | null) => void;
  onEventClick?: (event: SSEEvent) => void;
  feedFilterIds: string[];
  onToggleFeedAgent: (agentId: string) => void;
}

function SandboxRuntime(props: SandboxRuntimeProps) {
  return (
    <div className="flex-1 min-h-0 min-w-0 grid grid-cols-12 gap-3 p-3">
      <aside className="col-span-3 min-h-0 min-w-0 overflow-y-auto space-y-3">
        {props.agents.map((agent) => <AgentStatusPanel key={agent.id} agent={agent} events={props.events.filter((event) => event.agent_id === agent.id)} />)}
      </aside>
      <main className="col-span-6 min-h-0 min-w-0 overflow-hidden">
        <div className="h-full flex flex-col gap-3">
          <div className="shrink-0 grid grid-cols-2 gap-3">
            <Card className="flex flex-col"><Timeline events={props.events} selectedTick={props.selectedTick} onSelectTick={props.onSelectTick} /></Card>
            <RelationshipGraph agents={props.agents} relationships={props.relationships} lastRelationshipKey={props.lastRelationshipKey} />
          </div>
          <Card className="flex-1 min-h-0 overflow-hidden flex flex-col"><EventFeed events={props.events} selectedTick={props.selectedTick} agents={props.agents} feedFilterIds={props.feedFilterIds} onToggleFeedAgent={props.onToggleFeedAgent} /></Card>
        </div>
      </main>
      <aside className="col-span-3 min-h-0 min-w-0 overflow-hidden">
        <Card className="h-full min-h-0 flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-border"><h2 className="font-mono text-sm text-text-primary">THOUGHT STREAM</h2></div>
          <ThoughtStream events={props.events} className="flex-1 min-h-0" onEventClick={props.onEventClick} />
        </Card>
      </aside>
    </div>
  );
}

interface SandboxFooterProps {
  selectedTick: number | null;
  eventCount: number;
  agentCount: number;
  onClearTick: () => void;
}

function SandboxFooter(props: SandboxFooterProps) {
  return (
    <div className="shrink-0 border-t border-border bg-bg-secondary px-4 py-2 flex items-center gap-4">
      <span className="text-xs font-mono text-text-secondary">{props.selectedTick === null ? "全部 Tick" : `Tick #${props.selectedTick}`}</span>
      <button type="button" onClick={props.onClearTick} className="text-xs font-mono text-accent-blue hover:text-accent-blue/80 transition-colors">清除筛选</button>
      <span className="ml-auto text-xs font-mono text-text-secondary">{props.eventCount} events · {props.agentCount} agents</span>
    </div>
  );
}

function getCurrentTick(events: SSEEvent[]): number {
  return events.reduce((current, event) => Math.max(current, event.tick), 0);
}

function getErrorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

const INFRASTRUCTURE_EVENT_TYPES = new Set([
  "connected",
  "paused",
  "error",
  "session_end",
]);
