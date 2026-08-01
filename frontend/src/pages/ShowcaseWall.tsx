/**
 * ShowcaseWall — Step 100a: M12 产出展示墙页面。
 *
 * 卡片瀑布流布局。所有 Worker 产出自动汇聚成卡片。
 * 支持按 Agent 筛选、按文件类型筛选、按时间排序。
 */

import { useMemo, useState } from "react";
import Card from "../components/shared/Card";
import WorkCard from "../components/showcase/WorkCard";
import CardFlyIn from "../components/showcase/CardFlyIn";
import { useWorkerHistory } from "../api/workers";

const AGENT_COLORS = [
  "#5588CC", "#EE8899", "#DD9944", "#66AA88", "#8866CC",
  "#CC6655", "#5599AA", "#AA77BB", "#88AA55", "#CC8866",
];

function agentColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  return AGENT_COLORS[Math.abs(h) % AGENT_COLORS.length];
}

export default function ShowcaseWall() {
  const { data: history = [], isLoading } = useWorkerHistory();
  const [filterAgent, setFilterAgent] = useState<string>("全部");
  const [sortBy, setSortBy] = useState<"newest" | "steps" | "files">("newest");

  // 提取所有 Agent
  const agents = useMemo(() => {
    const names = new Set<string>();
    history.forEach((h: any) => names.add(h.agent_name));
    return ["全部", ...Array.from(names)];
  }, [history]);

  // 筛选 + 排序
  const filtered = useMemo(() => {
    let result = [...history];
    if (filterAgent !== "全部") {
      result = result.filter((h: any) => h.agent_name === filterAgent);
    }
    switch (sortBy) {
      case "steps":
        result.sort((a: any, b: any) => (b.steps ?? 0) - (a.steps ?? 0));
        break;
      case "files":
        result.sort((a: any, b: any) => (b.files?.length ?? 0) - (a.files?.length ?? 0));
        break;
      default:
        result.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return result;
  }, [history, filterAgent, sortBy]);

  // 空状态
  if (!isLoading && history.length === 0) {
    return (
      <div className="h-full flex items-center justify-center animate-fade-in">
        <div className="text-center space-y-4">
          <p className="text-3xl">🛠️</p>
          <p className="text-lg font-mono text-text-primary">还没有成果</p>
          <p className="text-sm font-mono text-text-secondary max-w-md">
            给你的 Agent 一个任务，它产出的报告、数据、代码会自动出现在这面墙上。
          </p>
          <a
            href="/bench/worker"
            className="inline-block px-4 py-2 text-xs font-mono rounded-lg border border-accent-orange/40 bg-accent-orange/10 text-accent-orange hover:bg-accent-orange/20 transition-colors"
          >
            🚀 去 Worker 工作台
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-mono text-accent-orange">🖼️ Agent 成果墙</h1>
          <p className="text-xs font-mono text-text-secondary mt-1">
            {filtered.length} 个成果
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-3 mb-4">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Agent filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono text-text-secondary">🏷️</span>
            {agents.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setFilterAgent(name)}
                className={`px-2 py-0.5 text-[10px] font-mono rounded border transition-colors ${
                  filterAgent === name
                    ? "border-accent-orange/60 bg-accent-orange/10 text-accent-orange"
                    : "border-border text-text-secondary hover:border-text-secondary/40"
                }`}
              >
                {name}
              </button>
            ))}
          </div>

          <div className="w-px h-4 bg-border" />

          {/* Sort */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono text-text-secondary">排序:</span>
            {(["newest", "steps", "files"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSortBy(s)}
                className={`px-2 py-0.5 text-[10px] font-mono rounded border transition-colors ${
                  sortBy === s
                    ? "border-accent-blue/60 bg-accent-blue/10 text-accent-blue"
                    : "border-border text-text-secondary hover:border-text-secondary/40"
                }`}
              >
                {s === "newest" ? "最新" : s === "steps" ? "步数" : "文件数"}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Card grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <span className="text-sm font-mono text-text-secondary animate-pulse">加载中...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((item: any, i: number) => (
            <CardFlyIn key={item.run_id} index={i}>
              <WorkCard
                runId={item.run_id}
                agentName={item.agent_name}
                agentEmoji="🤖"
                agentColor={agentColor(item.agent_name)}
                task={item.task}
                steps={item.steps ?? 0}
                files={item.files ?? []}
                createdAt={item.created_at}
                onShare={(runId) => {
                  navigator.clipboard?.writeText(`lifelab://card/${runId}`);
                }}
              />
            </CardFlyIn>
          ))}
        </div>
      )}
    </div>
  );
}
