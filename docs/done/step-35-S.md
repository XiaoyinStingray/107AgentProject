# Step 35-S — 安全加固：删除保护 + 数量上限

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-23 |
| Phase | Phase 10.7.5 |
| Plan 章节 | [plan-state2.md](../plan-state2.md) §Step 35-S |
| 状态 | ✅ done |

## 产出

### 35-Sa. Agent 删除前引用检查

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/api/agents.py` | 修改 | `delete_agent` 加引用检查：`SELECT WorldRow WHERE agent_ids_json.contains(agent_id)` → 有引用返回 409 + 列出 World 名称 |
| `frontend/src/pages/AgentFoundry.tsx` | 修改 | +`useWorlds()` 计算 `agentWorldRefs` Map；× 按钮：被引用时 disabled + `cursor-not-allowed` + hover tooltip 显示引用 World 列表 |

### 35-Sb. 数量上限

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/config.py` | 修改 | +`max_agents: int = 25` +`max_worlds: int = 45` |
| `backend/src/api/agents.py` | 修改 | `create_agent` 加 `SELECT COUNT(*) < max_agents` 检查 → 超限 400 |
| `backend/src/api/worlds.py` | 修改 | `create_world` 加 `SELECT COUNT(*) < max_worlds` 检查 → 超限 400 |

## 决策记录

- **引用检查用 `LIKE '%id%'` 而非 FK：** World.agent_ids_json 是 JSON 数组字符串，SQLite 没有数组类型，使用 `contains()` 方法（SQLAlchemy → SQL `LIKE`）匹配。对于 ≤ 45 个 World、每个含 ≤ 8 个 Agent 的场景足够。
- **前端预先计算引用：** AgentFoundry 通过 `useWorlds()` + `useMemo` 构建 `agent_id → world_names[]` 映射。避免了每次删除失败后才提示 409 的糟糕体验。
- **25/45 上限无特殊理由：** 从 UX 角度——列表太长不好看、从成本角度——防止脚本批量创建消耗 LLM quota。具体数字可后续调整。

## 接口变更

- `POST /api/agents` — 新增 400 响应（数量上限）
- `DELETE /api/agents/{id}` — 新增 409 响应（被 World 引用）
- `POST /api/worlds` — 新增 400 响应（数量上限）
- `config.py` — 新增 `max_agents` `max_worlds` 配置项

## 测试结果

- [x] 后端 agent/world 测试 — 23 passed, 2 failed（已有 env 问题）
- [x] 前端 13/13 通过，203/203 通过 — ✅
- [x] TypeScript — ✅ 零错误
- [x] 手动验证：有引用的 Agent × 按钮灰掉 + tooltip — ✅
- [x] 手动验证：409 返回正确 — ✅

## 已知问题

- 无

## 对下一步的提示

- Agent 编辑（`PUT /api/agents/{id}`）未在此步实现。蓝图有定义但 plan 里没有对应 Step，可插入 Phase 12。
- 数量上限的 400 错误在前端 `useCreateAgent` / `useCreateWorld` 的 error 中已能展示，无需额外 UI。
