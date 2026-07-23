/**
 * 集中管理所有 React Query key。
 * 禁止各模块手写字符串——用工厂函数，避免拼写不一致导致缓存失效。
 *
 * 追加规则：后续 Step 每新增一个实体，在此文件追加对应的 keys 工厂。
 */

export const agentKeys = {
  all: ["agents"] as const,
  detail: (id: string) => ["agents", id] as const,
};

export const worldKeys = {
  all: ["worlds"] as const,
  detail: (id: string) => ["worlds", id] as const,
  events: (id: string) => ["worlds", id, "events"] as const,
  relationships: (id: string) => ["worlds", id, "relationships"] as const,
};

export const narrativeKeys = {
  all: ["narratives"] as const,
};

export const scenarioKeys = {
  all: ["scenarios"] as const,
};

export const arenaKeys = {
  all: ["arenas"] as const,
  detail: (id: string) => ["arenas", id] as const,
};
