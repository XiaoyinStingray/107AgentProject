# Step 43 — 控制台全功能 (#36–#39) + 联调 Bug 修复

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-24 |
| Phase | Phase 12.5 |
| Plan 章节 | [plan-state2.md](../plan-state2.md) §Step 43 |
| 状态 | ✅ done |

## 产出

### 控制台真实数据 (#36–#39)

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/types/control.ts` | 修改 | 新增 `convertSimEventsToSSE()` 转换函数 + `SimEvent` 类型导入 |
| `frontend/src/pages/ControlPanel.tsx` | 修改 | 移除 `MOCK_SANDBOX_EVENTS`，改用 `useWorlds()` + `useWorldEvents()` + World 选择器 |
| `frontend/src/components/control/control-components.test.tsx` | 修改 | 新增 `useWorlds`/`useWorldEvents` mock，SSE→SimEvent 反向适配 |

### 联调 Bug 修复（CHECK-2 验收发现）

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/engines/world/messages.py` | 修改 | ① 新增 `_build_action_description()` 生成可读行动描述（替代原始函数调用语法）② `_tool_call_to_event` 空描述时返回 None ③ `_clean_group_content` 清除文本中泄漏的工具调用模式 |
| `frontend/src/components/agent/ThoughtBubble.tsx` | 修改 | ① 新增 `resolveBodyText()` 从 `event.data` 提取有意义字段 ② `stripToolCallSyntax()` 兜底清除残留乱码 ③ 空内容事件返回 null 不渲染 |

## 决策记录

- **客户端搜索 vs 后端搜索：** Plan 提到 `GET /api/agents?q=keyword`，但 Agent 上限 25 个，客户端过滤已足够，不新增后端参数。
- **单 World 事件 vs 跨 World 聚合：** 热力图和仪表盘展示单个 World 的事件，不同 World 事件混在一起无意义。
- **SimEvent → SSEEvent 映射：** `source_agent_id → agent_id`、`description → content/description`，通过 `convertSimEventsToSSE` 适配。
- **行动描述可读化：** 原 `_tool_call_to_event` 生成 `"调用工具: think_aloud({'thought': '...'})"` 导致乱码。改为按工具名提取有意义内容：`think_aloud` → 思考原文，`set_goal` → "设定目标: ..."，`observe` → "观察: ..."。
- **空事件防护：** `_build_action_description` 返回空字符串时不创建事件；前端 `ThoughtBubble` 对无 bodyText 的事件返回 null。

## 接口变更

无接口变更。所有改动为前端内部适配 + 后端事件描述格式优化。

## 测试结果

- [x] 控制组件测试 45/45 通过 — ✅
- [x] 前端全量测试 219/220 通过（1 个 Arena.test.tsx 预先存在失败，与 Step 43 无关） — ✅
- [x] 后端世界引擎 + SSE 测试 20/20 通过 — ✅
- [x] 人工验收 — ✅

## 已知问题

- `Arena.test.tsx` 有 1 个预先存在的测试失败（heading 查找问题），与 Step 43 无关

## 对下一步的提示

- Phase 12 功能补全进行中。Step 43 完成后可继续 Step 44（干预台完善）。
- 行动描述已可读化，后续新增工具需同步更新 `_build_action_description()`。
