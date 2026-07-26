import { useState, useCallback } from "react";
import { useAgents } from "../api/agents";
import { useTeams, useCreateTeam, useDeleteTeam, useSuggestRoles } from "../api/teams";
import type { TeamRole, SuggestedRole } from "../types/team";
import Card from "../components/shared/Card";
import Badge from "../components/shared/Badge";
import EmptyState from "../components/shared/EmptyState";

/* ================================================================
   Step 51 — M9 Agent Team 仪表盘
   Team 创建 + 列表页面。角色推荐走真实 LLM API。
   ================================================================ */

export default function TeamDashboard() {
  const { data: agents = [] } = useAgents();
  const { data: teams = [], isLoading: teamsLoading } = useTeams();
  const createTeam = useCreateTeam();
  const deleteTeam = useDeleteTeam();

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

  return (
    <div className="h-full overflow-y-auto p-6 animate-fade-in">
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
                    <button
                      type="button"
                      onClick={() => handleDelete(team.id)}
                      className="text-xs font-mono text-text-secondary hover:text-accent-red transition-colors"
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
    </div>
  );
}
