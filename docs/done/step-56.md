# Step 56 — Team 模板

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-27 |
| Phase | Phase 15.1 |
| Plan 章节 | [plan-state3.md](../plan-state3.md) §Step 56 |
| 状态 | ✅ done |

## 产出

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/models/market_orm.py` | **新建** | `MarketItem` ORM（id, team_id, name, description, tags, author, downloads） |
| `backend/src/api/market.py` | **新建** | `POST/GET /api/market` + `GET /api/market/{id}` + `POST /api/market/{id}/download` |
| `backend/src/db.py` | 修改 | 注册 market_orm |
| `backend/src/main.py` | 修改 | 注册 market router |
| `frontend/src/types/market.ts` | **新建** | MarketItemSummary / MarketItemDetail / MarketCreate / TeamDownload 类型 |
| `frontend/src/api/market.ts` | **新建** | useMarketList / usePublishTeam / useDownloadTeam |
| `frontend/src/pages/team/MarketPanel.tsx` | **新建** | 模板浏览 + 下载创建 |
| `frontend/src/pages/TeamDashboard.tsx` | 修改 | +「📦 Team 模板」按钮 + Team 卡片「存模板」按钮 |

## 决策记录

- **降级为本地模板库**：原计划"Agent 市场"需要用户系统和联网。当前是单机版，改为本地模板——保存 Team 配置（agent_ids + roles）到 market_items 表，用户可浏览和复用。
- **去掉评分系统**：单用户无评分场景。

## 测试结果

- [x] 后端 302/302 — ✅
- [x] 前端 232/232 — ✅
- [x] TypeScript 零错误 — ✅

## 对下一步的提示

- Step 57（API 开放）可继续
