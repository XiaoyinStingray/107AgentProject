import type { AgentResponse } from "../../types/agent";
import Card from "../shared/Card";
import StatusDot from "../shared/StatusDot";
import Badge from "../shared/Badge";

interface AgentCardProps {
  agent: AgentResponse;
  className?: string;
}

/** Agent 摘要卡片——展示姓名、MBTI、情绪、精力、目标 */
export default function AgentCard({ agent, className = "" }: AgentCardProps) {
  const energyStatus =
    agent.energy > 70 ? "active" : agent.energy > 30 ? "thinking" : "idle";

  return (
    <Card className={`min-w-[240px] ${className}`}>
      {/* 头部：姓名 + 状态灯 */}
      <div className="flex items-center gap-2 mb-3">
        <StatusDot status={energyStatus} label="" />
        <h3 className="font-mono text-base text-accent-green">{agent.name}</h3>
        <span className="ml-auto font-mono text-xs text-accent-purple/80 bg-accent-purple/10 px-1.5 py-0.5 rounded">
          {agent.persona.mbti}
        </span>
      </div>

      {/* 精力条 */}
      <div className="mb-3">
        <div className="flex justify-between text-xs text-text-secondary mb-1">
          <span>⚡ 精力</span>
          <span className="font-mono">{agent.energy}%</span>
        </div>
        <div className="h-1.5 bg-bg-primary rounded-full overflow-hidden">
          <div
            className="h-full bg-accent-green rounded-full transition-all duration-500"
            style={{ width: `${agent.energy}%` }}
          />
        </div>
      </div>

      {/* 情绪标签 */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-text-secondary">情绪:</span>
        <Badge label={EMOTION_LABELS[agent.emotional_state.label] ?? agent.emotional_state.label} />
      </div>

      {/* 目标列表 */}
      {agent.goals.length > 0 && (
        <div>
          <p className="text-xs text-text-secondary mb-1.5">🎯 目标</p>
          <ul className="space-y-1">
            {agent.goals.slice(0, 3).map((g) => (
              <li
                key={g.id}
                className="flex items-center gap-1.5 text-xs text-text-primary font-mono"
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    g.status === "active"
                      ? "bg-accent-green"
                      : g.status === "achieved"
                        ? "bg-accent-blue"
                        : "bg-text-secondary"
                  }`}
                />
                {g.description}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

const EMOTION_LABELS: Record<string, string> = {
  happy: "😊 开心",
  sad: "😢 悲伤",
  angry: "😤 愤怒",
  anxious: "😰 焦虑",
  excited: "😆 兴奋",
  neutral: "😐 平静",
};
