/** Step 46 竞技场支持的全部模式，与后端 ArenaMode 对齐。 */
export type ArenaMode =
  | "debate"
  | "interview"
  | "pitch"
  | "battle_royale"
  | "blind_test";

/** 1v1 页面允许选择的模式。 */
export type DuelArenaMode = Exclude<ArenaMode, "battle_royale">;

/** Step 22 前端页面的本地运行阶段。 */
export type ArenaPhase = "setup" | "running" | "judging" | "result";

/** 发起一次 1v1 竞技所需的前端配置。 */
export interface ArenaConfig {
  agent_a_id: string;
  agent_b_id: string;
  mode: DuelArenaMode;
  topic: string;
  rounds: number;
}

/** 发起 6–8 人自由淘汰赛所需的配置。 */
export interface BattleRoyaleConfig {
  agent_ids: string[];
  topic: string;
}

/**
 * 一条可展示的竞技发言。
 *
 * development-plan.md 将 transcript 定义为 list[dict]；Step 22 在不改变
 * ArenaResult 外层结构的前提下，将页面需要读取的字段显式类型化。
 */
export interface ArenaTranscriptEntry {
  id: string;
  round: number;
  speaker_id: string;
  speaker_name: string;
  content: string;
  stage_score?: number | null;
  stage_rank?: number | null;
  advanced?: boolean | null;
}

/** Step 26 ArenaResult 的 TypeScript 对应类型。 */
export interface ArenaResult {
  winner_id: string;
  scores: Record<string, number>;
  judge_reasoning: string;
  transcript: ArenaTranscriptEntry[];
}

/** Step 22 展示层使用的四维评分；每项 0-10，总分 0-40。 */
export interface ArenaScoreBreakdown {
  argument_quality: number;
  expression: number;
  adaptability: number;
  character_consistency: number;
  total: number;
}

/**
 * 前端 Mock 的增强展示结果。
 *
 * ArenaResult 保持 development-plan.md 的接口不变，多维评分只作为展示层扩展，
 * 后续接入 Step 26 时可由适配层补充或省略。
 */
export interface ArenaPresentationResult extends ArenaResult {
  id: string;
  mode: ArenaMode;
  topic: string;
  rounds: number;
  participant_ids: string[];
  participant_names: Record<string, string>;
  score_breakdowns: Record<string, ArenaScoreBreakdown>;
  created_at: string;
}

/** 竞技模式在设置界面中的展示配置。 */
export interface ArenaModeOption {
  value: DuelArenaMode;
  label: string;
  description: string;
  default_topic: string;
}

/** 后端返回的一条完整身份化发言。 */
export interface ArenaApiTranscriptEntry {
  turn: number;
  round: number;
  speaker_id: string;
  speaker: string;
  content: string;
  stage_score?: number | null;
  stage_rank?: number | null;
  advanced?: boolean | null;
}

/** 后端 ArenaResultResponse 的 TypeScript 镜像。 */
export interface ArenaApiResult {
  id: string;
  mode: ArenaMode;
  winner_id: string;
  scores: Record<string, number>;
  score_breakdown: Record<string, Record<string, number>>;
  judge_reasoning: string;
  transcript: ArenaApiTranscriptEntry[];
  topic: string;
  rounds: number;
  participant_ids: string[];
  participant_names: Record<string, string>;
  created_at: string;
}

/** 后端结构化 Markdown 战报响应。 */
export interface ArenaReportResponse {
  arena_id: string;
  title: string;
  markdown: string;
}
