import { useEffect, useState } from "react";
import { useArenaReport, useArenas } from "../../api/arenas";
import Badge from "../../components/shared/Badge";
import Card from "../../components/shared/Card";
import EmptyState from "../../components/shared/EmptyState";
import LoadingSpinner from "../../components/shared/LoadingSpinner";


/** #24 战报：读取已持久化竞技记录并展示、复制或下载 Markdown。 */
export default function ArenaReportView() {
  const { data: arenas = [], isLoading, error } = useArenas();
  const [selectedArenaId, setSelectedArenaId] = useState<string | null>(null);
  const [copyLabel, setCopyLabel] = useState("复制 Markdown");
  const report = useArenaReport(selectedArenaId);

  useEffect(() => {
    if (
      arenas.length > 0 &&
      !arenas.some((arena) => arena.id === selectedArenaId)
    ) {
      setSelectedArenaId(arenas[0]!.id);
    }
  }, [arenas, selectedArenaId]);

  const handleCopy = async () => {
    if (!report.data) return;
    try {
      await navigator.clipboard.writeText(report.data.markdown);
      setCopyLabel("已复制");
    } catch {
      setCopyLabel("复制失败");
    }
  };

  const handleDownload = () => {
    if (!report.data) return;
    try {
      const blob = new Blob([report.data.markdown], {
        type: "text/markdown;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `arena-report-${report.data.arena_id}.md`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setCopyLabel("下载失败");
    }
  };

  if (isLoading) {
    return <LoadingSpinner icon="📋" title="正在读取竞技历史…" fullscreen />;
  }

  if (error) {
    return (
      <div className="h-full p-6">
        <EmptyState
          title="竞技历史读取失败"
          description={error instanceof Error ? error.message : "请稍后重试。"}
          tier="P2"
        />
      </div>
    );
  }

  if (arenas.length === 0) {
    return (
      <div className="h-full p-6">
        <EmptyState
          title="还没有可生成的战报"
          description="先完成一场 1v1 或大乱斗，再回到这里查看。"
          tier="P2"
        />
      </div>
    );
  }

  return (
    <div className="min-h-full max-w-6xl mx-auto p-6 space-y-5 animate-fade-in motion-reduce:animate-none">
      <header>
        <div className="flex items-center gap-3 mb-2">
          <p className="text-xs font-mono text-accent-orange">
            M4 / MATCH REPORT
          </p>
          <Badge label="P2" variant="P2" />
        </div>
        <h1 className="text-2xl font-mono text-text-primary">竞技战报</h1>
        <p className="text-sm text-text-secondary mt-2">
          战报从完整历史记录生成，不会产生额外 LLM 费用。
        </p>
      </header>

      <Card>
        <label
          htmlFor="arena-report-select"
          className="block text-xs font-mono text-text-secondary mb-2"
        >
          选择比赛
        </label>
        <select
          id="arena-report-select"
          value={selectedArenaId ?? ""}
          onChange={(event) => setSelectedArenaId(event.target.value)}
          className="w-full rounded border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary font-mono focus:border-accent-orange focus:outline-none"
        >
          {arenas.map((arena) => (
            <option key={arena.id} value={arena.id}>
              {arena.topic} · {arena.mode} · {arena.created_at.slice(0, 10)}
            </option>
          ))}
        </select>
      </Card>

      {report.isLoading && (
        <LoadingSpinner icon="📋" title="正在生成战报…" />
      )}
      {report.error && (
        <p role="alert" className="text-sm font-mono text-accent-red">
          {report.error instanceof Error
            ? report.error.message
            : "战报读取失败"}
        </p>
      )}
      {report.data && (
        <Card>
          <div className="flex flex-wrap items-center gap-3 border-b border-border pb-3 mb-4">
            <h2 className="text-sm font-mono text-text-primary">
              {report.data.title}
            </h2>
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className="rounded border border-border px-3 py-2 text-xs font-mono text-text-secondary hover:text-accent-blue"
              >
                {copyLabel}
              </button>
              <button
                type="button"
                onClick={handleDownload}
                className="rounded border border-accent-orange/40 px-3 py-2 text-xs font-mono text-accent-orange"
              >
                下载 .md
              </button>
            </div>
          </div>
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-text-secondary">
            {report.data.markdown}
          </pre>
        </Card>
      )}
    </div>
  );
}
