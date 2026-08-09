import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import type { AgentResponse } from "../types/agent";
import { useAgents, useCreateAgent, useDeleteAgent } from "../api/agents";
import { useWorlds } from "../api/worlds";
import AgentCard from "../components/agent/AgentCard";
import PersonaRadar from "../components/agent/PersonaRadar";
import Card from "../components/shared/Card";
import Badge from "../components/shared/Badge";
import { DECISION_LABELS, DECISION_VALUE_LABELS } from "../constants/labels";

/** Step 29 — Agent 创建链路打通，切到真实 POST /api/agents */
interface AgentFoundryProps {
  initialDescription?: string;
}

export default function AgentFoundry({ initialDescription = "" }: AgentFoundryProps) {
  const [input, setInput] = useState(initialDescription);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createdName, setCreatedName] = useState<string | null>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const { hash } = useLocation();

  // 侧边栏锚点滚动：hash 变化时自动滚动到对应 id 元素
  // #foundry 由下方专用 effect 处理（scrollTo 顶部），此处跳过避免闪烁
  useEffect(() => {
    if (!hash || hash === "#foundry") return;
    const id = hash.replace("#", "");
    const timer = setTimeout(() => {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
    return () => clearTimeout(timer);
  }, [hash]);

  // 当 hash 变为 #foundry 时（侧边栏点"创建 Agent"），直接滚到页面顶部
  useEffect(() => {
    if (hash === "#foundry") {
      const timer = setTimeout(() => {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [hash]);

  // React Query：服务端数据缓存，全模块共享
  const { data: serverAgents } = useAgents();
  const createAgent = useCreateAgent();
  const deleteAgent = useDeleteAgent();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const { data: worlds = [] } = useWorlds();

  // 计算每个 Agent 被哪些 World 引用（用于禁用删除按钮）
  const agentWorldRefs = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const w of worlds) {
      for (const aid of w.agent_ids) {
        const refs = map.get(aid) ?? [];
        refs.push(w.name);
        map.set(aid, refs);
      }
    }
    return map;
  }, [worlds]);

  const handleCreate = async () => {
    if (!input.trim() || createAgent.isPending) return;
    try {
      const result = await createAgent.mutateAsync(input.trim());
      // invalidateQueries(['agents']) → 其他页面 useAgents() 自动刷新
      setSelectedId(result.id);
      setCreatedName(result.name);
      setInput("");
    } catch {
      // 错误由 createAgent.error 展示
    }
  };

  const handleDelete = async (e: React.MouseEvent, agentId: string) => {
    e.stopPropagation();
    setDeleteError(null);
    try {
      await deleteAgent.mutateAsync(agentId);
      if (selectedId === agentId) setSelectedId(null);
    } catch (err: any) {
      setDeleteError(err?.message ?? "删除失败");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleCreate();
    }
  };

  // 详情展示：优先选中项 → 最新服务端数据 → 刚创建结果
  const agents = serverAgents ?? [];
  const displayedAgent: AgentResponse | null =
    agents.find((a) => a.id === selectedId) ??
    (agents.length > 0 ? agents[agents.length - 1] : null) ??
    (createAgent.data ?? null);

  const loading = createAgent.isPending;

  // BUG-M1-005 修复：创建成功后滚动到顶部展示创建结果
  useEffect(() => {
    if (createdName && !loading) {
      const timer = setTimeout(() => {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [createdName, loading]);

  // BUG-M1-002 修复：客户端校验——输入过短时禁用按钮并提示
  const trimmedInput = input.trim();
  const isTooShort = trimmedInput.length > 0 && trimmedInput.length < 3;

  return (
    <div ref={pageRef} className="p-6 max-w-4xl mx-auto animate-fade-in">
      {/* 页面标题 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-mono text-accent-green">M1 铸造厂</h1>
          <p className="text-sm text-text-secondary font-mono mt-1">
            用一句话描述你想要的角色，AI 会生成完整人格
          </p>
        </div>
        {agents.length > 0 && (
          <Badge
            label={`已创建 ${agents.length} 个 Agent`}
            variant="P0"
          />
        )}
      </div>

      {/* 输入区 — 侧边栏锚点 id="foundry" */}
      <div id="foundry" className="scroll-mt-16">
        <Card className="mb-6">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder='描述你的 Agent…&#10;例如："来自小镇的计算机系新生，内向但野心大"'
          rows={3}
          maxLength={200}
          disabled={loading}
          className="
            w-full bg-transparent text-text-primary text-sm font-mono
            placeholder:text-text-secondary/50 resize-none outline-none
            disabled:opacity-50
          "
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-sm text-text-secondary/60 font-mono">
            {input.length}/200 · Enter 发送
          </span>
          <div className="flex items-center gap-3">
            {/* BUG-M1-002：过短输入友好提示 */}
            {isTooShort && (
              <span className="text-xs text-accent-orange/80 font-mono">
                至少输入 3 个字符
              </span>
            )}
            <button
              onClick={handleCreate}
              disabled={!trimmedInput || isTooShort || loading}
              className="
                px-4 py-1.5 text-sm font-mono rounded
                bg-accent-green/10 border border-accent-green/30
                text-accent-green hover:bg-accent-green/20
                disabled:opacity-30 disabled:cursor-not-allowed
                transition-all duration-200
              "
            >
              {loading ? "⏳ 创建中…" : "✨ 创建 Agent"}
            </button>
          </div>
        </div>
        </Card>
      </div>

      {/* 错误提示 */}
      {createAgent.error && (
        <div className="mb-4 px-4 py-2 border border-accent-red/30 bg-accent-red/10 rounded text-sm text-accent-red font-mono">
          {(createAgent.error as Error)?.message ?? "创建失败，请检查后端是否启动"}
        </div>
      )}
      {deleteError && (
        <div className="mb-4 px-4 py-2 border border-accent-orange/30 bg-accent-orange/10 rounded text-sm text-accent-orange font-mono flex items-center justify-between">
          <span>{deleteError}</span>
          <button
            type="button"
            onClick={() => setDeleteError(null)}
            className="text-accent-orange/60 hover:text-accent-orange ml-3"
          >
            ×
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <Card className="mb-4">
          <div className="flex items-center gap-4 py-4">
            <div className="w-8 h-8 border-2 border-accent-green/30 border-t-accent-green rounded-full animate-spin shrink-0" />
            <div>
              <h2 className="font-mono text-sm text-text-primary">正在构建人格…</h2>
              <p className="text-sm text-text-secondary/60 mt-0.5">LLM 正在推理角色设定、背景故事和价值观</p>
            </div>
          </div>
        </Card>
      )}

      {/* 结果展示 */}
      {displayedAgent && !loading && (
        <div className="animate-slide-in">
          {/* BUG-M1-005：创建成功提示 */}
          {createdName && (
            <div className="mb-4 px-4 py-2 border border-accent-green/30 bg-accent-green/10 rounded text-sm text-accent-green font-mono">
              ✨ 已创建 Agent：<span className="font-bold">{createdName}</span>
            </div>
          )}
          <h2 className="text-sm font-mono text-text-secondary uppercase tracking-wider mb-3">
            创建结果
          </h2>

          {/* 双列：AgentCard + PersonaRadar */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <AgentCard agent={displayedAgent} />
            <Card>
              <h3 className="font-mono text-sm text-text-secondary mb-2">
                大五人格
              </h3>
              <PersonaRadar bigFive={displayedAgent.persona.big_five} />
              {/* 决策风格摘要 */}
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                {DECISION_LABELS.map(([key, label]) => (
                  <div key={key} className="flex justify-between text-sm">
                    <span className="text-text-secondary">{label}</span>
                    <span className="font-mono text-text-primary">
                      {DECISION_VALUE_LABELS[
                        displayedAgent.persona.decision_style[
                          key as keyof typeof displayedAgent.persona.decision_style
                        ]
                      ] ?? displayedAgent.persona.decision_style[key as keyof typeof displayedAgent.persona.decision_style]}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* 人格画像 + 背景故事 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <Card>
              <h3 className="font-mono text-sm text-text-secondary mb-2">
                人格画像
              </h3>
              <p className="text-sm text-text-primary leading-relaxed">
                {displayedAgent.persona.narrative}
              </p>
            </Card>
            <Card>
              <h3 className="font-mono text-sm text-text-secondary mb-2">
                背景故事
              </h3>
              <dl className="space-y-2 text-sm">
                <div className="flex items-baseline gap-3">
                  <dt className="text-text-secondary whitespace-nowrap shrink-0">家乡</dt>
                  <dd className="text-text-primary font-mono">{displayedAgent.background.hometown}</dd>
                </div>
                <div className="flex items-baseline gap-3">
                  <dt className="text-text-secondary whitespace-nowrap shrink-0">家庭</dt>
                  <dd className="text-text-primary font-mono">{displayedAgent.background.family}</dd>
                </div>
                <div className="flex items-baseline gap-3">
                  <dt className="text-text-secondary whitespace-nowrap shrink-0">教育</dt>
                  <dd className="text-text-primary font-mono">{displayedAgent.background.education}</dd>
                </div>
              </dl>
              {displayedAgent.background.key_events.length > 0 && (
                <div className="mt-3">
                  <p className="text-sm text-text-secondary mb-1">
                    关键事件
                  </p>
                  <ul className="space-y-0.5">
                    {displayedAgent.background.key_events.map((ev, i) => (
                      <li
                        key={i}
                        className="text-sm text-text-primary font-mono pl-3 border-l border-border"
                      >
                        {ev}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          </div>

          {/* 核心价值观 */}
          <Card>
            <h3 className="font-mono text-sm text-text-secondary mb-2">
              核心价值观
            </h3>
            <div className="flex flex-wrap gap-2">
              {displayedAgent.persona.values.map((v) => (
                <span
                  key={v}
                  className="text-sm font-mono text-accent-blue/80 bg-accent-blue/10 border border-accent-blue/20 px-2 py-0.5 rounded"
                >
                  {v}
                </span>
              ))}
            </div>
          </Card>

          {/* 目标系统 — 侧边栏锚点 id="goals" */}
          <div id="goals" className="scroll-mt-16">
            <Card>
              <h3 className="font-mono text-sm text-text-secondary mb-3">
                🎯 目标系统
              </h3>
              {displayedAgent.goals.length > 0 ? (
                <ul className="space-y-2">
                  {displayedAgent.goals.map((g) => {
                    const statusLabel: Record<string, string> = {
                      active: "🟢 活跃",
                      in_progress: "🔵 进行中",
                      achieved: "✅ 已完成",
                      abandoned: "⚫ 已放弃",
                    };
                    return (
                      <li
                        key={g.id}
                        className="flex items-start gap-3 text-sm border-b border-border/40 pb-2 last:border-0 last:pb-0"
                      >
                        <span className="shrink-0 mt-0.5">
                          {statusLabel[g.status] ?? g.status}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-text-primary font-mono">{g.description}</p>
                          <div className="flex items-center gap-3 mt-1 text-xs text-text-secondary">
                            <span>优先级: {g.priority}</span>
                            {g.progress > 0 && (
                              <span>进度: {Math.round(g.progress * 100)}%</span>
                            )}
                            {g.deadline && (
                              <span>截止: {g.deadline.slice(0, 10)}</span>
                            )}
                          </div>
                          {g.progress > 0 && (
                            <div className="mt-1 h-1 bg-bg-primary rounded-full overflow-hidden">
                              <div
                                className="h-full bg-accent-green rounded-full transition-all duration-300"
                                style={{ width: `${g.progress * 100}%` }}
                              />
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-text-secondary">
                  该 Agent 尚未设定目标。在后续版本中可在此处为 Agent 添加短期/长期目标。
                </p>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* 已创建列表 */}
      {agents.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-mono text-text-secondary uppercase tracking-wider mb-3">
            已创建的 Agent · {agents.length} 个
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {agents.map((agent) => {
              const isSelected = agent.id === selectedId;
              const isLatest = agent.id === agents[agents.length - 1]?.id;
              const worldRefs = agentWorldRefs.get(agent.id);
              const isInUse = worldRefs && worldRefs.length > 0;
              const deleteTitle = isInUse
                ? `无法删除：被 ${worldRefs.length} 个 World 使用（${worldRefs.join("、")}）`
                : "删除 Agent";
              return (
                <div
                  key={agent.id}
                  onClick={() => setSelectedId(agent.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") setSelectedId(agent.id);
                  }}
                  className={`
                    relative text-left bg-bg-card border rounded-lg p-3 w-full
                    cursor-pointer
                    hover:border-accent-green/40 transition-colors duration-200
                    ${isSelected
                      ? "border-accent-green/60 ring-1 ring-accent-green/20"
                      : "border-border"
                    }
                  `}
                >
                  {/* 删除按钮 */}
                  <button
                    type="button"
                    onClick={(e) => handleDelete(e, agent.id)}
                    disabled={deleteAgent.isPending || isInUse}
                    className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded transition-colors disabled:opacity-20 disabled:cursor-not-allowed text-text-secondary/40 hover:text-accent-red hover:bg-accent-red/10"
                    title={deleteTitle}
                  >
                    ×
                  </button>

                  <div className="flex items-center gap-2 mb-2 pr-6">
                    <span className="font-mono text-sm text-text-primary">
                      {agent.name}
                    </span>
                    <span className="text-xs font-mono text-accent-purple/70 bg-accent-purple/10 px-1 py-0.5 rounded">
                      {agent.persona.mbti}
                    </span>
                    {isLatest && (
                      <span className="ml-auto text-xs text-accent-green font-mono">
                        最新
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-text-secondary line-clamp-3 mb-2">
                    {agent.persona.narrative.slice(0, 80)}…
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {agent.persona.values.slice(0, 3).map((v) => (
                      <span
                        key={v}
                        className="text-xs text-text-secondary/70 bg-bg-primary/50 px-1.5 py-0.5 rounded"
                      >
                        {v}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
