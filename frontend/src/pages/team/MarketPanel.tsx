import { useState } from "react";
import { useMarketList, useDownloadTeam, useDeleteMarketItem } from "../../api/market";
import { useCreateTeam } from "../../api/teams";
import type { MarketItemSummary } from "../../types/market";
import Card from "../../components/shared/Card";
import EmptyState from "../../components/shared/EmptyState";

/** Team 模板库——本地保存/复用 Team 配置。 */
export default function MarketPanel() {
  const { data: items = [], isLoading } = useMarketList();
  const downloadTeam = useDownloadTeam();
  const createTeam = useCreateTeam();
  const deleteItem = useDeleteMarketItem();
  const [msg, setMsg] = useState<string | null>(null);

  const handleDownload = async (item: MarketItemSummary) => {
    try {
      const config = await downloadTeam.mutateAsync(item.id);
      await createTeam.mutateAsync({
        name: `${config.name}（模板）`,
        description: config.description,
        agent_ids: config.agent_ids,
        roles: config.roles,
      });
      setMsg(`✅ 已从模板创建「${item.name}」`);
      setTimeout(() => setMsg(null), 3000);
    } catch { setMsg("创建失败"); }
  };

  if (isLoading) return <p className="text-xs font-mono text-text-secondary/60">加载中…</p>;

  return (
    <div className="space-y-4">
      {msg && (
        <div className="px-3 py-2 rounded border border-accent-green/40 bg-accent-green/5 text-xs font-mono text-accent-green animate-fade-in">
          {msg}
        </div>
      )}
      {items.length === 0 ? (
        <EmptyState title="暂无模板" description="在 Team 卡片上点「存模板」将配置保存为模板" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {items.map((item) => (
            <Card key={item.id} className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="text-sm font-mono text-text-primary">{item.name}</h3>
                  <p className="text-xs text-text-secondary/60 mt-0.5">
                    下载 {item.downloads} 次 · {item.tags?.join(" · ")}
                  </p>
                </div>
              </div>
              <p className="text-xs text-text-secondary mb-3 line-clamp-2">{item.description}</p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={downloadTeam.isPending}
                  onClick={() => handleDownload(item)}
                  className="text-xs font-mono text-accent-orange hover:text-accent-orange/80 transition-colors"
                >
                  📋 从模板创建
                </button>
                <button
                  type="button"
                  disabled={deleteItem.isPending}
                  onClick={async () => {
                    if (!window.confirm(`确定删除模板「${item.name}」？`)) return;
                    try { await deleteItem.mutateAsync(item.id); setMsg("已删除"); setTimeout(() => setMsg(null), 2000); }
                    catch { setMsg("删除失败"); }
                  }}
                  className="px-2 py-1 text-xs font-mono rounded border border-accent-red/30 text-accent-red hover:bg-accent-red/10 transition-colors"
                >
                  🗑 删除
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
