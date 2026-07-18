import { useState } from "react";
import type { AgentResponse } from "../types/agent";
import { MOCK_AGENT_RESPONSE } from "../mocks/agents";
import { useApi } from "../hooks/useApi";
import { useAgentStore } from "../stores/useAgentStore";
import AgentCard from "../components/agent/AgentCard";
import PersonaRadar from "../components/agent/PersonaRadar";
import Card from "../components/shared/Card";
import Badge from "../components/shared/Badge";

/** Step 17 铸造厂主页面 */
export default function AgentFoundry() {
  const [input, setInput] = useState("");
  // Zustand 全局存储——跨页面导航不丢失（刷新页面后清空）
  const { agents: createdAgents, addAgent } = useAgentStore();
  // 当前详情中展示的 Agent——默认最新，点击列表可切换
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Mock 模式创建 Agent（切 API 时删 mockData 这行即可）
  const {
    execute: createAgent,
    loading,
    error,
    data,
    reset,
  } = useApi<AgentResponse, { description: string }>(
    "POST",
    "/api/agents",
    { mockData: MOCK_AGENT_RESPONSE, mockDelay: 1500 },
  );

  const handleCreate = async () => {
    if (!input.trim() || loading) return;
    const result = await createAgent({ description: input.trim() });
    if (result) {
      // Mock 模式所有结果 id 相同，追加序号保证唯一
      const unique = { ...result, id: `${result.id}-${Date.now()}` };
      addAgent(unique);
      setSelectedId(unique.id);
      setInput("");
      reset(); // 清空 data/error，准备下一次创建
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleCreate();
    }
  };

  // 详情中展示的 Agent：默认取列表最后一个，创建后自动选中新 Agent
  const displayedAgent =
    createdAgents.find((a) => a.id === selectedId) ??
    (createdAgents.length > 0
      ? createdAgents[createdAgents.length - 1]
      : data);

  return (
    <div className="p-6 max-w-4xl mx-auto animate-fade-in">
      {/* 页面标题 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-mono text-accent-green">M1 铸造厂</h1>
          <p className="text-sm text-text-secondary font-mono mt-1">
            用一句话描述你想要的角色，AI 会生成完整人格
          </p>
        </div>
        {createdAgents.length > 0 && (
          <Badge
            label={`已创建 ${createdAgents.length} 个 Agent`}
            variant="P0"
          />
        )}
      </div>

      {/* 输入区 */}
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
          <button
            onClick={handleCreate}
            disabled={!input.trim() || loading}
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
      </Card>

      {/* 错误提示 */}
      {error && (
        <div className="mb-4 px-4 py-2 border border-accent-red/30 bg-accent-red/10 rounded text-sm text-accent-red font-mono">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center py-12 text-text-secondary">
          <div className="w-8 h-8 border-2 border-accent-green/30 border-t-accent-green rounded-full animate-spin mb-3" />
          <p className="text-sm font-mono">正在构建人格…</p>
          <p className="text-sm text-text-secondary/60 mt-1">
            LLM 正在推理角色设定、背景故事和价值观
          </p>
        </div>
      )}

      {/* 结果展示 */}
      {displayedAgent && !loading && (
        <div className="animate-slide-in">
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
                <div className="flex justify-between">
                  <dt className="text-text-secondary">家乡</dt>
                  <dd className="text-text-primary font-mono">
                    {displayedAgent.background.hometown}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-text-secondary">家庭</dt>
                  <dd className="text-text-primary font-mono">
                    {displayedAgent.background.family}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-text-secondary">教育</dt>
                  <dd className="text-text-primary font-mono">
                    {displayedAgent.background.education}
                  </dd>
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
        </div>
      )}

      {/* 已创建列表 */}
      {createdAgents.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-mono text-text-secondary uppercase tracking-wider mb-3">
            已创建的 Agent · {createdAgents.length} 个
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {createdAgents.map((agent) => {
              const isSelected = agent.id === selectedId;
              const isLatest = agent.id === createdAgents[createdAgents.length - 1]?.id;
              return (
                <button
                  key={agent.id}
                  onClick={() => setSelectedId(agent.id)}
                  className={`
                    text-left bg-bg-card border rounded-lg p-3 w-full
                    hover:border-accent-green/40 transition-colors duration-200
                    ${isSelected
                      ? "border-accent-green/60 ring-1 ring-accent-green/20"
                      : "border-border"
                    }
                  `}
                >
                  <div className="flex items-center gap-2 mb-2">
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
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const DECISION_LABELS = [
  ["info_processing", "信息处理"],
  ["risk_preference", "风险偏好"],
  ["social_tendency", "社交倾向"],
  ["stress_response", "压力反应"],
] as const;

const DECISION_VALUE_LABELS: Record<string, string> = {
  intuitive: "直觉型",
  analytical: "分析型",
  balanced: "平衡型",
  averse: "规避",
  moderate: "适中",
  seeking: "寻求",
  competitive: "竞争型",
  cooperative: "合作型",
  independent: "独立型",
  avoidant: "回避型",
  reactive: "反应型",
  adaptive: "适应型",
  resilient: "韧性型",
};
