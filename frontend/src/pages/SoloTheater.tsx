import { useState, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAgents } from "../api/agents";
import type { GoalStatus } from "../types/agent";
import {
  useCreateWorld,
  useStartWorld,
  usePauseWorld,
  useResetWorld,
  useDeleteWorld,
  useWorlds,
  useFinishWorld,
} from "../api/worlds";
import { useScenarios } from "../api/scenarios";
import ScenarioEditor from "../components/world/ScenarioEditor";
import { useSSE } from "../hooks/useSSE";
import AgentStatusPanel from "../components/world/AgentStatusPanel";
import ThoughtStream from "../components/agent/ThoughtStream";
import GoalPanel from "../components/agent/GoalPanel";
import Card from "../components/shared/Card";
import StatusDot from "../components/shared/StatusDot";

/* ================================================================
   M2 单人剧场——SoloTheater
   P0：场景投放 + 思维流实时展示

   两阶段交互：
   1. 投放前——选择 Agent + 场景 → 点击「开始投放」
   2. 投放后——三栏布局：左(Agent状态) 中(思维流) 右(事件统计)
   ================================================================ */

export default function SoloTheater() {
  const location = useLocation();
  const navigate = useNavigate();
  const initialScenario = (location.state as { scenario?: string } | null)?.scenario;
  // Agent 列表：从后端拉取（铸造厂创建的真 Agent）
  const { data: agents = [], isLoading: agentsLoading } = useAgents();
  const { data: scenarios = [] } = useScenarios();

  const [selectedAgentId, setSelectedAgentId] = useState<string>(
    agents[0]?.id ?? "",
  );
  const [selectedScenario, setSelectedScenario] = useState(initialScenario ?? "期末周");
  const [showEditor, setShowEditor] = useState(false);
  const [worldId, setWorldId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  // API Mutations
  const createWorld = useCreateWorld();
  const startWorld = useStartWorld();
  const pauseWorld = usePauseWorld();
  const resetWorld = useResetWorld();
  const deleteWorld = useDeleteWorld();
  const finishWorld = useFinishWorld();
  const { data: allWorlds = [] } = useWorlds();
  // BUG-014: SoloTheater 只展示 solo 类型的 World
  const worlds = useMemo(() => allWorlds.filter((w) => w.world_type === "solo"), [allWorlds]);

  // 真 SSE 推流——worldId 变化时自动连接/断开
  const { events, connected, disconnect, clear } = useSSE(worldId);

  const selectedAgent = useMemo(
    () => agents.find((a) => a.id === selectedAgentId),
    [agents, selectedAgentId],
  );

  // 从 SSE goal_update 事件中提取动态 goal 状态
  const goalOverrides = useMemo(() => {
    const map = new Map<string, { status: GoalStatus; progress: number }>();
    for (const e of events) {
      if (e.type === "goal_update" && e.data?.goal_id) {
        const s = e.data.status as string;
        const valid: GoalStatus[] = ["active", "in_progress", "achieved", "abandoned"];
        map.set(e.data.goal_id as string, {
          status: valid.includes(s as GoalStatus) ? (s as GoalStatus) : "active",
          progress: (e.data.progress as number) ?? 0,
        });
      }
    }
    return map;
  }, [events]);

  // 合并静态 Agent goals + SSE 动态覆盖
  const enrichedAgent = useMemo(() => {
    if (!selectedAgent) return selectedAgent;
    if (goalOverrides.size === 0) return selectedAgent;
    return {
      ...selectedAgent,
      goals: selectedAgent.goals.map((g) => {
        const override = goalOverrides.get(g.id);
        return override ? { ...g, ...override } : g;
      }),
    };
  }, [selectedAgent, goalOverrides]);

  // 统计
  const currentTick = events.length > 0 ? events[events.length - 1].tick : 0;
  const thoughtCount = events.filter(
    (e) => e.type === "thought_stream",
  ).length;
  const actionCount = events.filter(
    (e) => e.type === "agent_action",
  ).length;
  const messageCount = events.filter(
    (e) => e.type === "agent_message",
  ).length;

  /** 开始投放：创建 World → 启动 → 自动连 SSE */
  const handleStart = async () => {
    if (!selectedAgent) return;

    // BUG-010: 新建前清空上次残留事件
    clear();

    try {
      // 1. 创建 World
      const world = await createWorld.mutateAsync({
        name: `单人剧场 - ${selectedAgent.name}`,
        world_type: "solo",
        scenario: { name: selectedScenario },
        agent_ids: [selectedAgent.id],
      });

      // 2. 启动模拟
      await startWorld.mutateAsync(world.id);

      // 3. 设置 worldId → useSSE 自动连接
      setWorldId(world.id);
      setIsRunning(true);
      setIsPaused(false);
    } catch (err) {
      console.error("启动失败:", err);
    }
  };

  /** 暂停 */
  const handlePause = async () => {
    if (!worldId) return;
    try {
      await pauseWorld.mutateAsync(worldId);
      setIsPaused(true);
    } catch (e) {
      console.error("暂停失败:", e);
    }
  };

  /** 继续（paused→running） */
  const handleResume = async () => {
    if (!worldId || startWorld.isPending) return;
    try {
      await startWorld.mutateAsync(worldId);
      setIsPaused(false);
    } catch (e) {
      console.error("继续失败:", e);
    }
  };

  /** 从 World 列表恢复——paused 状态读实际 world.status */
  const handleResumeWorld = (wid: string) => {
    const world = worlds.find((w) => w.id === wid);
    if (!world) return;
    setWorldId(wid);
    setSelectedScenario(world.scenario.name ?? "期末周");
    if (world.agent_ids.length > 0) {
      setSelectedAgentId(world.agent_ids[0]!);
    }
    setIsRunning(true);
    setIsPaused(world.status === "paused");
  };

  /** 删除 World */
  const handleDeleteWorld = async (wid: string) => {
    if (!confirm("确定删除此实验？")) return;
    try {
      await deleteWorld.mutateAsync(wid);
    } catch (e) {
      console.error("删除失败:", e);
    }
  };

  /** 返回列表——先暂停后端，等 tick 完成，再切前端。 */
  const handleBack = async () => {
    const wid = worldId;
    if (wid) {
      try {
        await pauseWorld.mutateAsync(worldId);
        await new Promise(r => setTimeout(r, 2000));
      } catch (e) {
        console.error("返回暂停失败:", e);
      }
      disconnect();
    }
    setIsRunning(false);
    setIsPaused(false);
    setWorldId(null);
  };

  /** 重置：调后端 reset → 断开 SSE → 清空前端状态（数据不保留） */
  const handleReset = async () => {
    if (worldId) {
      try {
        await resetWorld.mutateAsync(worldId);
      } catch (err) {
        console.error("重置后端失败:", err);
      }
    }
    disconnect();
    clear();
    setWorldId(null);
    setIsRunning(false);
    setIsPaused(false);
  };

  /** 结束：调后端 finish → 标记 finished，保留 tick/事件供回放 */
  const handleFinish = async () => {
    if (worldId) {
      try {
        await finishWorld.mutateAsync(worldId);
      } catch (err) {
        console.error("结束失败:", err);
      }
    }
    disconnect();
    setWorldId(null);
    setIsRunning(false);
    setIsPaused(false);
  };

  // ── 投放前：设置区 ──
  if (!isRunning) {
    return (
      <div className="p-6 max-w-5xl mx-auto animate-fade-in">
        <div className="mb-6">
          <h1 className="text-xl font-mono text-accent-green">
            M2 单人剧场
          </h1>
          <p className="text-sm text-text-secondary font-mono mt-1">
            选一个 Agent 投放到场景中，观察它的独白与决策
          </p>
        </div>

        {/* 已有 World 列表 */}
        {worlds.length > 0 && (
          <Card className="mb-6">
            <h3 className="text-sm font-mono text-text-secondary mb-3">
              🌍 已有实验 · {worlds.length} 个
            </h3>
            <div className="space-y-1.5">
              {worlds.map((world) => {
                const statusIcon =
                  world.status === "running" ? "🟢" :
                  world.status === "paused" ? "⏸️" : "⏹️";
                const canResume = world.status === "running" || world.status === "paused";
                return (
                  <div
                    key={world.id}
                    className="flex items-center gap-2 px-3 py-2 rounded border border-border bg-bg-secondary/60 text-sm"
                  >
                    <span className="text-xs">{statusIcon}</span>
                    <span className="font-mono text-text-primary flex-1 truncate">
                      {world.name}
                    </span>
                    <span className="text-xs font-mono text-text-secondary/60">
                      T{world.current_tick}
                    </span>
                    <span className={`text-xs font-mono ${
                      world.status === "running" ? "text-accent-green" :
                      world.status === "paused" ? "text-accent-orange" :
                      "text-text-secondary/50"
                    }`}>
                      {world.status === "running" ? "运行中" :
                       world.status === "paused" ? "已暂停" : "已完成"}
                    </span>
                    {canResume && (
                      <button
                        onClick={() => handleResumeWorld(world.id)}
                        className="text-xs font-mono px-2 py-0.5 rounded bg-accent-green/10 border border-accent-green/30 text-accent-green hover:bg-accent-green/20 transition-colors"
                      >
                        继续
                      </button>
                    )}
                    {world.status === "finished" && (
                      <button
                        type="button"
                        onClick={() => navigate(`/archive?replay=${encodeURIComponent(world.id)}`)}
                        className="text-xs font-mono px-2 py-0.5 rounded bg-accent-blue/10 border border-accent-blue/30 text-accent-blue hover:bg-accent-blue/20 transition-colors"
                      >
                        查看回放
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteWorld(world.id)}
                      disabled={world.status === "running" || deleteWorld.isPending}
                      className="text-xs font-mono text-text-secondary/40 hover:text-accent-red disabled:opacity-20 disabled:cursor-not-allowed transition-colors ml-1"
                      title={world.status === "running" ? "运行中无法删除" : "删除"}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* 新建投放 */}
        <h2 className="text-sm font-mono text-text-secondary uppercase tracking-wider mb-3">
          ✨ 新建投放
        </h2>

        {/* Agent 选择 */}
        <Card className="mb-4">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-sm font-mono text-text-secondary">选择 Agent</h2>
            {agentsLoading && <span className="text-xs text-text-secondary/60">加载中...</span>}
          </div>
        <div className="grid grid-cols-3 gap-3">
            {agents.length === 0 && !agentsLoading && (
              <p className="col-span-3 text-sm text-text-secondary py-4 text-center">
                暂无 Agent，请先去「铸造厂」创建
              </p>
            )}
            {agents.map((agent) => {
              const isSelected = agent.id === selectedAgentId;
              return (
                <button
                  key={agent.id}
                  onClick={() => setSelectedAgentId(agent.id)}
                  className={`
                    text-left p-3 rounded-lg border transition-colors
                    ${
                      isSelected
                        ? "border-accent-green/60 bg-accent-green/10"
                        : "border-border bg-bg-card hover:border-accent-green/30"
                    }
                  `}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-full bg-accent-green/10 border border-accent-green/30 flex items-center justify-center text-lg select-none shrink-0">
                      {agent.name.charAt(0)}
                    </div>
                    <span className="font-mono text-sm text-text-primary">
                      {agent.name}
                    </span>
                    <span className="ml-auto text-xs text-text-secondary">
                      {isSelected ? "已选" : "未选"}
                    </span>
                  </div>
                  <p className="text-xs text-text-secondary mt-2">
                    {agent.persona.mbti}
                  </p>
                </button>
              );
            })}
          </div>
        </Card>

        {/* 场景选择 */}
        <Card className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <label className="text-sm text-text-secondary font-mono">
              选择场景
            </label>
            <button
              type="button"
              onClick={() => setShowEditor(true)}
              className="text-xs font-mono text-accent-green hover:text-accent-green/80 transition-colors"
            >
              ＋ 新建场景
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {scenarios.map((s) => {
              const isSelected = s.name === selectedScenario;
              return (
                <button
                  key={s.name}
                  onClick={() => setSelectedScenario(s.name ?? "")}
                  className={`
                    text-center p-3 rounded-lg border transition-colors
                    ${
                      isSelected
                        ? "border-accent-blue/60 bg-accent-blue/5 ring-1 ring-accent-blue/20"
                        : "border-border bg-bg-card hover:border-text-secondary/40"
                    }
                  `}
                >
                  <span className="text-2xl block mb-1">{s.id ? "📝" : "📚"}</span>
                  <p className="text-sm font-mono text-text-primary">
                    {s.name}
                  </p>
                  <p className="text-xs text-text-secondary mt-0.5">
                    {s.description}
                  </p>
                  <p className="text-xs text-text-secondary/50 mt-1 font-mono">
                    Tick {s.time_range}
                  </p>
                </button>
              );
            })}
          </div>
        </Card>

        {/* 开始按钮 */}
        <button
          onClick={handleStart}
          disabled={!selectedAgent || createWorld.isPending || startWorld.isPending}
          className="
            w-full py-3 text-sm font-mono rounded-lg
            bg-accent-green/10 border border-accent-green/30
            text-accent-green hover:bg-accent-green/20
            disabled:opacity-30 disabled:cursor-not-allowed
            transition-all duration-200
          "
        >
          {createWorld.isPending || startWorld.isPending ? "启动中..." : "🎬 开始投放"}
        </button>

        {showEditor && <ScenarioEditor onClose={() => setShowEditor(false)} />}
      </div>
    );
  }

  // ── 投放后：三栏运行区 ──
  return (
    <div className="h-full flex flex-col animate-fade-in">
      {/* 顶栏 */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-border bg-bg-secondary">
        <span className="text-2xl select-none">
          {scenarios.find((s) => s.name === selectedScenario)?.id ? "📝" : "📚"}
        </span>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-mono text-text-primary">
            {selectedAgent?.name} · {selectedScenario}
          </h1>
          <p className="text-xs text-text-secondary font-mono">
            Tick #{currentTick} · {events.length} 条事件
          </p>
        </div>
        <StatusDot status={connected ? "active" : "idle"} />
        <button
          onClick={handleBack}
          className="px-2 py-1 text-xs font-mono rounded bg-bg-card border border-border text-text-secondary hover:text-text-primary transition-colors"
        >
          ← 列表
        </button>
        <div className="flex gap-2">
          {isPaused || (events.length > 0 && !connected) ? (
            <button
              onClick={handleResume}
              disabled={startWorld.isPending}
              className="
                px-3 py-1 text-sm font-mono rounded
                bg-accent-green/10 border border-accent-green/30
                text-accent-green hover:bg-accent-green/20
                transition-colors
                disabled:opacity-50
              "
            >
              {startWorld.isPending ? "⏳" : "▶"} 继续
            </button>
          ) : (
            <button
              onClick={handlePause}
              disabled={pauseWorld.isPending}
              className="
                px-3 py-1 text-sm font-mono rounded
                bg-accent-orange/10 border border-accent-orange/30
                text-accent-orange hover:bg-accent-orange/20
                transition-colors
                disabled:opacity-50
              "
            >
              ⏸ 暂停
            </button>
          )}
          <button
            onClick={handleReset}
            className="
              px-3 py-1 text-sm font-mono rounded
              bg-bg-card border border-border
              text-text-secondary hover:text-text-primary
              transition-colors
            "
          >
            ↺ 重置
          </button>
          <button
            onClick={handleFinish}
            disabled={finishWorld.isPending}
            className="
              px-3 py-1 text-sm font-mono rounded
              bg-accent-red/10 border border-accent-red/30
              text-accent-red hover:bg-accent-red/20
              transition-colors
              disabled:opacity-50
            "
          >
            ⏹ 结束
          </button>
        </div>
      </div>

      {/* 三栏主体 */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* 左栏：Agent 状态面板 + 目标 */}
        <div className="w-[260px] shrink-0 border-r border-border overflow-y-auto p-3 space-y-3">
          {enrichedAgent && (
            <>
              <AgentStatusPanel agent={enrichedAgent} events={events} />
              <Card>
                <h3 className="text-sm font-mono text-text-secondary mb-2">
                  🎯 目标
                </h3>
                <GoalPanel agent={enrichedAgent} />
              </Card>
            </>
          )}
        </div>

        {/* 中栏：思维流 */}
        <ThoughtStream events={events} className="flex-1 min-h-0" />

        {/* 右栏：事件统计 */}
        <div className="w-[200px] shrink-0 border-l border-border overflow-y-auto p-3">
          <Card>
            <h3 className="text-sm font-mono text-text-secondary mb-3">
              📊 事件统计
            </h3>
            <div className="space-y-3">
              <StatRow
                icon="⏰"
                label="当前 Tick"
                value={`#${currentTick}`}
              />
              <StatRow
                icon="💭"
                label="思考"
                value={String(thoughtCount)}
                color="text-accent-blue"
              />
              <StatRow
                icon="💬"
                label="对话"
                value={String(messageCount)}
                color="text-accent-purple"
              />
              <StatRow
                icon="⚡"
                label="行动"
                value={String(actionCount)}
                color="text-accent-green"
              />
              <StatRow
                icon="📋"
                label="总事件"
                value={String(events.length)}
              />
            </div>
          </Card>

          {/* 场景信息 */}
          <Card className="mt-3">
            <h3 className="text-sm font-mono text-text-secondary mb-2">
              🌍 场景
            </h3>
            <p className="text-sm text-text-primary font-mono">
              {selectedScenario}
            </p>
            <p className="text-xs text-text-secondary mt-1">
              {
                scenarios.find((s) => s.name === selectedScenario)
                  ?.description
              }
            </p>
          </Card>

          {/* 人格画像摘要 */}
          {selectedAgent && (
            <Card className="mt-3">
              <h3 className="text-sm font-mono text-text-secondary mb-2">
                🧠 人格画像
              </h3>
              <p className="text-sm text-text-primary leading-relaxed line-clamp-6">
                {selectedAgent.persona.narrative}
              </p>
            </Card>
          )}
        </div>
      </div>

      {showEditor && <ScenarioEditor onClose={() => setShowEditor(false)} />}
    </div>
  );
}

/* ── 统计行子组件 ── */
function StatRow({
  icon,
  label,
  value,
  color = "text-text-primary",
}: {
  icon: string;
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-text-secondary">
        {icon} {label}
      </span>
      <span className={`font-mono ${color}`}>{value}</span>
    </div>
  );
}
