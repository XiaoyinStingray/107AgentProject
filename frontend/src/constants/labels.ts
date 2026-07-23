/**
 * 标签常量——各组件共享的表情/决策标签。
 * 之前分散在 AgentCard / AgentStatusPanel / AgentFoundry 中。
 */

/** 情绪状态 → 显示文本 */
export const EMOTION_LABELS: Record<string, string> = {
  happy: "😊 开心",
  sad: "😢 悲伤",
  angry: "😤 愤怒",
  anxious: "😰 焦虑",
  excited: "😆 兴奋",
  neutral: "😐 平静",
};

/** 决策风格维度 → 中文标签 */
export const DECISION_LABELS = [
  ["info_processing", "信息处理"],
  ["risk_preference", "风险偏好"],
  ["social_tendency", "社交倾向"],
  ["stress_response", "压力反应"],
] as const;

/** 决策风格取值 → 显示文本 */
export const DECISION_VALUE_LABELS: Record<string, string> = {
  intuitive: "直觉型",
  analytical: "分析型",
  balanced: "平衡型",
  averse: "规避",
  moderate: "适中",
  seeking: "寻求",
  competitive: "竞争型",
  cooperative: "合作型",
  independent: "独立型",
  avoidant: "回避型",
  reactive: "反应型",
  adaptive: "适应型",
  resilient: "韧性型",
};
