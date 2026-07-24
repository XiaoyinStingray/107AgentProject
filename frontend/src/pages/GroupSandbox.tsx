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
  const initialScenario = (location.state as { scenario?: string } | null)?.scenario;
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
  const [startGen, setStartGen] = useState(0); // 递增以重置节流器（仅新启动时）
  const { activeWorldId, setActiveWorld } = useSandboxStore();
  const queryClient = useQueryClient();
  const { data: allWorlds = [] } = useWorlds();
  const worlds = useMemo(() => allWorlds.filter((w) => w.world_type !== "solo"), [allWorlds]);
  const createWorld = useCreateWorld();
  const startWorld = useStartWorld();
  const pauseWorld = usePauseWorld();
  const resetWorld = useResetWorld();
  const deleteWorld = useDeleteWorld();
  const relationshipQuery = useWorldRelationships(worldId);
  const {
    events,
    connected,
    relationships,
    lastRelationshipKey,
    hydrateRelationships,
    disconnect,
    clear,
  } = useSSE(worldId);
  const displayedEvents = useThrottledEvents(events, speed, isPaused, String(startGen));

  // 挂载时恢复活跃 World——存量事件直接全量展示，绕过节流器
  const [restoring, setRestoring] = useState(false);
  const restoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (activeWorldId && phase === "setup" && !worldId) {
      setWorldId(activeWorldId);
      setPhase("running");
      if (events.length > 3) {
        setRestoring(true);
        restoreTimerRef.current = setTimeout(() => setRestoring(false), 2000);
      }
    }
    return () => {
      if (restoreTimerRef.current) clearTimeout(restoreTimerRef.current);
    };
  }, [activeWorldId, phase, worldId, events.length]);

  // 模拟自然结束时清理活跃 World
  useEffect(() => {
    const hasSessionEnd = events.some((e) => e.type === "session_end");
    if (hasSessionEnd && activeWorldId) {
      setActiveWorld(null);
    }
  }, [events, activeWorldId, setActiveWorld]);

  useEffect(() => {
    if (initializedAgents.current || agents.length === 0) return;
    setSelectedAgentIds(agents.slice(0, 3).map((agent) => agent.id));
    initializedAgents.current = true;
  }, [agents]);

  useEffect(() => {
    if (relationshipQuery.data) hydrateRelationships(relationshipQuery.data);
  }, [hydrateRelationships, relationshipQuery.data]);

  // 仅在恢复后首次收到 paused/boundary 时同步 isPaused，之后由按钮控制
  // BUG-011: connected 事件携带 status，用于重连时校准暂停状态
  const pauseSyncedRef = useRef(false);
  useEffect(() => {
    const streamError = [...events].reverse().find((event) => event.type === "error");
    if (streamError) {
      setError(streamError.message ?? streamError.content ?? "SSE 连接发生错误");
    }

    // 收到 connected 事件 → 重置同步标记，按后端真实状态校准
    const connectedEvent = [...events].reverse().find((event) => event.type === "connected");
    if (connectedEvent?.status) {
      pauseSyncedRef.current = false;
      setIsPaused(connectedEvent.status === "paused");
      return;
    }

    if (pauseSyncedRef.current) return;
    const lastPauseOrBoundary = [...events]
      .reverse()
      .find((event) => event.type === "paused" || event.type === "tick_boundary");
    if (lastPauseOrBoundary) {
      setIsPaused(lastPauseOrBoundary.type === "paused");
      pauseSyncedRef.current = true;
    }
  }, [events]);

  // 新 World 启动时重置同步标记
  useEffect(() => {
    pauseSyncedRef.current = false;
  }, [startGen]);

  const selectedAgents = useMemo(
    () => agents.filter((agent) => selectedAgentIds.includes(agent.id)),
    [agents, selectedAgentIds],
  );
  const visibleEvents = useMemo(() => {
    const source = restoring ? events : displayedEvents;
    return source.filter((event) =>
      !INFRASTRUCTURE_EVENT_TYPES.has(event.type)
      && (!event.agent_id || selectedAgentIds.includes(event.agent_id)));
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
      setPhase("running");
    } catch (cause) {
      setError(getErrorMessage(cause, "群体模拟启动失败"));
    }
  };

  const handleToggleRunning = async () => {
    if (!worldId || pending) return;
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
    }
  };

  /** 返回列表——保留 World 当前状态，不重置；刷新 World 列表缓存。
   *  设置 worldId 为 null 确保 useSSE 正确断开，恢复时从头拉取历史。 */
  const handleBack = useCallback(() => {
    disconnect();
    setWorldId(null);         // ← BUG-012: 确保 useSSE effect 在恢复时重连
    pauseSyncedRef.current = false;  // ← BUG-011: 重置允许恢复后重新同步
    queryClient.invalidateQueries({ queryKey: ["worlds"] });
    setPhase("setup");
  }, [disconnect, queryClient]);

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

  /** 从 World 列表恢复已有实验 */
  const handleResumeWorld = useCallback((id: string) => {
    setError(null);
    clear();
    setWorldId(id);
    setActiveWorld(id);
    setSelectedTick(null);
    const world = allWorlds.find((w) => w.id === id);
    setIsPaused(world?.status === "paused");
    // 启用 restoring 模式——历史事件直接展示，不走节流器
    setRestoring(true);
    if (restoreTimerRef.current) clearTimeout(restoreTimerRef.current);
    restoreTimerRef.current = setTimeout(() => setRestoring(false), 2000);
    setPhase("running");
  }, [clear, setActiveWorld, allWorlds]);

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
      />
      <SandboxFooter
        selectedTick={selectedTick}
        eventCount={visibleEvents.length}
        agentCount={selectedAgents.length}
        onClearTick={() => setSelectedTick(null)}
      />
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
            <Card><Timeline events={props.events} selectedTick={props.selectedTick} onSelectTick={props.onSelectTick} /></Card>
            <RelationshipGraph agents={props.agents} relationships={props.relationships} lastRelationshipKey={props.lastRelationshipKey} />
          </div>
          <Card className="flex-1 min-h-0 overflow-hidden flex flex-col"><EventFeed events={props.events} selectedTick={props.selectedTick} /></Card>
        </div>
      </main>
      <aside className="col-span-3 min-h-0 min-w-0 overflow-hidden">
        <Card className="h-full min-h-0 flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-border"><h2 className="font-mono text-sm text-text-primary">THOUGHT STREAM</h2></div>
          <ThoughtStream events={props.events} className="flex-1 min-h-0" />
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
