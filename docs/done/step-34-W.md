# Step 34-W — World 管理完善

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-23 |
| Phase | Phase 10.6.5 |
| Plan 章节 | [plan-state2.md](../plan-state2.md) §Step 34-W |
| 状态 | ✅ done |

## 产出

### 后端

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/api/worlds.py` | 修改 | 新增 `DELETE /{world_id}` 端点——删 World、清理 SSE 引擎、结束 simulation |

### 前端

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/api/worlds.ts` | 修改 | 新增 `useDeleteWorld()` mutation hook |
| `frontend/src/components/world/SandboxSetup.tsx` | 重写 | 两段式布局——上方 World 列表（状态图标 + 继续/删除），下方新建表单 |
| `frontend/src/components/world/SandboxHeader.tsx` | 修改 | 新增「⏎ 返回列表」按钮（不重置 World，保留状态回到 setup） |
| `frontend/src/pages/GroupSandbox.tsx` | 修改 | +`handleResumeWorld`/`handleDeleteWorld`/`handleBack`；`handleBack` 强制刷新 World 缓存 |

### 测试

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/tests/test_worlds_api.py` | 修改 | +`TestDeleteWorld`（2 个用例） |
| `frontend/src/components/world/world-components.test.tsx` | 修改 | 适配新 props + 4 按钮布局 |
| `frontend/src/pages/GroupSandbox.test.tsx` | 修改 | mock `useWorlds`/`useDeleteWorld` + `QueryClientProvider` |

## 决策记录

- **保留 `useSandboxStore` 自动恢复：** 从干预台回来大概率想继续当前对话，自动恢复体验更好。改为混合模式：有活跃 World → 自动进运行；点"返回列表"→ 手动选择。
- **"返回列表"与"结束"分离：** "⏎ 返回列表"只断开 SSE 回到 setup（World 保留状态、列表可见）；"✕ 结束"调 reset API 标记 idle。用户暂停后可以浏览/切换 World 而不会丢失进度。
- **World 删除后端行为：** `DELETE /{id}` 同时清理 SSE 引擎（unregister + finish simulation + 从 _active_worlds 移除）和内存存储（pop），保证无残留。

## 接口与兼容性

- 新增 `DELETE /api/worlds/{id}` 端点，返回 204（成功）或 404。
- `SandboxSetup` props 新增 `worlds`、`onResumeWorld`、`onDeleteWorld`（必填）。
- `SandboxHeader` props 新增 `onBack`（必填）。
- 无破坏性变更——其他模块不依赖这些组件。

## 测试结果

- [x] 后端全量测试 — ✅ 214 passed
- [x] 前端全量测试 — ✅ 203 passed（13 files）

## 验收记录

- [x] World 列表显示所有 World + 状态图标 + Tick + Agent 数 — ✅
- [x] 点击「继续」→ 直接 resume running/paused 的 World — ✅
- [x] 点击「✕」→ DELETE → World 从列表消失 — ✅
- [x] 自动恢复保留（干预台回来直接进运行）— ✅
- [x] 「⏎ 返回列表」保留 World 状态回 setup — ✅
- [x] 「✕ 结束」重置 World 到 idle — ✅
- [x] 新建 World 后返回列表立即显示（缓存刷新）— ✅
- [x] 人工 CHECK-2 — ✅ 2026-07-23 用户确认通过

## 对下一步的提示

- Step 34-S（场景自定义）需要在 `SandboxSetup` 的场景选择区接入自定义场景列表。
- World 持久化（内存→SQLite）在 Step 35 完成，届时 delete 也需要真删除 DB 记录。
