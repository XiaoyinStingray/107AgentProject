/** Step 22/26 竞技场支持的模式，与 development-plan.md 的 ArenaMode 对齐。 */
export type ArenaMode = "debate" | "interview" | "pitch";

/** Step 22 前端页面的本地运行阶段。 */
export type ArenaPhase = "setup" | "running" | "judging" | "result";

/** 发起一次 1v1 竞技所需的前端配置。 */
export interface ArenaConfig {
  agent_a_id: string;
  agent_b_id: string;
  mode: ArenaMode;
  topic: string;
  rounds: number;
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
  score_breakdowns: Record<string, ArenaScoreBreakdown>;
}

/** 竞技模式在设置界面中的展示配置。 */
export interface ArenaModeOption {
  value: ArenaMode;
  label: string;
  description: string;
  default_topic: string;
}
