/**
 * Export API hooks — React Query 封装。
 * 对应后端 POST /api/export/report。
 */

import { useMutation } from "@tanstack/react-query";
import { client } from "./client";

export interface ExportReportRequest {
  agent_id: string;
  world_id?: string;
  format?: "markdown" | "json";
}

export interface ExportReportResponse {
  content: string;
  format: string;
  filename: string;
}

/** 导出研究报告（Markdown / JSON） */
export function useExportReport() {
  return useMutation({
    mutationFn: (req: ExportReportRequest) =>
      client.post<ExportReportResponse>("/export/report", req),
  });
}
