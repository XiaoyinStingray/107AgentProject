# Step 32 — 单人剧场 SSE 打通

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-21 |
| Phase | Phase 10.4 |
| Plan 章节 | [plan-state2.md](../plan-state2.md) §Step 32 |
| 状态 | ✅ done |

## 产出

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/api/sse.py` | 修改 | SSE 连续推流（while 循环驱动多 tick）+ `reset_world()` 函数 |
| `backend/src/api/worlds.py` | 修改 | 新增 `POST /{id}/reset` 端点 |
| `frontend/src/api/worlds.ts` | 修改 | 新增 `useResetWorld()` mutation |
| `frontend/src/pages/SoloTheater.tsx` | 修改 | 修复 `handleResume`（disconnect+重连替代 reload）+ `handleReset`（调后端 reset API） |
| `backend/src/api/agents.py` | 修改 | 修复路由尾部斜杠（`"/"` → `""`），消除 307 重定向 |
| `backend/src/api/worlds.py` | 修改 | 同上，修复路由尾部斜杠 |
| `backend/src/api/simulations.py` | 修改 | 同上 |
| `backend/src/api/arenas.py` | 修改 | 同上 |
| `backend/tests/test_sse.py` | 修改 | 适配 `_sse_event` 新单 dict 参数签名 |

## 决策记录

- **SSE 连续推流：** 原 `event_generator` 只调一次 `tick_stream()` 就结束，前端 EventSource 每次 tick 后断开重连。改为 `while engine.world.status == "running"` 循环，连续 yield 事件，直到 World 状态非 running。
- **重置走后端 API：** 原 `handleReset` 只清前端状态，后端 World 仍在 running。新增 `POST /api/worlds/{id}/reset` 端点，取消注册引擎 + 标记 idle + 清零 tick。
- **恢复不用 reload：** 原 `handleResume` 用 `window.location.reload()` 刷新整页。改为 disconnect + 短暂清空 worldId + setTimeout 恢复，触发 useSSE 的 useEffect 重连，体验更流畅。
- **路由尾部斜杠修复：** 发现 `@router.post("/")` 导致 FastAPI 对无斜杠请求返回 307 重定向，浏览器 POST 无法跟随。统一改为 `@router.post("")` / `@router.get("")`。影响 agents/worlds/simulations/arenas 四个路由文件。
- **字段对齐已在 Step 11 完成：** plan 中担心的 `source_agent_id` → `agent_id` / `description` → `content` 映射已在 `_event_to_dict()` 中实现，无需额外修改。

## 接口变更

- 新增 `POST /api/worlds/{world_id}/reset` — 重置 World 状态（idle + tick=0 + 取消引擎注册）
- 新增前端 `useResetWorld()` mutation hook
- 路由尾部斜杠修复（agents/worlds/simulations/arenas），无请求体/参数变更

## 测试结果

- [x] 后端全量测试 — ✅ 194 passed（修复 test_sse.py 签名后）
- [x] TypeScript 类型检查 — ✅ 0 errors
- [x] Vite 构建 — ✅ 成功（chunk size warning 为预存问题）
- [x] Vite 代理验证 — ✅ `GET /api/agents` 通过代理返回 200
- [x] M1 铸造厂功能验收 — ✅ LLM API Key 有效
- [x] M2 单人剧场功能验收 — ✅ 思维流实时展示 + pause/resume + 8tick 自动结束

## 已知问题

- Vite 构建 chunk size 警告（`vendor` chunk > 500KB），Step 38 优化。

## 补充修复（2026-07-21 下午 — 人工验收 + 迭代）

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/api/sse.py` | 修改 | paused 轮询保持连接；8 tick 上限 + session_end；name_map 填充 agent_name |
| `frontend/src/pages/SoloTheater.tsx` | 修改 | handlePause 去除 disconnect；isPaused 状态；handleResume loading guard |
| `backend/src/engines/world/engine.py` | 修改 | solo prompt 角色沉浸化；_extract_events_from_response 拆分 thought_stream + agent_message；WorldEngine 清空 _model_context |
| `backend/src/engines/agent_factory/factory.py` | 修改 | inject_context 清空 _model_context._messages（tick 间上下文隔离） |
| `frontend/src/types/events.ts` | 修改 | +connected/paused/error/session_end |
| `frontend/src/components/agent/ThoughtBubble.tsx` | 修改 | 基础设施事件跳过；session_end 结束气泡 |
| `frontend/src/components/world/EventFeed.tsx` | 修改 | 新类型 Record 补齐 |

### 验收迭代记录

- **只出思考不出话：** `_extract_events_from_response` 所有消息都当 thought_stream → 拆分为 inner_messages(thought) + chat_message(speech)，现在思维流同时显示"思考"和"对话"
- **场景上下文泄漏：** LifeAgent 复用 → 旧 tick 输出在新场景继续喂 → WorldEngine init + inject_context 清空 AutoGen `_messages`
- **暂停 409 风暴：** handleResume 无防连点 + handlePause 调用 disconnect 关闭 SSE → 去 disconnect + isPaused 状态 + isPending 禁用按钮
- **"unknown" 事件：** connected/paused 被 ThoughtBubble 渲染为 fallback → 基础设施事件跳过 + 类型补齐
- **继续不生效：** pause disconnect 后 SSE 没人收 → paused 轮询保持连接，resume 只改后端状态
- **无限独白：** 无终止条件 → 8 tick 上限 + session_end 结束气泡

## 对下一步的提示

- Step 33 群体沙盒 SSE 可复用本步的 `event_generator` while 循环模式
- `useResetWorld` mutation 可供 Step 33 的 GroupSandbox 重置使用
- 路由尾部斜杠已全局修复，后续新增路由注意用 `""` 而非 `"/"`
- 验收前需确保 `.env` 中 `LLM_API_KEY` 为有效密钥
