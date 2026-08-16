import type { TeamOutcome } from "../types/team";

export function teamOutcomeLabel(
  outcome: TeamOutcome | null | undefined,
  failedSteps = 0,
): string {
  if (outcome === "partial") return `部分完成${failedSteps ? `（${failedSteps} 步失败）` : ""}`;
  if (outcome === "failed") return `执行失败${failedSteps ? `（${failedSteps} 步失败）` : ""}`;
  return "已完成";
}

export function teamOutcomeVariant(
  outcome: TeamOutcome | null | undefined,
): "P0" | "P1" | "P2" {
  if (outcome === "failed") return "P0";
  if (outcome === "partial") return "P1";
  return "P2";
}
