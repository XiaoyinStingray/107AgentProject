/**
 * State 8: M9 Agent Team 仪表盘（重写）。
 * 两阶段 UI：Setup（创建/列表）→ Execution（步骤时间线 + 终端 + 报告）。
 * 不再使用 WorldEngine/GroupChat——改为 Worker 原生执行。
 */
import { useState, useCallback, useEffect } from "react";
import { useAgents } from "../api/agents";
import { useTeams, useCreateTeam, useDeleteTeam, useSuggestRoles, useExecuteTeam, useTeamPlan, useEvaluateTeam } from "../api/teams";
import { usePublishTeam } from "../api/market";
import { unlock } from "../game/achievements";
import { useTeamSSE } from "../hooks/useTeamSSE";
import { useTeamStore } from "../stores/useTeamStore";
import type { TeamRole, SuggestedRole } from "../types/team";
import { teamOutcomeLabel, teamOutcomeVariant } from "../utils/teamOutcome";
import Card from "../components/shared/Card";
import Badge from "../components/shared/Badge";
import EmptyState from "../components/shared/EmptyState";
import StepTimeline from "../components/team/StepTimeline";
import RoleEvolutionBadge from "../components/team/RoleEvolutionBadge";
import TeamHistory from "../components/team/TeamHistory";
import { ReportViewer } from "../components/team/ReportViewer";
import MarketPanel from "./team/MarketPanel";
import VersusPanel from "./team/VersusPanel";
import LearningCurve from "./team/LearningCurve";

