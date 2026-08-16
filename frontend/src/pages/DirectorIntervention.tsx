import { useState, useCallback } from "react";
import type { InjectionEventType, InjectionRecord } from "../types/intervention";
import {
  INJECTION_TYPES,
  INTERVENTION_PLACEHOLDERS,
  createInjectionRecord,
  formatInjectionTime,
  getInjectionTypeMeta,
} from "../mocks/intervention";
import { useAgents } from "../api/agents";
import { useWorlds, useInjectEvent, useWorldInterventions } from "../api/worlds";
import Card from "../components/shared/Card";
import Badge from "../components/shared/Badge";
import StatusDot from "../components/shared/StatusDot";

/* ================================================================
   Step 44 — M7 导演干预台
   事件注入走真实 POST /api/worlds/{id}/inject，
   干预历史从 interventions 表持久化加载 + 效果预览。
   ================================================================ */

export default function DirectorIntervention() {
  const { data: agents = [] } = useAgents();
  const { data: worlds = [] } = useWorlds();
  const injectEvent = useInjectEvent();

  // 注入表单状态
  const [worldId, setWorldId] = useState<string>("");
  const [type, setType] = useState<InjectionEventType>("world_event");
  const [targetAgentId, setTargetAgentId] = useState<string>("");
  const [targetAgentId2, setTargetAgentId2] = useState<string>("");
  const [description, setDescription] = useState("");
  const [lastInjected, setLastInjected] = useState<InjectionRecord | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 选中的 World——用于过滤 Agent 列表
  const selectedWorld = worlds.find((w) => w.id === worldId);
  const worldAgentIds = selectedWorld?.agent_ids ?? [];
  const worldAgents = agents.filter((a) => worldAgentIds.includes(a.id));
  const isRelationshipChange = type === "relationship_change";

  // 干预历史——从后端 interventions 表加载
  const { data: apiInterventions = [] } = useWorldInterventions(worldId || null);

  const history: InjectionRecord[] = apiInterventions.map((r) => ({
    id: r.id,
    type: r.type as InjectionEventType,
    targetAgentId: r.target_agent_id,
    targetName: r.target_agent_name ?? "世界",
    description: r.description,
    timestamp: r.created_at,
    status: "applied" as const,
  }));

  const selectedType = getInjectionTypeMeta(type);
  const needsTarget = selectedType?.needsTarget ?? false;
  const targetAgent = agents.find((a) => a.id === targetAgentId);
  const targetAgent2 = agents.find((a) => a.id === targetAgentId2);
  const canInject =
    !!worldId &&
    description.trim().length > 0 &&
    (!needsTarget || !!targetAgentId) &&
    (!isRelationshipChange || (!!targetAgentId && !!targetAgentId2 && targetAgentId !== targetAgentId2)) &&
    !injectEvent.isPending;

  const activeWorlds = worlds.filter(
    (w) =>
      (w.status === "running" || w.status === "paused") &&
      !w.name.startsWith("Team:") &&
      !w.name.startsWith("Scene:") &&
      (w as any).world_type !== "scene" &&
      (w as any).world_type !== "team",
  );

  const handleInject = useCallback(async () => {
    if (!canInject) return;
    setErrorMsg(null);
    const targetName = isRelationshipChange
      ? `${targetAgent?.name ?? "未知"} → ${targetAgent2?.name ?? "未知"}`
      : needsTarget
        ? (targetAgent?.name ?? "未知")
        : "世界";
    const desc = description.trim();

    try {
      await injectEvent.mutateAsync({
        worldId,
        type,
        targetAgentId: needsTarget ? targetAgentId : null,
        targetAgentId2: isRelationshipChange ? targetAgentId2 : null,
        description: desc,
      });
    } catch (cause) {
      setErrorMsg(cause instanceof Error ? cause.message : "事件注入失败");
      return;
    }

    // 本地乐观记录——API refetch 后由 useWorldInterventions 提供完整数据
    const record = createInjectionRecord(
      type,
      needsTarget ? targetAgentId : null,
      targetName,
      desc,
    );
    setLastInjected(record);
    setDescription("");
    setTimeout(() => setLastInjected(null), 2000);
  }, [canInject, needsTarget, isRelationshipChange, targetAgent, targetAgent2, type, targetAgentId, targetAgentId2, description,
      worldId, injectEvent]);

  return (
    <div className="h-full overflow-y-auto p-6 animate-fade-in">
      {/* 标题 */}
      <h1 className="text-2xl font-mono text-accent-orange mb-1">
        M7 导演干预台
      </h1>
      <p className="text-sm text-text-secondary font-mono mb-6">
        事件注入 · 上帝之声 · 时间回溯 · 人格篡改
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 左栏：事件注入表单 + P3 占位 */}
        <div className="lg:col-span-2 space-y-4">
          {/* 事件注入表单 */}
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xl select-none">💉</span>
              <h2 className="text-sm font-mono text-text-primary">
                事件注入
              </h2>
              <Badge label="P2" variant="P2" />
            </div>

            {/* World 选择——可注入运行中或暂停的 World */}
            <div className="mb-4">
              <label className="text-xs font-mono text-text-secondary mb-2 block">
                🌍 选择活跃的 World
              </label>
              {activeWorlds.length === 0 ? (
                <Card>
                  <p className="text-xs font-mono text-text-secondary/60 text-center py-3">
                    暂无可注入的 World——请先在沙盒或剧场中启动一个模拟
                  </p>
                </Card>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {activeWorlds.map((world) => {
                    const statusIcon =
                      world.status === "running" ? "🟢" : "⏸️";
                    const isSelected = world.id === worldId;
                    return (
                      <button
                        key={world.id}
                        type="button"
                        onClick={() => { setWorldId(world.id); setTargetAgentId(""); setTargetAgentId2(""); }}
                        className={`
                          text-left px-3 py-2 rounded border text-xs font-mono transition-colors
                          ${isSelected
                            ? "border-accent-orange/60 bg-accent-orange/10 text-accent-orange"
                            : "border-border bg-bg-secondary/60 text-text-secondary hover:border-text-secondary/40"
                          }
                        `.trim()}
                      >
                        <span className="flex items-center gap-1.5">
                          <span>{statusIcon}</span>
                          <span>{world.name}</span>
                          <span className="text-text-secondary/50">
                            T{world.current_tick}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 事件类型选择 */}
            <div className="mb-4">
              <label className="text-xs font-mono text-text-secondary mb-2 block">
                事件类型
              </label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {INJECTION_TYPES.map((t) => {
                  const isActive = t.key === type;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => { setType(t.key); setTargetAgentId(""); setTargetAgentId2(""); }}
                      className={`
                        text-left p-2 rounded border text-xs font-mono transition-colors
                        ${isActive
                          ? "border-accent-orange/60 bg-accent-orange/10 text-accent-orange"
                          : "border-border bg-bg-secondary/60 text-text-secondary hover:border-text-secondary/40"
                        }
                      `.trim()}
                    >
                      <div className="flex items-center gap-1 mb-0.5">
                        <span>{t.emoji}</span>
                        <span>{t.label}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-text-secondary/60 font-mono mt-2">
                {selectedType?.description}
              </p>
            </div>

            {/* 目标 Agent 选择（仅 needsTarget=true 时显示） */}
            {needsTarget && (
              <div className="mb-4 animate-fade-in">
                <label className="text-xs font-mono text-text-secondary mb-2 block">
                  {isRelationshipChange ? "源 Agent（发起方）" : "目标 Agent"}
                </label>
                <div className="flex flex-wrap gap-2">
                  {worldAgents.length === 0 ? (
                    <p className="text-xs font-mono text-text-secondary/60">
                      {worldId ? "该 World 中暂无可选 Agent" : "请先选择 World"}
                    </p>
                  ) : (
                    worldAgents.map((agent) => {
                      const isSelected = agent.id === targetAgentId;
                      const isDisabled = isRelationshipChange && agent.id === targetAgentId2;
                      return (
                        <button
                          key={agent.id}
                          type="button"
                          disabled={isDisabled}
                          onClick={() => setTargetAgentId(isSelected ? "" : agent.id)}
                          className={`
                            flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs font-mono transition-colors
                            ${isDisabled
                              ? "border-border/30 bg-bg-secondary/20 text-text-secondary/30 cursor-not-allowed"
                              : isSelected
                                ? "border-accent-orange/60 bg-accent-orange/10 text-accent-orange"
                                : "border-border bg-bg-secondary/60 text-text-secondary hover:border-text-secondary/40"
                            }
                          `.trim()}
                        >
                          <span className="w-5 h-5 rounded-full bg-accent-green/10 border border-accent-green/30 flex items-center justify-center text-xs shrink-0">
                            {agent.name.charAt(0)}
                          </span>
                          {agent.name}
                          <span className="text-text-secondary/50">
                            {agent.persona.mbti}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* 关系变化——第二个 Agent 选择器（目标方） */}
            {isRelationshipChange && (
              <div className="mb-4 animate-fade-in">
                <label className="text-xs font-mono text-text-secondary mb-2 block">
                  目标 Agent（受影响方）
                </label>
                <div className="flex flex-wrap gap-2">
                  {worldAgents.length === 0 ? (
                    <p className="text-xs font-mono text-text-secondary/60">
                      {worldId ? "该 World 中暂无可选 Agent" : "请先选择 World"}
                    </p>
                  ) : (
                    worldAgents.map((agent) => {
                      const isSelected = agent.id === targetAgentId2;
                      const isDisabled = agent.id === targetAgentId;
                      return (
                        <button
                          key={agent.id}
                          type="button"
                          disabled={isDisabled}
                          onClick={() => setTargetAgentId2(isSelected ? "" : agent.id)}
                          className={`
                            flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs font-mono transition-colors
                            ${isDisabled
                              ? "border-border/30 bg-bg-secondary/20 text-text-secondary/30 cursor-not-allowed"
                              : isSelected
                                ? "border-accent-orange/60 bg-accent-orange/10 text-accent-orange"
                                : "border-border bg-bg-secondary/60 text-text-secondary hover:border-text-secondary/40"
                            }
                          `.trim()}
                        >
                          <span className="w-5 h-5 rounded-full bg-accent-green/10 border border-accent-green/30 flex items-center justify-center text-xs shrink-0">
                            {agent.name.charAt(0)}
                          </span>
                          {agent.name}
                          <span className="text-text-secondary/50">
                            {agent.persona.mbti}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* 描述文本框 */}
            <div className="mb-4">
              <label className="text-xs font-mono text-text-secondary mb-2 block">
                事件描述
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={
                  type === "world_event"
                    ? "例如：突然下起暴雨，图书馆外的露天自习区被迫关闭。"
                    : type === "agent_message"
                      ? "例如：高中班主任发来微信——保研名额有变，速回电话。"
                      : type === "agent_action"
                        ? "例如：Agent 决定翘掉下午的课，独自去湖边散步。"
                        : "例如：Agent A 对 Agent B 的信任骤降 -0.20。"
                }
                rows={3}
                className="w-full bg-bg-secondary border border-border rounded px-3 py-2 text-sm font-mono text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:border-accent-orange transition-colors resize-none"
              />
            </div>

            {/* 注入按钮 + 成功提示 */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={!canInject}
                onClick={handleInject}
                className={`
                  px-6 py-2 rounded-lg font-mono text-sm transition-all
                  ${canInject
                    ? "bg-accent-orange text-bg-primary hover:bg-accent-orange/90 cursor-pointer"
                    : "bg-bg-secondary border border-border text-text-secondary/40 cursor-not-allowed"
                  }
                `.trim()}
              >
                {injectEvent.isPending ? "注入中…" : "💉 注入事件"}
              </button>
              {lastInjected && (
                <span className="text-xs font-mono text-accent-green animate-fade-in">
                  ✓ 已注入：{lastInjected.targetName} · {lastInjected.description.slice(0, 20)}
                  {lastInjected.description.length > 20 ? "…" : ""}
                </span>
              )}
            </div>
            {!worldId && (
              <p className="text-xs font-mono text-accent-red mt-2">
                请先选择一个运行中的 World
              </p>
            )}
            {worldId && !canInject && needsTarget && !targetAgentId && (
              <p className="text-xs font-mono text-accent-red mt-2">
                请选择目标 Agent
              </p>
            )}
            {worldId && !canInject && isRelationshipChange && !!targetAgentId && !targetAgentId2 && (
              <p className="text-xs font-mono text-accent-red mt-2">
                请选择第二个 Agent（受影响方）
              </p>
            )}
            {worldId && !canInject && isRelationshipChange && !!targetAgentId && !!targetAgentId2 && targetAgentId === targetAgentId2 && (
              <p className="text-xs font-mono text-accent-red mt-2">
                两个 Agent 不能相同
              </p>
            )}
            {errorMsg && (
              <p className="text-xs font-mono text-accent-red mt-2">{errorMsg}</p>
            )}

            {/* 效果预览（Step 44 —— 实时显示注入事件在 World 中的样貌） */}
            {description.trim() && (
              <div className="mt-4 pt-4 border-t border-border">
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-xs select-none">👁️</span>
                  <span className="text-xs font-mono text-text-secondary">
                    效果预览
                  </span>
                </div>
                <div className="bg-bg-primary/40 border border-border rounded p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-sm select-none">
                      {selectedType?.emoji ?? "📡"}
                    </span>
                    <span className="text-xs font-mono text-text-primary">
                      {selectedType?.label ?? type}
                    </span>
                    {needsTarget && targetAgent && (
                      <span className="text-xs font-mono text-accent-green">
                        → {targetAgent.name}
                      </span>
                    )}
                    {!needsTarget && (
                      <span className="text-xs font-mono text-accent-orange/70">
                        → 世界
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-secondary leading-relaxed">
                    {description.trim()}
                  </p>
                </div>
              </div>
            )}
          </Card>

          {/* P3 占位面板 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {INTERVENTION_PLACEHOLDERS.map((p) => (
              <Card key={p.key} className="opacity-60">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg select-none">{p.emoji}</span>
                  <h3 className="text-sm font-mono text-text-primary">
                    {p.label}
                  </h3>
                  <Badge label="P3" variant="P3" className="ml-auto" />
                </div>
                <p className="text-xs text-text-secondary">{p.description}</p>
                <p className="text-xs text-text-secondary/40 font-mono mt-2">
                  🚧 演示后可继续开发
                </p>
              </Card>
            ))}
          </div>
        </div>

        {/* 右栏：干预历史 */}
        <div className="lg:col-span-1">
          <Card className="sticky top-4">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-lg select-none">📋</span>
              <h2 className="text-sm font-mono text-text-primary">
                干预历史
              </h2>
              <Badge label="P2" variant="P2" />
            </div>

            <p className="text-xs font-mono text-text-secondary/60 mb-3">
              {history.length} 条记录
            </p>

            {!worldId ? (
              <p className="text-xs font-mono text-text-secondary/60 text-center py-6">
                请先选择一个 World 查看干预历史
              </p>
            ) : history.length === 0 ? (
              <p className="text-xs font-mono text-text-secondary/60 text-center py-6">
                暂无干预记录
              </p>
            ) : (
              <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                {history.map((record) => (
                  <HistoryItem key={record.id} record={record} />
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

/* —— 子组件 —— */

function HistoryItem({ record }: { record: InjectionRecord }) {
  const meta = getInjectionTypeMeta(record.type);
  return (
    <div className="bg-bg-secondary/60 border border-border rounded p-3">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-sm select-none">{meta?.emoji ?? "📡"}</span>
        <span className="text-xs font-mono text-text-primary">
          {meta?.label ?? record.type}
        </span>
        <span className="text-xs font-mono text-text-secondary/60 ml-auto">
          {formatInjectionTime(record.timestamp)}
        </span>
      </div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <StatusDot status="active" label="" />
        <span className="text-xs font-mono text-accent-green">
          {record.targetName}
        </span>
        <Badge label="已应用" variant="P1" className="ml-auto" />
      </div>
      <p className="text-xs text-text-secondary leading-relaxed">
        {record.description}
      </p>
    </div>
  );
}

