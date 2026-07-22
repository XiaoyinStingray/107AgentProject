import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAgents } from "../api/agents";
import {
  useCreateWorld,
  usePauseWorld,
  useResetWorld,
  useStartWorld,
  useWorldRelationships,
} from "../api/worlds";
import { useSSE } from "../hooks/useSSE";
import { useThrottledEvents } from "../hooks/useThrottledEvents";
import { SANDBOX_SCENARIOS } from "../data/sandboxScenarios";
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
  const createWorld = useCreateWorld();
  const startWorld = useStartWorld();
  const pauseWorld = usePauseWorld();
  const resetWorld = useResetWorld();
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
  const displayedEvents = useThrottledEvents(events, speed, isPaused, worldId);

  useEffect(() => {
    if (initializedAgents.current || agents.length === 0) return;
    setSelectedAgentIds(agents.slice(0, 3).map((agent) => agent.id));
    initializedAgents.current = true;
  }, [agents]);

  useEffect(() => {
    if (relationshipQuery.data) hydrateRelationships(relationshipQuery.data);
  }, [hydrateRelationships, relationshipQuery.data]);

  useEffect(() => {
    const streamError = [...events].reverse().find((event) => event.type === "error");
    if (streamError) {
      setError(streamError.message ?? streamError.content ?? "SSE 连接发生错误");
    }
  }, [events]);

  const selectedAgents = useMemo(
    () => agents.filter((agent) => selectedAgentIds.includes(agent.id)),
    [agents, selectedAgentIds],
  );
  const visibleEvents = useMemo(
    () => displayedEvents.filter((event) =>
      !INFRASTRUCTURE_EVENT_TYPES.has(event.type)
      && (!event.agent_id || selectedAgentIds.includes(event.agent_id))),
    [displayedEvents, selectedAgentIds],
  );
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
        scenario: { name: selectedScenario },
        agent_ids: selectedAgentIds,
      });
      await startWorld.mutateAsync(world.id);
      setWorldId(world.id);
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

  const handleReset = async () => {
    if (!worldId || pending) return;
    setError(null);
    try {
      await resetWorld.mutateAsync(worldId);
      disconnect();
      clear();
      setWorldId(null);
      setSelectedTick(null);
      setIsPaused(false);
      setPhase("setup");
    } catch (cause) {
      setError(getErrorMessage(cause, "模拟重置失败"));
    }
  };

  if (phase === "setup") {
    return (
      <SandboxSetup
        agents={agents}
        scenarios={SANDBOX_SCENARIOS}
        selectedAgentIds={selectedAgentIds}
        selectedScenario={selectedScenario}
        isLoading={agentsLoading || pending}
        error={error ?? (agentsError ? "Agent 列表加载失败" : null)}
        onToggleAgent={handleToggleAgent}
        onSelectScenario={setSelectedScenario}
        onStart={handleStart}
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
