# Step 38 — 死代码清理 + 路由懒加载

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-23 |
| Phase | Phase 11.3 |
| Plan 章节 | [plan-state2.md](../plan-state2.md) §Step 38 |
| 状态 | ✅ done |

## 产出

### 38a. 死代码清理

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/pages/debug/SSEDebug.tsx` | **删除** | 调试页面，仅 dev 路由引用 |
| `frontend/src/components/world/.gitkeep` | **删除** | 空占位文件 |
| `frontend/src/types/events.ts` | 修改 | 删除 `ThoughtEvent` interface（定义但无引用） |

### 38b. 路由懒加载

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/App.tsx` | 重写 | 8 个模块页面改为 `React.lazy` + `Suspense fallback`；SSEDebug 路由移除 |

### 测试适配

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/pages/Arena.test.tsx` | 修改 | 5 个 `renderApp` 测试改用 `findByRole` + `async`，适配 Suspense 异步渲染 |

## 决策记录

- **不删 `useSSE.ts`：** 初期以为是旧版 dead code，实际 SoloTheater、GroupSandbox 及其测试仍在引用。活代码，不碰。
- **不删 `WorldCreate` / `SimEvent` / `ExportConfig` 等类型：** 逐一检查引用后确认均在 api 层或 mock 中活跃使用。活代码，不碰。
- **跳过 38-S（文件拆分）：** Archive 465行 / NarrativeFactory 518行 / SoloTheater 412行 / narratives.ts 672行——超过 300 行阈值但未严重影响可维护性。风险收益比不划算。
- **懒加载 fallback 用 `<LoadingSpinner fullscreen>`：** 复用 Step 37 新建的共享组件，不再建额外的 `<LoadingSkeleton>`。

## 接口变更

- 删除 `/debug/sse` 路由（仅 dev 模式存在）
- 无其他 BREAKING

## 测试结果

- [x] TypeScript — ✅ 零错误
- [x] 前端 13/13 测试文件通过，203/203 测试通过 — ✅
- [x] 死代码已删除，引用关系已确认 — ✅

## 已知问题

- 无

## 对下一步的提示

- Phase 11 全部完成（36 ✅ 37 ✅ 38 ✅）。可进入 Phase 12 功能补全。
- Step 38-S（文件拆分）标记为 ⏭️ 跳过，如后续某文件膨胀到 800+ 行再考虑。
