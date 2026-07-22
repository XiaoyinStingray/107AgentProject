import { useMemo, useState, useCallback } from "react";
import type { AgentResponse } from "../types/agent";
import type { InjectionEventType, InjectionRecord } from "../types/intervention";
import { MOCK_AGENTS } from "../mocks/agents";
import {
  INJECTION_TYPES,
  INTERVENTION_PLACEHOLDERS,
  MOCK_INTERVENTION_HISTORY,
  createInjectionRecord,
  formatInjectionTime,
  getInjectionTypeMeta,
} from "../mocks/intervention";
import { useAgentStore } from "../stores/useAgentStore";
import { useWorlds, useInjectEvent } from "../api/worlds";
import Card from "../components/shared/Card";
import Badge from "../components/shared/Badge";
import StatusDot from "../components/shared/StatusDot";

/* ================================================================
   Step 34c — M7 导演干预台
   事件注入走真实 POST /api/worlds/{id}/inject，历史仍为本地状态。
   ================================================================ */

export default function DirectorIntervention() {
  const agents = useAvailableAgents();
  const { data: worlds = [] } = useWorlds();
  const injectEvent = useInjectEvent();
  const [history, setHistory] = useState<InjectionRecord[]>(
    MOCK_INTERVENTION_HISTORY,
  );

  // 注入表单状态
  const [worldId, setWorldId] = useState<string>("");
  const [type, setType] = useState<InjectionEventType>("world_event");
  const [targetAgentId, setTargetAgentId] = useState<string>("");
  const [description, setDescription] = useState("");
  const [lastInjected, setLastInjected] = useState<InjectionRecord | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const selectedType = getInjectionTypeMeta(type);
  const needsTarget = selectedType?.needsTarget ?? false;
  const targetAgent = agents.find((a) => a.id === targetAgentId);
  const canInject =
    !!worldId &&
    description.trim().length > 0 &&
    (!needsTarget || !!targetAgentId) &&
    !injectEvent.isPending;

  const activeWorlds = worlds.filter(
    (w) => w.status === "running" || w.status === "paused",
  );

  const handleInject = useCallback(async () => {
    if (!canInject) return;
    setErrorMsg(null);
    const targetName = needsTarget
      ? (targetAgent?.name ?? "未知")
      : "世界";

    try {
      await injectEvent.mutateAsync({
        worldId,
        description: description.trim(),
      });
    } catch (cause) {
      setErrorMsg(cause instanceof Error ? cause.message : "事件注入失败");
      return;
    }

    const record = createInjectionRecord(
      type,
      needsTarget ? targetAgentId : null,
      targetName,
      description.trim(),
    );
    setHistory((prev) => [record, ...prev]);
    setLastInjected(record);
    setDescription("");
    setTimeout(() => setLastInjected(null), 2000);
  }, [canInject, needsTarget, targetAgent, type, targetAgentId, description,
      worldId, injectEvent]);

  const handleClearHistory = useCallback(() => {
    setHistory([]);
  }, []);

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
                        onClick={() => setWorldId(world.id)}
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
                      onClick={() => setType(t.key)}
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
                  目标 Agent
                </label>
                <div className="flex flex-wrap gap-2">
                  {agents.length === 0 ? (
                    <p className="text-xs font-mono text-text-secondary/60">
                      暂无可选 Agent
                    </p>
                  ) : (
                    agents.map((agent) => {
                      const isSelected = agent.id === targetAgentId;
                      return (
                        <button
                          key={agent.id}
                          type="button"
                          onClick={() => setTargetAgentId(agent.id)}
                          className={`
                            flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs font-mono transition-colors
                            ${isSelected
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
            {errorMsg && (
              <p className="text-xs font-mono text-accent-red mt-2">{errorMsg}</p>
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
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-lg select-none">📋</span>
                <h2 className="text-sm font-mono text-text-primary">
                  干预历史
                </h2>
                <Badge label="P3" variant="P3" />
              </div>
              {history.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearHistory}
                  className="text-xs font-mono text-text-secondary hover:text-accent-red transition-colors"
                >
                  清空
                </button>
              )}
            </div>

            <p className="text-xs font-mono text-text-secondary/60 mb-3">
              {history.length} 条记录
            </p>

            {history.length === 0 ? (
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

/* —— 工具函数 —— */

function useAvailableAgents(): AgentResponse[] {
  const createdAgents = useAgentStore((s) => s.agents);
  return useMemo(() => {
    const byId = new Map<string, AgentResponse>();
    [...MOCK_AGENTS, ...createdAgents].forEach((a) => byId.set(a.id, a));
    return [...byId.values()];
  }, [createdAgents]);
}
