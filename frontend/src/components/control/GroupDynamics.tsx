import { useState } from "react";
import { useWorlds } from "../../api/worlds";
import { useGenerateReport } from "../../api/narratives";
import type { ReportResponse } from "../../api/narratives";
import Card from "../shared/Card";

function downloadReport(report: ReportResponse) {
  const text = `# ${report.title}\n\n> 生成时间: ${new Date(report.generated_at).toLocaleString()}\n\n---\n\n${report.content}`;
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${report.title.replace(/[^a-zA-Z0-9一-鿿]/g, "_")}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * 群体动力学报告组件 — Step 41 (#21)。
 * 选择 World → 调 POST /api/narratives/report → 展示 LLM 分析报告。
 */
export default function GroupDynamics() {
  const { data: worlds = [] } = useWorlds();
  const generateReport = useGenerateReport();
  const [selectedWorldId, setSelectedWorldId] = useState<string>(
    worlds[0]?.id ?? "",
  );
  const [report, setReport] = useState<ReportResponse | null>(null);

  const handleGenerate = async () => {
    if (!selectedWorldId) return;
    try {
      const result = await generateReport.mutateAsync({
        world_id: selectedWorldId,
      });
      setReport(result);
    } catch {
      setReport(null);
    }
  };

  const groupWorlds = worlds.filter((w) => w.world_type !== "solo");

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <label className="text-xs font-mono text-text-secondary">
          选择 World:
        </label>
        <select
          value={selectedWorldId}
          onChange={(e) => setSelectedWorldId(e.target.value)}
          className="bg-bg-secondary border border-border rounded px-2 py-1 text-xs font-mono text-text-primary focus:outline-none focus:border-accent-green"
        >
          {groupWorlds.length === 0 && (
            <option value="">暂无群体 World</option>
          )}
          {groupWorlds.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name} (tick {w.current_tick})
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={
            generateReport.isPending || !selectedWorldId || groupWorlds.length === 0
          }
          className="px-3 py-1 text-xs font-mono rounded border border-accent-green/60 bg-accent-green/10 text-accent-green hover:bg-accent-green/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {generateReport.isPending ? "分析中..." : "生成报告"}
        </button>
      </div>

      {generateReport.isError && (
        <p className="text-sm text-accent-red font-mono">
          报告生成失败：
          {generateReport.error instanceof Error
            ? generateReport.error.message
            : "未知错误"}
        </p>
      )}

      {report && (
        <div className="space-y-3 animate-fade-in">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-mono text-accent-green">
              {report.title}
            </h3>
            <button
              type="button"
              onClick={() => downloadReport(report)}
              className="px-3 py-1 text-xs font-mono rounded border border-border text-text-secondary hover:border-accent-green hover:text-accent-green transition-colors"
            >
              ⬇ 下载 .md
            </button>
          </div>
          <p className="text-xs font-mono text-text-secondary/60">
            生成时间: {new Date(report.generated_at).toLocaleString()}
          </p>
          <div className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap font-mono">
            {report.content}
          </div>
        </div>
      )}

      {!report && !generateReport.isPending && !generateReport.isError && (
        <p className="text-xs font-mono text-text-secondary/60 text-center py-8">
          选择一个群体 World 并点击「生成报告」，LLM 将分析群体互动并生成动力学报告
        </p>
      )}
    </Card>
  );
}
