import { useNavigate } from "react-router-dom";
import Card from "../components/shared/Card";
import Badge from "../components/shared/Badge";
import StatusDot from "../components/shared/StatusDot";
import { useAgents } from "../api/agents";

/**
 * Dashboard 总览——首页。
 * 展示系统状态概览 + 最近 Agent 列表。
 */
export default function Home() {
  const navigate = useNavigate();
  const { data: agents = [] } = useAgents();

  return (
    <div className="p-6 animate-fade-in">
      <h1 className="text-2xl font-mono text-accent-green mb-1">
        人生实验室 · Life Lab
      </h1>
      <p className="text-sm text-text-secondary font-mono mb-8">
        USTC × Life Lab · Agent 社会实验平台 v0.1.0
      </p>

      {/* 快捷入口 */}
      <div className="grid grid-cols-6 gap-4 mb-8">
        {QUICK_ENTRIES.map((entry) => (
          <Card
            key={entry.label}
            hover
            onClick={() => navigate(entry.route)}
            className="flex items-center gap-3"
          >
            <span className="text-2xl">{entry.emoji}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-mono text-text-primary truncate">
                  {entry.label}
                </p>
                <Badge label={entry.tier} variant={entry.tier} />
              </div>
              <p className="text-sm text-text-secondary mt-0.5">
                {entry.desc}
              </p>
            </div>
          </Card>
        ))}
      </div>

      {/* 最近 Agent */}
      <h2 className="text-sm font-mono text-text-secondary uppercase tracking-wider mb-3">
        最近创建的 Agent · {agents.length} 个
      </h2>
      {agents.length === 0 ? (
        <Card>
          <p className="text-sm text-text-secondary/60 font-mono text-center py-6">
            暂无 Agent — 前往 M1 铸造厂创建你的第一个 AI 角色
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {agents.map((agent) => (
            <Card key={agent.id} hover onClick={() => navigate(`/agents/${agent.id}`)}>
              <div className="flex items-center gap-2 mb-2">
                <StatusDot
                  status={agent.energy > 70 ? "active" : "idle"}
                  label=""
                />
                <span className="font-mono text-sm text-text-primary">
                  {agent.name}
                </span>
                <span className="ml-auto text-sm text-text-secondary font-mono">
                  {agent.persona.mbti}
                </span>
              </div>
              <p className="text-sm text-text-secondary line-clamp-3">
                {agent.persona.narrative.slice(0, 120)}…
              </p>
              <div className="flex gap-2 mt-2">
                {agent.goals.slice(0, 2).map((g) => (
                  <span
                    key={g.id}
                    className="text-xs font-mono text-accent-blue/70 bg-accent-blue/10 px-1.5 py-0.5 rounded"
                  >
                    {g.description}
                  </span>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* 彩蛋 */}
      <p className="mt-12 text-xs text-text-secondary/30 font-mono text-center">
        🌸 科大校园，人生如戏
      </p>
    </div>
  );
}

const QUICK_ENTRIES = [
  { emoji: "🎭", label: "M1 铸造厂", desc: "创建 Agent", route: "/agents", tier: "P0" as const },
  { emoji: "🎬", label: "M2 单人剧场", desc: "Agent 独白", route: "/theater", tier: "P0" as const },
  { emoji: "🏘️", label: "M3 群体沙盒", desc: "多 Agent 互动", route: "/sandbox", tier: "P0" as const },
  { emoji: "🥊", label: "M4 竞技场", desc: "Agent PK", route: "/arena", tier: "P1" as const },
  { emoji: "📖", label: "M5 叙事工厂", desc: "事件→故事", route: "/narratives", tier: "P1" as const },
  { emoji: "📊", label: "M6 控制台", desc: "多 Agent 仪表盘", route: "/control", tier: "P1" as const },
  { emoji: "📡", label: "M7 干预台", desc: "导演模式", route: "/intervention", tier: "P2" as const },
  { emoji: "📦", label: "M8 档案馆", desc: "市场·回放·导出", route: "/archive", tier: "P2" as const },
  { emoji: "👥", label: "M9 Agent Team", desc: "团队协作", route: "/team", tier: "P1" as const },
  { emoji: "🔬", label: "M10 LLM Bench", desc: "大模型评测", route: "/bench", tier: "P1" as const },
  { emoji: "🎮", label: "M11 游戏化场景", desc: "科大校园 RPG", route: "/scene", tier: "P1" as const },
  { emoji: "💻", label: "M12 Worker 工作台", desc: "终端 · 产出墙", route: "/worker", tier: "P0" as const },
];
