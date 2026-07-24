import type { BigFive } from "../../types/agent";
import type { RemixField } from "../../types/remix";

export const TRAIT_OPTIONS: Array<[keyof BigFive, string]> = [
  ["openness", "开放性"],
  ["conscientiousness", "尽责性"],
  ["extraversion", "外向性"],
  ["agreeableness", "宜人性"],
  ["neuroticism", "神经质"],
];

export const PRESERVE_OPTIONS: Array<[RemixField, string]> = [
  ["name", "姓名"],
  ["mbti", "MBTI"],
  ["big_five", "大五人格"],
  ["values", "价值观"],
  ["decision_style", "决策风格"],
  ["narrative", "人格画像"],
  ["background", "成长背景"],
  ["goals", "目标"],
];

export const DEFAULT_PRESERVE_FIELDS: RemixField[] = [
  "name",
  "background",
  "goals",
];