export default function TeamDashboard() {
  const { data: agents = [] } = useAgents();
  const { data: teams = [], isLoading: teamsLoading } = useTeams();
  const createTeam = useCreateTeam();
  const deleteTeam = useDeleteTeam();
  const executeTeam = useExecuteTeam();
  const evaluateTeam = useEvaluateTeam();
  const publishTeam = usePublishTeam();

  // Team 执行状态
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  const [executingTeamId, setExecutingTeamId] = useState<string | null>(null);
  const store = useTeamStore();
  const { connected, isRunning, isDone, error: sseError } = useTeamSSE(activeTeamId);
  const [evaluation, setEvaluation] = useState<string | null>(null);
  const [showMarket, setShowMarket] = useState(false);
  const [showVersus, setShowVersus] = useState(false);
  const [publishMsg, setPublishMsg] = useState<string | null>(null);

  // ── 重入恢复: 已完成/执行中的 Team 没有活跃 SSE 时，从 DB Plan 恢复状态 ──
  const activeTeam = teams.find((t) => t.id === activeTeamId);
  const { data: teamPlan } = useTeamPlan(
    activeTeamId && activeTeam && !connected ? activeTeamId : null
  );
  const agentNames = Object.fromEntries(agents.map((a) => [a.id, a.name]));

  // 从 DB Plan 恢复到 store（重入场景）
  useEffect(() => {
    if (!teamPlan || connected || isRunning || isDone) return;
    if (store.planId) return;

    const planSteps = (teamPlan.steps ?? []).map((s: any, i: number) => ({
      id: s.id ?? `s${i}`,
      title: s.title ?? `步骤 ${i + 1}`,
      assignee_id: s.assignee ?? null,
      assignee_name: (s as any).assignee_name || (s.assignee ? (agentNames[s.assignee] || s.assignee.slice(0, 8)) : "全员"),
      description: s.description ?? "",
    }));
    store.setPlanCreated({
      plan_id: teamPlan.id,
      task: teamPlan.task ?? "",
      total_steps: planSteps.length,
      steps: planSteps,
    });
    // 标记已完成步骤
    (teamPlan.steps ?? []).forEach((s: any) => {
      const sid = s.id ?? "";
      if (s.status === "done") {
        store.setStepStatus(sid, "done");
        const result = s.result ?? {};
        store.markStepDone(sid, result.files ?? [], result.output_summary ?? "", result.steps_used ?? 0, result.duration_secs ?? 0);
      } else if (s.status === "error") {
        store.markStepError(sid, (s.result ?? {}).error ?? "Worker 执行失败");
      } else {
        store.setStepStatus(sid, s.status === "active" ? "running" : "pending");
      }
    });
    // 恢复报告
    if (teamPlan.report) {
      store.setTeamDone({
        outcome: teamPlan.outcome ?? "success",
        total_duration_secs: 0,
        total_steps_completed: (teamPlan.steps ?? []).filter((s: any) => s.status === "done").length,
        failed_steps: teamPlan.failed_steps ?? (teamPlan.steps ?? []).filter((s: any) => s.status === "error").length,
        total_steps: (teamPlan.steps ?? []).length,
        steps: (teamPlan.steps ?? []).map((s: any) => ({
          step_title: s.title ?? "",
          success: s.status === "done",
          files: (s.result ?? {}).files ?? [],
          duration_secs: 0,
        })),
        report: teamPlan.report as any,
        workspace_root: "",
      });
    }
  }, [teamPlan, connected, isRunning, isDone, store.planId]);

  // ── 成就检测（useEffect，不在 render body 中执行副作用）──
  useEffect(() => {
    if (!isDone || !store.planId) return;
    const doneSet = new Set<string>(
      JSON.parse((() => { try { return localStorage.getItem("team-done-ids") || "[]"; } catch { return "[]"; } })())
    );
    if (!doneSet.has(store.planId)) {
      doneSet.add(store.planId);
      localStorage.setItem("team-done-ids", JSON.stringify([...doneSet]));
      unlock("team-task-done");
      if (doneSet.size >= 5) unlock("team-veteran");
    }
  }, [isDone, store.planId]);

  // 创建表单
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [roles, setRoles] = useState<TeamRole[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const suggestRoles = useSuggestRoles();

  const canCreate = name.trim().length > 0 && selectedIds.size > 0 && !createTeam.isPending;

  const handleToggleAgent = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    setRoles([]);
  }, []);

  const handleSuggestRoles = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setErrorMsg(null);
    try {
      const result = await suggestRoles.mutateAsync([...selectedIds]);
      setRoles(result.map((r: SuggestedRole) => ({
        agent_id: r.agent_id, role: r.role, reason: r.reason,
      })));
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "角色推荐失败");
    }
  }, [selectedIds, suggestRoles]);

  const handleRoleChange = useCallback((agentId: string, newRole: string) => {
    setRoles((prev) => prev.map((r) => (r.agent_id === agentId ? { ...r, role: newRole } : r)));
  }, []);

  const handleCreate = useCallback(async () => {
    if (!canCreate) return;
    setErrorMsg(null);
    try {
      await createTeam.mutateAsync({
        name: name.trim(), description: description.trim(),
        agent_ids: [...selectedIds], roles,
      });
      unlock("team-formed");
      setName(""); setDescription(""); setSelectedIds(new Set()); setRoles([]); setShowCreate(false);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "创建失败");
    }
  }, [canCreate, name, description, selectedIds, roles, createTeam]);

  const handleDelete = useCallback(async (id: string) => {
    if (!window.confirm("确定删除这个 Team？Agent 不会被删除。")) return;
    await deleteTeam.mutateAsync(id);
  }, [deleteTeam]);

  const handleExecute = useCallback(async (id: string) => {
    setErrorMsg(null);
    setEvaluation(null);
    store.reset();
    setExecutingTeamId(id);
    try {
      const result = await executeTeam.mutateAsync(id);
      setActiveTeamId(id);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "执行失败");
    } finally {
      setExecutingTeamId(null);
    }
  }, [executeTeam, store]);

  const handleBackToList = useCallback(() => {
    setActiveTeamId(null);
    store.reset();
  }, [store]);

  // ── 角色预览组件 ──
  const RolePreview = roles.length > 0 && (
    <div className="mb-4 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono text-text-secondary">角色分配预览</span>
        <span className="text-xs text-text-secondary/40 font-mono">（点击角色名可修改）</span>
      </div>
      {roles.map((r) => {
        const agent = agents.find((a) => a.id === r.agent_id);
        return (
          <div key={r.agent_id} className="flex items-center gap-3 bg-bg-primary/60 border border-border rounded px-3 py-2">
            <span className="w-6 h-6 rounded-full bg-accent-green/10 border border-accent-green/30 flex items-center justify-center text-xs shrink-0">
              {agent?.name?.charAt(0) ?? "?"}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-mono text-text-primary truncate">{agent?.name ?? r.agent_id.slice(0, 8)}</p>
              <p className="text-xs text-text-secondary/60 truncate">{r.reason}</p>
            </div>
            <input
              type="text" value={r.role}
              onChange={(e) => handleRoleChange(r.agent_id, e.target.value)}
              className="w-24 text-xs font-mono bg-bg-secondary border border-border rounded px-2 py-1 text-accent-orange focus:outline-none focus:border-accent-orange"
            />
          </div>
        );
      })}
    </div>
  );

  // =====================================================================
  // 执行视图
  // =====================================================================
  if (activeTeamId && activeTeam) {
    const activeOutcome = store.outcome ?? teamPlan?.outcome ?? activeTeam.outcome;
    const activeFailedSteps = store.failedSteps || teamPlan?.failed_steps || activeTeam.failed_steps || 0;
    return (
      <div className="h-full overflow-y-auto p-6 animate-fade-in">
        <div className="h-full flex flex-col">
          {/* 头部 */}
          <div className="flex items-center gap-3 mb-4 shrink-0">
            <button type="button" onClick={handleBackToList}
              className="text-xs font-mono text-text-secondary hover:text-text-primary">
              ← 返回列表
            </button>
            <h1 className="text-lg font-mono text-accent-orange">{activeTeam.name}</h1>
            <Badge
              label={isDone ? teamOutcomeLabel(activeOutcome, activeFailedSteps) : isRunning ? "执行中" : connected ? "连接中" : activeTeam.status}
              variant={isDone ? teamOutcomeVariant(activeOutcome) : "P1"}
            />
            {!isRunning && !isDone && (
              <span className="text-xs text-text-secondary/50 font-mono">等待 SSE 连接…</span>
            )}
          </div>

          {/* 学习曲线（已完成时） */}
          {isDone && activeTeam.status === "finished" && (
            <div className="mb-3"><LearningCurve teamId={activeTeamId} /></div>
          )}

          {/* sseError */}
          {sseError && (
            <div className="mb-3 px-3 py-2 rounded border border-accent-red/40 bg-accent-red/5 text-xs font-mono text-accent-red">
              {sseError}
            </div>
          )}

          {/* 内容区 */}
          <div className="flex-1 min-h-0">
            {(() => {
              const currentReport = store.report || teamPlan?.report;
              if (currentReport) {
                return (
                /* 报告视图 */
                <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="text-lg"></span>
                  <h3 className="text-sm font-mono text-accent-green">{currentReport.title}</h3>
                  <button type="button" disabled={evaluateTeam.isPending}
                    onClick={async () => {
                      try { const r = await evaluateTeam.mutateAsync(activeTeamId); setEvaluation(r.evaluation); }
                      catch { setEvaluation("评估失败，请重试"); }
                    }}
                    className="px-3 py-1 text-xs font-mono rounded border border-accent-orange/60 text-accent-orange hover:bg-accent-orange/10 transition-colors disabled:opacity-40">
                    {evaluateTeam.isPending ? "评估中…" : "📊 评估团队"}
                  </button>
                </div>
                <Card className="p-4 max-h-[55vh] overflow-y-auto">
                  <ReportViewer
                    content={currentReport.content}
                    onDownload={() => {
                    const text = `# ${currentReport.title}\n\n${currentReport.content}`;
                    const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url; a.download = "team-report.md";
                    document.body.appendChild(a); a.click(); document.body.removeChild(a);
                    setTimeout(() => URL.revokeObjectURL(url), 0);
                  }}
                />
                </Card>
                {/* 步骤产出文件下载 —— 直接从报告正文中提取内容 */}
                {Object.values(store.steps).some((s) => s.files.length > 0) && (() => {
                  const fileContentMap = new Map<string, string>();
                  const reportText = currentReport.content || "";
                  const fileBlocks = reportText.match(/#### 📄 (.+?)\n+```[\s\S]*?\n([\s\S]*?)\n```/g) || [];
                  for (const block of fileBlocks) {
                    const nameMatch = block.match(/#### 📄 (.+)/);
                    const contentMatch = block.match(/```\n([\s\S]*?)\n```/);
                    if (nameMatch && contentMatch) {
                      fileContentMap.set(nameMatch[1].trim(), contentMatch[1]);
                    }
                  }
                  return (
                  <Card className="p-4">
                    <h4 className="text-xs font-mono text-text-secondary mb-2">📁 步骤产出文件</h4>
                    <div className="space-y-1">
                      {Object.values(store.steps).map((step) =>
                        step.files.map((f) => {
                          const fname = f.includes("/") ? f.split("/").pop()! : f;
                          const content = fileContentMap.get(fname) ?? fileContentMap.get(f) ?? "";
                          return (
                          <button key={`${step.id}-${f}`}
                            type="button"
                            onClick={() => {
                              if (!content) return;
                              const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement("a");
                              a.href = url; a.download = fname;
                              document.body.appendChild(a); a.click(); document.body.removeChild(a);
                              setTimeout(() => URL.revokeObjectURL(url), 0);
                            }}
                            className="flex items-center gap-2 text-xs font-mono text-accent-green hover:text-accent-green/80 transition-colors cursor-pointer bg-transparent border-none p-0">
                            <span>📄</span>
                            <span className="truncate">{fname}</span>
                            <span className="text-text-secondary/40 shrink-0">({step.title})</span>
                          </button>
                          );
                        })
                      )}
                    </div>
                  </Card>
                  );
                })()}
                {evaluation && (
                  <Card className="p-4 border-accent-orange/40 bg-accent-orange/5">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm">📊</span>
                      <h3 className="text-xs font-mono text-accent-orange">团队评估</h3>
                    </div>
                    <div className="text-xs text-text-primary leading-relaxed whitespace-pre-wrap font-mono">{evaluation}</div>
                  </Card>
                )}
                <RoleEvolutionBadge />
                <TeamHistory teamId={activeTeamId} />
              </div>
                );
              }
              /* 执行中视图 */
              return (
              <div className="h-full">
                <StepTimeline agentNames={agentNames} />
                <div className="mt-3"><RoleEvolutionBadge /></div>
              </div>
              );
            })()}
          </div>
        </div>
      </div>
    );
  }

  // =====================================================================
  // 列表视图
  // =====================================================================
  return (
    <div className="h-full overflow-y-auto p-6 animate-fade-in">
      <h1 className="text-2xl font-mono text-accent-orange mb-1">M9 Agent Team</h1>
      <p className="text-sm text-text-secondary font-mono mb-6">
        把 Agent 组成团队，每个 Agent 按角色分工干活，产出真实文件
      </p>

      {showVersus && <div className="mb-6"><VersusPanel onClose={() => setShowVersus(false)} /></div>}
      {showMarket && <div className="mb-6"><MarketPanel /></div>}

      <div className="flex gap-2 mb-6">
        <button onClick={() => { setShowMarket((v) => !v); setShowVersus(false); }}
          className="px-3 py-1 text-xs font-mono rounded border border-border text-text-secondary hover:border-text-secondary/40">
          {showMarket ? "← 返回列表" : "📦 Team 模板"}
        </button>
        <button onClick={() => { setShowVersus((v) => !v); setShowMarket(false); }}
          className="px-3 py-1 text-xs font-mono rounded border border-border text-text-secondary hover:border-text-secondary/40">
          {showVersus ? "← 返回列表" : "⚔️ Team 对抗"}
        </button>
      </div>

      {publishMsg && (
        <div className="mb-3 px-3 py-2 rounded border border-accent-green/40 bg-accent-green/5 text-xs font-mono text-accent-green">
          {publishMsg}
        </div>
      )}
      {errorMsg && (
        <div role="alert" className="mb-3 px-3 py-2 rounded border border-accent-red/40 bg-accent-red/5 text-xs font-mono text-accent-red">
          {errorMsg}
        </div>
      )}

      {/* 操作栏 */}
      <div className="mb-6">
        {!showCreate ? (
          <button type="button" onClick={() => setShowCreate(true)}
            className="px-5 py-2 rounded-lg bg-accent-orange text-bg-primary font-mono text-sm hover:bg-accent-orange/90 transition-colors">
            + 新建 Team
          </button>
        ) : (
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-lg select-none">🏗️</span>
              <h2 className="text-sm font-mono text-text-primary">新建 Team</h2>
              <button type="button" onClick={() => setShowCreate(false)}
                className="ml-auto text-xs font-mono text-text-secondary hover:text-text-primary">
                收起
              </button>
            </div>
            <div className="mb-3">
              <label className="text-xs font-mono text-text-secondary mb-1 block">Team 名称</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="例如：校园社交 App 产品团队"
                className="w-full bg-bg-secondary border border-border rounded px-3 py-2 text-sm font-mono text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:border-accent-orange" />
            </div>
            <div className="mb-4">
              <label className="text-xs font-mono text-text-secondary mb-1 block">任务描述</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="例如：设计一款面向大学生的校园社交 App，包含课程表共享、二手交易、组队学习功能"
                rows={2}
                className="w-full bg-bg-secondary border border-border rounded px-3 py-2 text-sm font-mono text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:border-accent-orange resize-none" />
            </div>
            <div className="mb-4">
              <label className="text-xs font-mono text-text-secondary mb-2 block">
                选择成员（{selectedIds.size} 个已选）
              </label>
              {agents.length === 0 ? (
                <p className="text-xs font-mono text-text-secondary/60">暂无可选 Agent——先去铸造厂创建几个吧</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                  {agents.map((agent) => {
                    const isSelected = selectedIds.has(agent.id);
                    return (
                      <button key={agent.id} type="button" onClick={() => handleToggleAgent(agent.id)}
                        className={`flex items-center gap-2 px-3 py-2 rounded border text-xs font-mono text-left transition-colors ${
                          isSelected ? "border-accent-orange/60 bg-accent-orange/10 text-accent-orange"
                          : "border-border bg-bg-secondary/60 text-text-secondary hover:border-text-secondary/40"
                        }`.trim()}>
                        <span className="w-5 h-5 rounded-full bg-accent-green/10 border border-accent-green/30 flex items-center justify-center text-xs shrink-0">
                          {agent.name.charAt(0)}
                        </span>
                        <span className="flex-1 truncate">{agent.name}</span>
                        <span className="text-text-secondary/50 shrink-0">{agent.persona.mbti}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="mb-4">
              <button type="button" onClick={handleSuggestRoles}
                disabled={selectedIds.size === 0 || suggestRoles.isPending}
                className={`px-4 py-1.5 rounded-lg font-mono text-xs transition-colors ${
                  selectedIds.size === 0
                    ? "bg-bg-secondary border border-border text-text-secondary/40 cursor-not-allowed"
                    : "bg-bg-secondary border border-border text-text-secondary hover:border-accent-orange hover:text-accent-orange"
                }`.trim()}>
                {suggestRoles.isPending ? "分析中…" : "🤖 智能分配角色"}
              </button>
              {suggestRoles.isError && (
                <p className="text-xs text-accent-red font-mono mt-1">推荐失败，可手动填写角色</p>
              )}
            </div>
            {RolePreview}
            <button type="button" disabled={!canCreate} onClick={handleCreate}
              className={`px-6 py-2 rounded-lg font-mono text-sm transition-all ${
                canCreate ? "bg-accent-orange text-bg-primary hover:bg-accent-orange/90 cursor-pointer"
                : "bg-bg-secondary border border-border text-text-secondary/40 cursor-not-allowed"
              }`.trim()}>
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
          <EmptyState title="还没有 Team" description="创建你的第一个 Agent 团队，让 AI 协作完成任务" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {teams.map((team) => {
              const memberNames = team.agent_ids
                .map((aid) => agents.find((a) => a.id === aid)?.name ?? aid.slice(0, 6))
                .join("、");
              const roleSummary = team.roles.slice(0, 3).map((r) => r.role).join(" · ");
              const finishedLabel = teamOutcomeLabel(team.outcome, team.failed_steps ?? 0);
              return (
                <Card key={team.id}>
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="text-sm font-mono text-text-primary">{team.name}</h3>
                      <p className="text-xs text-text-secondary/60 mt-0.5 line-clamp-1">{team.description || "暂无描述"}</p>
                    </div>
                    <Badge
                      label={
                        activeTeamId === team.id
                          ? (isDone ? teamOutcomeLabel(store.outcome ?? team.outcome, store.failedSteps || team.failed_steps || 0) : isRunning ? "执行中" : team.status)
                          : (team.status === "idle" ? "待执行" : team.status === "finished" ? finishedLabel : team.status)
                      }
                      variant={
                        (activeTeamId === team.id && isDone)
                          ? teamOutcomeVariant(store.outcome ?? team.outcome)
                          : team.status === "finished" ? teamOutcomeVariant(team.outcome) : "P1"
                      }
                    />
                  </div>
                  <div className="text-xs font-mono text-text-secondary/60 space-y-0.5">
                    <p>👥 {memberNames}</p>
                    {roleSummary && <p>🎯 {roleSummary}</p>}
                    <p className="text-text-secondary/40">创建于 {team.created_at.slice(0, 10)}</p>
                  </div>
                  <div className="flex gap-2 mt-3 pt-3 border-t border-border">
                    {team.status === "idle" && (
                      <button type="button" onClick={() => handleExecute(team.id)}
                        disabled={executingTeamId === team.id}
                        className="text-xs font-mono text-accent-orange hover:text-accent-orange/80 transition-colors">
                        {executingTeamId === team.id ? "启动中…" : "▶ 执行"}
                      </button>
                    )}
                    {team.status === "finished" && (
                      <button type="button" onClick={() => handleExecute(team.id)}
                        disabled={executingTeamId === team.id}
                        className="text-xs font-mono text-accent-orange hover:text-accent-orange/80 transition-colors">
                        {executingTeamId === team.id ? "启动中…" : "▶ 重新执行"}
                      </button>
                    )}
                    {(team.status === "executing" || team.status === "finished") && (
                      <button type="button" onClick={() => {
                        setActiveTeamId(team.id);
                        store.reset();
                      }}
                        className="text-xs font-mono text-accent-green hover:text-accent-green/80 transition-colors">
                        {team.status === "executing" ? "● 执行中 — 进入" : `${team.outcome === "partial" ? "△ 部分完成" : team.outcome === "failed" ? "✕ 执行失败" : "✓ 已完成"} — 查看`}
                      </button>
                    )}
                    <button type="button" onClick={async () => {
                      try {
                        await publishTeam.mutateAsync({ team_id: team.id, name: team.name, description: team.description });
                        setPublishMsg(`✅「${team.name}」已保存为模板`);
                        setTimeout(() => setPublishMsg(null), 3000);
                      } catch { setPublishMsg("保存失败"); }
                    }} className="text-xs font-mono text-text-secondary hover:text-accent-orange transition-colors">
                      存模板
                    </button>
                    <button type="button" onClick={() => handleDelete(team.id)}
                      className="text-xs font-mono text-text-secondary hover:text-accent-red transition-colors ml-auto">
                      删除
                    </button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
