import Card from "../components/shared/Card";
import StatusDot from "../components/shared/StatusDot";
import { MOCK_AGENTS } from "../mocks/agents";

/**
 * Dashboard 总览——首页。
 * 展示系统状态概览 + 最近 Agent 列表。
 */
export default function Home() {
  return (
    <div className="p-6 animate-fade-in">
      <h1 className="text-2xl font-mono text-accent-green mb-1">
        人生实验室 · Life Lab
      </h1>
      <p className="text-sm text-text-secondary font-mono mb-8">
        Agent 社会实验平台 v0.1.0
      </p>

      {/* 快捷入口 */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {QUICK_ENTRIES.map((entry) => (
          <Card key={entry.label} hover className="flex items-center gap-3">
            <span className="text-2xl">{entry.emoji}</span>
            <div>
              <p className="text-sm font-mono text-text-primary">{entry.label}</p>
              <p className="text-xs text-text-secondary">{entry.desc}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* 最近 Agent */}
      <h2 className="text-sm font-mono text-text-secondary uppercase tracking-wider mb-3">
        最近创建的 Agent
      </h2>
      <div className="grid grid-cols-3 gap-4">
        {MOCK_AGENTS.map((agent) => (
          <Card key={agent.id} hover>
            <div className="flex items-center gap-2 mb-2">
              <StatusDot
                status={agent.energy > 70 ? "active" : "idle"}
                label=""
              />
              <span className="font-mono text-sm text-text-primary">
                {agent.name}
              </span>
              <span className="ml-auto text-xs text-text-secondary font-mono">
                {agent.persona.mbti}
              </span>
            </div>
            <p className="text-xs text-text-secondary line-clamp-2">
              {agent.persona.narrative}
            </p>
            <div className="flex gap-2 mt-2">
              {agent.goals.slice(0, 2).map((g) => (
                <span
                  key={g.id}
                  className="text-[10px] font-mono text-accent-blue/70 bg-accent-blue/10 px-1.5 py-0.5 rounded"
                >
                  {g.description}
                </span>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

const QUICK_ENTRIES = [
  { emoji: "🎭", label: "铸造厂", desc: "创建 Agent" },
  { emoji: "👁️", label: "单人剧场", desc: "Agent 独白" },
  { emoji: "🏘️", label: "群体沙盒", desc: "多 Agent 互动" },
  { emoji: "🥊", label: "竞技场", desc: "Agent PK" },
];
