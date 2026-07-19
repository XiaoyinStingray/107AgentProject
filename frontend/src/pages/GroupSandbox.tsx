import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentResponse } from "../types/agent";
import type { SSEEvent } from "../types/events";
import type { SandboxSpeed } from "../types/sandbox";
import { MOCK_AGENTS } from "../mocks/agents";
import {
  MOCK_SANDBOX_EVENTS,
  MOCK_SANDBOX_SCENARIOS,
} from "../mocks/sandbox";
import { useAgentStore } from "../stores/useAgentStore";
import AgentStatusPanel from "../components/world/AgentStatusPanel";
import EventFeed from "../components/world/EventFeed";
import Timeline from "../components/world/Timeline";
import RelationshipGraph from "../components/world/RelationshipGraph";
import SandboxHeader from "../components/world/SandboxHeader";
import SandboxSetup from "../components/world/SandboxSetup";
import ThoughtStream from "../components/agent/ThoughtStream";
import Card from "../components/shared/Card";

/** Step 20 群体沙盒主页面。 */
export default function GroupSandbox() {
  const agents = useAvailableAgents();
  const [phase, setPhase] = useState<"setup" | "running">("setup");
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>(
    agents.map((agent) => agent.id),
  );
  const [selectedScenario, setSelectedScenario] = useState("期末周");
  const [selectedTick, setSelectedTick] = useState<number | null>(null);
  const [speed, setSpeed] = useState<SandboxSpeed>(1);
  const { events, connected, start, resume, stop, clear } =
    useSandboxMockSSE(speed);

  const selectedAgents = agents.filter((agent) =>
    selectedAgentIds.includes(agent.id),
  );
  const visibleEvents = events.filter(
    (event) => !event.agent_id || selectedAgentIds.includes(event.agent_id),
  );
  const currentTick = getCurrentTick(visibleEvents);

  const handleToggleAgent = useCallback((agentId: string) => {
    setSelectedAgentIds((current) =>
      current.includes(agentId)
        ? current.filter((id) => id !== agentId)
        : [...current, agentId],
    );
  }, []);

  const handleStart = useCallback(() => {
    if (selectedAgentIds.length === 0) return;
    setSelectedTick(null);
    setPhase("running");
    start();
  }, [selectedAgentIds.length, start]);

  const handleReset = useCallback(() => {
    stop();
    clear();
    setSelectedTick(null);
    setPhase("setup");
  }, [clear, stop]);

  if (phase === "setup") {
    return (
      <SandboxSetup
        agents={agents}
        scenarios={MOCK_SANDBOX_SCENARIOS}
        selectedAgentIds={selectedAgentIds}
        selectedScenario={selectedScenario}
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
        currentTick={currentTick}
        connected={connected}
        speed={speed}
        onToggleSpeed={() => setSpeed((value) => (value === 1 ? 2 : 1))}
        onToggleRunning={connected ? stop : resume}
        onReset={handleReset}
      />

      <div className="flex-1 min-h-0 min-w-0 grid grid-cols-12 gap-3 p-3">
        <aside className="col-span-3 min-h-0 min-w-0 overflow-y-auto space-y-3">
          {selectedAgents.map((agent) => (
            <AgentStatusPanel
              key={agent.id}
              agent={agent}
              events={visibleEvents.filter((event) => event.agent_id === agent.id)}
            />
          ))}
        </aside>

        <main className="col-span-6 min-h-0 min-w-0 overflow-hidden">
          <div className="h-full flex flex-col gap-3">
            <div className="shrink-0 grid grid-cols-2 gap-3">
              <Card>
                <Timeline
                  events={visibleEvents}
                  selectedTick={selectedTick}
                  onSelectTick={setSelectedTick}
                />
              </Card>
              <RelationshipGraph
                agents={selectedAgents}
                events={visibleEvents}
              />
            </div>
            <Card className="flex-1 min-h-0 overflow-hidden flex flex-col">
              <EventFeed events={visibleEvents} selectedTick={selectedTick} />
            </Card>
          </div>
        </main>

        <aside className="col-span-3 min-h-0 min-w-0 overflow-hidden">
          <Card className="h-full min-h-0 flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h2 className="font-mono text-sm text-text-primary">
                THOUGHT STREAM
              </h2>
            </div>
            <ThoughtStream events={visibleEvents} className="flex-1 min-h-0" />
          </Card>
        </aside>
      </div>

      <div className="shrink-0 border-t border-border bg-bg-secondary px-4 py-2 flex items-center gap-4">
        <span className="text-xs font-mono text-text-secondary">
          {selectedTick === null ? "全部 Tick" : `Tick #${selectedTick}`}
        </span>
        <button
          type="button"
          onClick={() => setSelectedTick(null)}
          className="text-xs font-mono text-accent-blue hover:text-accent-blue/80 transition-colors"
        >
          清除筛选
        </button>
        <span className="ml-auto text-xs font-mono text-text-secondary">
          {visibleEvents.length} events · {selectedAgents.length} agents
        </span>
      </div>
    </div>
  );
}

function useAvailableAgents(): AgentResponse[] {
  const createdAgents = useAgentStore((state) => state.agents);

  return useMemo(() => {
    const byId = new Map<string, AgentResponse>();
    [...MOCK_AGENTS, ...createdAgents].forEach((agent) => {
      byId.set(agent.id, agent);
    });
    return [...byId.values()];
  }, [createdAgents]);
}

/** Mock 事件播放器，独立于 Step 18 的通用 SSE hook。 */
function useSandboxMockSSE(speed: SandboxSpeed) {
  const [events, setEvents] = useState<SSEEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const indexRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setConnected(false);
  }, []);

  const schedule = useCallback(() => {
    timerRef.current = setInterval(() => {
      const event = MOCK_SANDBOX_EVENTS[indexRef.current];
      if (!event) {
        stop();
        return;
      }
      setEvents((current) => [...current, event]);
      indexRef.current += 1;
    }, 2000 / speed);
    setConnected(true);
  }, [speed, stop]);

  useEffect(() => {
    if (!timerRef.current) return;
    clearInterval(timerRef.current);
    timerRef.current = null;
    schedule();
  }, [schedule]);

  const start = useCallback(() => {
    stop();
    setEvents([]);
    indexRef.current = 0;
    schedule();
  }, [schedule, stop]);

  const resume = useCallback(() => {
    if (!timerRef.current && indexRef.current < MOCK_SANDBOX_EVENTS.length) {
      schedule();
    }
  }, [schedule]);

  const clear = useCallback(() => setEvents([]), []);

  useEffect(() => stop, [stop]);

  return { events, connected, start, resume, stop, clear };
}

function getCurrentTick(events: SSEEvent[]): number {
  return events.reduce((current, event) => Math.max(current, event.tick), 0);
}
