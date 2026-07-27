/** Step 56 — Agent 市场类型定义 */

export interface MarketItemSummary {
  id: string;
  team_id: string;
  name: string;
  description: string;
  tags: string[];
  author: string;
  downloads: number;
  rating: number;
  rating_count: number;
  created_at: string;
}

export interface MarketItemDetail extends MarketItemSummary {
  team?: {
    id: string;
    name: string;
    description: string;
    agent_ids: string[];
    roles: { agent_id: string; role: string; reason: string }[];
  };
}

export interface MarketCreate {
  team_id: string;
  name: string;
  description?: string;
  tags?: string[];
  author?: string;
}

export interface TeamDownload {
  name: string;
  description: string;
  agent_ids: string[];
  roles: { agent_id: string; role: string; reason: string }[];
}
