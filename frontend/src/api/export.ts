/**
 * Export API hook — React Query 封装。
 * BUG-009 fix: 匹配真实 GET /api/export/report/{world_id} 端点。
 */

import { useMutation } from "@tanstack/react-query";

/** 导出研究报告（Markdown / JSON 文件下载）。
 *  返回 Response blob，由调用方处理下载逻辑。 */
export function useExportReport() {
  return useMutation({
    mutationFn: async ({
      worldId,
      format,
    }: {
      worldId: string;
      format: "markdown" | "json";
    }) => {
      const ext = format === "markdown" ? "" : "/json";
      const resp = await fetch(`/api/export/report/${worldId}${ext}`);
      if (!resp.ok) {
        const detail = await resp.json().catch(() => ({ detail: resp.statusText }));
        throw new Error(detail.detail || "导出失败");
      }
      return resp.blob();
    },
  });
}
