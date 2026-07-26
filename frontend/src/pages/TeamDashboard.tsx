import { useState, useCallback, useMemo, useEffect } from "react";
import { useAgents } from "../api/agents";
import { useTeams, useCreateTeam, useDeleteTeam, useSuggestRoles, useExecuteTeam, useTeamPlan } from "../api/teams";
import { usePauseWorld, useStartWorld } from "../api/worlds";
import { useSSE } from "../hooks/useSSE";
import type { TeamRole, SuggestedRole } from "../types/team";
import Card from "../components/shared/Card";
import Badge from "../components/shared/Badge";
import EmptyState from "../components/shared/EmptyState";
import TaskKanban from "./team/TaskKanban";
import LiveChat from "./team/LiveChat";
import HealthPanel from "./team/HealthPanel";

/* ================================================================
   Step 51–53 — M9 Agent Team 仪表盘
   Team 创建 + 列表 + 看板（Kanban + 实时对话 + 健康面板）
   ================================================================ */

type ViewTab = "kanban" | "chat" | "health";

export default function TeamDashboard() {
  const { data: agents = [] } = useAgents();
  const { data: teams = [], isLoading: teamsLoading } = useTeams();
  const createTeam = useCreateTeam();
  const deleteTeam = useDeleteTeam();
  const executeTeam = useExecuteTeam();

  // 看板状态
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  const [viewTab, setViewTab] = useState<ViewTab>("kanban");
  const { data: teamPlan } = useTeamPlan(activeTeamId);

  // SSE + World 控制
  const worldId = teamPlan?.world_id ?? null;
  const { events, connected, disconnect, clear } = useSSE(worldId);

  // 从 SSE 实时提取 plan_updated / coordinator_nudge / report_ready
  const livePlan = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].type === "plan_updated" && events[i].data) {
        return events[i].data as { steps: typeof teamPlan extends { steps: infer S } ? S : never; progress_pct: number; all_done: boolean };
      }
    }
    return null;
  }, [events]);

  const coordinatorMsg = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].type === "coordinator_nudge") {
        return events[i].content ?? null;
      }
    }
    return null;
  }, [events]);

  const report = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].type === "report_ready") {
        return events[i].data as { title: string; content: string };
      }
    }
    return null;
  }, [events]);

  // 优先用 SSE 实时数据，fallback 到轮询
  const steps = livePlan?.steps ?? teamPlan?.steps ?? [];
  const progressPct = livePlan?.progress_pct ?? teamPlan?.progress_pct ?? 0;

  // 完成时自动切到看板（展示报告）
  useEffect(() => {
    if (report) setViewTab("kanban");
  }, [report]);
  const pauseWorld = usePauseWorld();
  const startWorld = useStartWorld();
  const [isPaused, setIsPaused] = useState(false);

  const agentNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const a of agents) map[a.id] = a.name;
    return map;
  }, [agents]);

  // 创建表单
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [roles, setRoles] = useState<TeamRole[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 角色推荐
  const suggestRoles = useSuggestRoles();

  const canCreate =
    name.trim().length > 0 &&
    selectedIds.size > 0 &&
    !createTeam.isPending;

  const handleToggleAgent = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    // 选人变化时清空旧角色推荐
    setRoles([]);
  }, []);

  const handleSuggestRoles = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setErrorMsg(null);
    try {
      const result = await suggestRoles.mutateAsync([...selectedIds]);
      const mapped: TeamRole[] = result.map((r: SuggestedRole) => ({
        agent_id: r.agent_id,
        role: r.role,
        reason: r.reason,
      }));
      setRoles(mapped);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "角色推荐失败");
    }
  }, [selectedIds, suggestRoles]);

  const handleRoleChange = useCallback((agentId: string, newRole: string) => {
    setRoles((prev) =>
      prev.map((r) => (r.agent_id === agentId ? { ...r, role: newRole } : r)),
    );
  }, []);

  const handleCreate = useCallback(async () => {
    if (!canCreate) return;
    setErrorMsg(null);
    try {
      await createTeam.mutateAsync({
        name: name.trim(),
        description: description.trim(),
        agent_ids: [...selectedIds],
        roles,
      });
      // 重置表单
      setName("");
      setDescription("");
      setSelectedIds(new Set());
      setRoles([]);
      setShowCreate(false);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "创建失败");
    }
  }, [canCreate, name, description, selectedIds, roles, createTeam]);

  const handleDelete = useCallback(
    async (id: string) => {
      if (!window.confirm("确定删除这个 Team？Agent 不会被删除。")) return;
      await deleteTeam.mutateAsync(id);
    },
    [deleteTeam],
  );

  const handleExecute = useCallback(
    async (id: string) => {
      try {
        clear(); // BUG-010: 新执行前清空上次残留事件
        const plan = await executeTeam.mutateAsync(id);
        setActiveTeamId(id);
        setViewTab("kanban");
        setIsPaused(false);
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : "执行失败");
      }
    },
    [executeTeam, clear],
  );

  const handleBackToList = useCallback(() => {
    setActiveTeamId(null);
    setIsPaused(false);
    disconnect();
  }, [disconnect]);

  const handlePause = useCallback(async () => {
    if (!worldId) return;
    try { await pauseWorld.mutateAsync(worldId); } catch { return; }
    setIsPaused(true);
  }, [worldId, pauseWorld]);

  const handleResume = useCallback(async () => {
    if (!worldId) return;
    try { await startWorld.mutateAsync(worldId); } catch { return; }
    setIsPaused(false);
  }, [worldId, startWorld]);

  // 角色预览组件
  const RolePreview = roles.length > 0 && (
    <div className="mb-4 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono text-text-secondary">角色分配预览</span>
        <span className="text-xs text-text-secondary/40 font-mono">
          （点击角色名可修改）
        </span>
      </div>
      {roles.map((r) => {
        const agent = agents.find((a) => a.id === r.agent_id);
        return (
          <div
            key={r.agent_id}
            className="flex items-center gap-3 bg-bg-primary/60 border border-border rounded px-3 py-2"
          >
            <span className="w-6 h-6 rounded-full bg-accent-green/10 border border-accent-green/30 flex items-center justify-center text-xs shrink-0">
              {agent?.name?.charAt(0) ?? "?"}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-mono text-text-primary truncate">
                {agent?.name ?? r.agent_id.slice(0, 8)}
              </p>
              <p className="text-xs text-text-secondary/60 truncate">{r.reason}</p>
            </div>
            <input
              type="text"
              value={r.role}
              onChange={(e) => handleRoleChange(r.agent_id, e.target.value)}
              className="w-24 text-xs font-mono bg-bg-secondary border border-border rounded px-2 py-1 text-accent-orange focus:outline-none focus:border-accent-orange"
            />
          </div>
        );
      })}
    </div>
  );

  // ── 看板视图 ──────────────────────────────────────────────────
  const activeTeam = teams.find((t) => t.id === activeTeamId);
  const doneSteps = steps.filter((s) => s.status === "done").length;

  return (
    <div className="h-full overflow-y-auto p-6 animate-fade-in">
      {/* 看板模式 */}
      {activeTeamId && activeTeam ? (
        <div className="h-full flex flex-col">
          <div className="flex items-center gap-3 mb-4 shrink-0">
            <button
              type="button"
              onClick={handleBackToList}
              className="text-xs font-mono text-text-secondary hover:text-text-primary"
            >
              ← 返回列表
            </button>
            <h1 className="text-lg font-mono text-accent-orange">{activeTeam.name}</h1>
            <Badge label={isPaused ? "已暂停" : "执行中"} variant="P1" />
            <button
              type="button"
              onClick={isPaused ? handleResume : handlePause}
              className={`ml-auto px-3 py-1 text-xs font-mono rounded border transition-colors ${
                isPaused
                  ? "border-accent-green/60 text-accent-green hover:bg-accent-green/10"
                  : "border-accent-orange/60 text-accent-orange hover:bg-accent-orange/10"
              }`}
            >
              {isPaused ? "▶ 继续" : "⏸ 暂停"}
            </button>
          </div>

          {/* Tab 栏 */}
          <div className="flex gap-2 mb-3 shrink-0">
            {([
              ["kanban", "📋 任务看板"],
              ["chat", "💬 实时对话"],
              ["health", "📊 协作分析"],
            ] as [ViewTab, string][]).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setViewTab(key)}
                className={`px-3 py-1.5 text-xs font-mono rounded border transition-colors ${
                  viewTab === key
                    ? "border-accent-orange/60 bg-accent-orange/10 text-accent-orange"
                    : "border-border text-text-secondary hover:border-text-secondary/40"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* 面板内容 */}
          <div className="flex-1 min-h-0">
            {viewTab === "kanban" && (
              report ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">📄</span>
                    <h3 className="text-sm font-mono text-accent-green">{report.title as string}</h3>
                    <button
                      type="button"
                      onClick={() => {
                        const text = `# ${report.title}\n\n${report.content}`;
                        const blob = new Blob([text as string], { type: "text/markdown;charset=utf-8" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url; a.download = "team-report.md"; a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="ml-auto px-3 py-1 text-xs font-mono rounded border border-border text-text-secondary hover:border-accent-green hover:text-accent-green transition-colors"
                    >
                      ⬇ 下载报告
                    </button>
                  </div>
                  <Card className="p-4 max-h-[60vh] overflow-y-auto">
                    <div className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap font-mono">
                      {report.content as string}
                    </div>
                  </Card>
                </div>
              ) : (
                <TaskKanban steps={steps} agentNames={agentNames} coordinatorMsg={coordinatorMsg} />
              )
            )}
            {viewTab === "chat" && (
              <LiveChat events={events} connected={connected} isPaused={isPaused} />
            )}
            {viewTab === "health" && (
              <HealthPanel
                steps={steps}
                progressPct={progressPct}
                coordinatorMsg={coordinatorMsg}
                reportReady={!!report}
                agentNames={agentNames}
              />
            )}
          </div>
        </div>
      ) : (
        <>
          {/* 标题 */}
          <h1 className="text-2xl font-mono text-accent-orange mb-1">
            M9 Agent Team
      </h1>
      <p className="text-sm text-text-secondary font-mono mb-6">
        把 Agent 组成团队，协作完成产品设计、市场调研、代码开发
      </p>

      {/* 操作栏 */}
      <div className="mb-6">
        {!showCreate ? (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="px-5 py-2 rounded-lg bg-accent-orange text-bg-primary font-mono text-sm hover:bg-accent-orange/90 transition-colors"
          >
            + 新建 Team
          </button>
        ) : (
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-lg select-none">🏗️</span>
              <h2 className="text-sm font-mono text-text-primary">新建 Team</h2>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="ml-auto text-xs font-mono text-text-secondary hover:text-text-primary"
              >
                收起
              </button>
            </div>

            {/* 名称 */}
            <div className="mb-3">
              <label className="text-xs font-mono text-text-secondary mb-1 block">
                Team 名称
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：校园社交 App 产品团队"
                className="w-full bg-bg-secondary border border-border rounded px-3 py-2 text-sm font-mono text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:border-accent-orange"
              />
            </div>

            {/* 描述 */}
            <div className="mb-4">
              <label className="text-xs font-mono text-text-secondary mb-1 block">
                任务描述（想要这个 Team 做什么？）
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="例如：设计一款面向大学生的校园社交 App，包含课程表共享、二手交易、组队学习功能"
                rows={2}
                className="w-full bg-bg-secondary border border-border rounded px-3 py-2 text-sm font-mono text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:border-accent-orange resize-none"
              />
            </div>

            {/* 选择 Agent */}
            <div className="mb-4">
              <label className="text-xs font-mono text-text-secondary mb-2 block">
                选择成员（{selectedIds.size} 个已选）
              </label>
              {agents.length === 0 ? (
                <p className="text-xs font-mono text-text-secondary/60">
                  暂无可选 Agent——先去铸造厂创建几个吧
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                  {agents.map((agent) => {
                    const isSelected = selectedIds.has(agent.id);
                    return (
                      <button
                        key={agent.id}
                        type="button"
                        onClick={() => handleToggleAgent(agent.id)}
                        className={`
                          flex items-center gap-2 px-3 py-2 rounded border text-xs font-mono text-left transition-colors
                          ${isSelected
                            ? "border-accent-orange/60 bg-accent-orange/10 text-accent-orange"
                            : "border-border bg-bg-secondary/60 text-text-secondary hover:border-text-secondary/40"
                          }
                        `.trim()}
                      >
                        <span className="w-5 h-5 rounded-full bg-accent-green/10 border border-accent-green/30 flex items-center justify-center text-xs shrink-0">
                          {agent.name.charAt(0)}
                        </span>
                        <span className="flex-1 truncate">{agent.name}</span>
                        <span className="text-text-secondary/50 shrink-0">
                          {agent.persona.mbti}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 角色推荐 */}
            <div className="mb-4">
              <button
                type="button"
                onClick={handleSuggestRoles}
                disabled={selectedIds.size === 0 || suggestRoles.isPending}
                className={`
                  px-4 py-1.5 rounded-lg font-mono text-xs transition-colors
                  ${selectedIds.size === 0
                    ? "bg-bg-secondary border border-border text-text-secondary/40 cursor-not-allowed"
                    : "bg-bg-secondary border border-border text-text-secondary hover:border-accent-orange hover:text-accent-orange"
                  }
                `.trim()}
              >
                {suggestRoles.isPending ? "分析中…" : "🤖 智能推荐角色"}
              </button>
              {suggestRoles.isError && (
                <p className="text-xs text-accent-red font-mono mt-1">
                  推荐失败，可手动填写角色
                </p>
              )}
            </div>

            {/* 角色预览 */}
            {RolePreview}

            {/* 错误 + 创建 */}
            {errorMsg && (
              <p className="text-xs font-mono text-accent-red mb-3">{errorMsg}</p>
            )}
            <button
              type="button"
              disabled={!canCreate}
              onClick={handleCreate}
              className={`
                px-6 py-2 rounded-lg font-mono text-sm transition-all
                ${canCreate
                  ? "bg-accent-orange text-bg-primary hover:bg-accent-orange/90 cursor-pointer"
                  : "bg-bg-secondary border border-border text-text-secondary/40 cursor-not-allowed"
                }
              `.trim()}
            >
              {createTeam.isPending ? "创建中…" : "创建 Team"}
            </button>
          </Card>
        )}
      </div>

      {/* Team 列表 */}
      <div>
        {teamsLoading ? (
          <p className="text-xs font-mono text-text-secondary/60">加载中…</p>
        ) : teams.length === 0 ? (
          <EmptyState
            title="还没有 Team"
            description="创建你的第一个 Agent 团队，让 AI 协作完成任务"
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {teams.map((team) => {
              const memberNames = team.agent_ids
                .map((aid) => agents.find((a) => a.id === aid)?.name ?? aid.slice(0, 6))
                .join("、");
              const roleSummary = team.roles
                .slice(0, 3)
                .map((r) => r.role)
                .join(" · ");
              return (
                <Card key={team.id}>
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="text-sm font-mono text-text-primary">
                        {team.name}
                      </h3>
                      <p className="text-xs text-text-secondary/60 mt-0.5 line-clamp-1">
                        {team.description || "暂无描述"}
                      </p>
                    </div>
                    <Badge
                      label={team.status === "idle" ? "待执行" : team.status}
                      variant={team.status === "idle" ? "P2" : "P1"}
                    />
                  </div>
                  <div className="text-xs font-mono text-text-secondary/60 space-y-0.5">
                    <p>👥 {memberNames}</p>
                    {roleSummary && <p>🎯 {roleSummary}</p>}
                    <p className="text-text-secondary/40">
                      创建于 {team.created_at.slice(0, 10)}
                    </p>
                  </div>
                  <div className="flex gap-2 mt-3 pt-3 border-t border-border">
                    {team.status === "idle" && (
                      <button
                        type="button"
                        onClick={() => handleExecute(team.id)}
                        disabled={executeTeam.isPending}
                        className="text-xs font-mono text-accent-orange hover:text-accent-orange/80 transition-colors"
                      >
                        {executeTeam.isPending ? "启动中…" : "▶ 执行"}
                      </button>
                    )}
                    {team.status === "executing" && (
                      <button
                        type="button"
                        onClick={() => { setActiveTeamId(team.id); setViewTab("kanban"); }}
                        className="text-xs font-mono text-accent-green hover:text-accent-green/80 transition-colors"
                      >
                        ● 执行中 — 进入
                      </button>
                    )}
                    {team.status === "finished" && (
                      <span className="text-xs font-mono text-text-secondary/60">
                        ✓ 已完成
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDelete(team.id)}
                      className="text-xs font-mono text-text-secondary hover:text-accent-red transition-colors ml-auto"
                    >
                      删除
                    </button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
        </>
      )}
    </div>
  );
}
