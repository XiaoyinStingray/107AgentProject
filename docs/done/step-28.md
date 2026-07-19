# Step 28 — 演示脚本 + 最终联调

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-19 |
| Phase | Phase 9.2（计划表编号；正文对应 §9.3） |
| Plan 章节 | [development-plan.md](../development-plan.md) §9.3 |
| 状态 | ✅ done |

## 产出

| 文件 | 操作 | 说明 |
|------|------|------|
| `docs/demo-script.md` | 新建 | 5 分钟演示流程、启动命令、Mock/API 数据来源、失败降级方案和视觉走查清单 |
| `frontend/src/components/layout/FeatureRouteBoundary.tsx` | 新建 | 统一解析 56 菜单 hash；P0–P2 显示当前功能，P3 显示统一占位 |
| `frontend/src/components/layout/feature-route-boundary.test.tsx` | 新建 | hash 解析、跨路由隔离、P0–P3 行为和 56 项唯一性测试 |
| `frontend/src/components/layout/Layout.tsx` | 修改 | 在共享布局中接入 `FeatureRouteBoundary` |
| `frontend/src/hooks/useApi.ts` | 修改 | 修复 Mock 请求被 AbortController 误取消；保留真实 API 请求取消能力 |
| `frontend/src/hooks/useApi.test.tsx` | 新建 | Mock/真实请求、竞态、卸载、重置、错误和 POST 请求测试 |
| `frontend/src/App.tsx` | 修改 | `/debug/sse` 仅在 Vite 开发环境注册，生产构建返回项目 404 |
| `frontend/src/vite-env.d.ts` | 新建 | 声明 Vite `ImportMetaEnv` 工具类型 |
| `backend/src/engines/arena/engine.py` | 修改 | RoundRobin 仅包含两名辩手，裁判改为赛后独立评分 |
| `backend/tests/test_arena_engine.py` | 修改 | 将 `run_debate` 集成测试拆出，满足单文件 300 行限制 |
| `backend/tests/test_arena_run_debate.py` | 新建 | 验证辩手列表、轮数、裁判过滤、评分次数和异常降级 |
| `docs/bugs.md` | 修改 | 删除已修复并验证的 BUG-002、BUG-005、BUG-006 |

## 决策记录

- **Mock 模式作为演示主路径：** 当前前端 SSE、竞技场和叙事便利类型与后端真实事件/结果结构尚未完全联通。演示脚本明确数据来源与降级路径，不在最后联调步骤猜测或新增 API。
- **56 菜单采用共享 hash 边界：** 不逐页重复解析 hash。P0–P2 保留已实现模块并显示当前功能，P3 统一展示“后续版本继续开发”占位。
- **裁判不参与 RoundRobin：** 两名辩手完成 `rounds * 2` 次轮转后，再由现有 `_judge_score()` 独立评分，符合 Plan 的“最后追加裁判评分”。
- **调试页按构建环境隐藏：** 开发环境保留 `/debug/sse` 测试能力，生产环境不注册该路由。
- **未新增依赖：** `package.json`、锁文件和 `requirements.txt` 均未修改。

## 接口变更

- 无共享 Pydantic model、TS 领域接口或 API 路由变更。
- `useApi<TResponse, TBody>()` 的公开签名保持不变，仅修正 Mock/真实请求的内部取消语义。
- `ArenaEngine.run_debate()` 的公开签名和 `ArenaResult` 保持不变。
- ⚠️ **BREAKING / BACKTRACK Step 16：** 修改 `App.tsx` 和 `Layout.tsx` 的路由渲染行为；调试路由改为仅开发环境可用，菜单 hash 由共享边界响应。已重跑全部前端测试和生产构建。
- ⚠️ **BREAKING / BACKTRACK Step 17：** AgentFoundry 使用的共享 `useApi` Mock 行为被修复；未修改 AgentFoundry 文件或调用接口。已覆盖连续请求和卸载竞态测试。
- ⚠️ **BREAKING / BACKTRACK Step 26：** 竞技场 RoundRobin participants 从“辩手 A + 辩手 B + 裁判”调整为仅两名辩手；这是预期行为修复，已重跑竞技场及后端全量测试。

## 测试结果

- [x] 菜单 hash 定向测试 — ✅ 17 passed
- [x] `useApi` 定向测试 — ✅ 9 passed
- [x] 竞技场定向测试 — ✅ 14 passed
- [x] 前端全量测试 — ✅ 197 passed
- [x] 后端全量测试 — ✅ 194 passed
- [x] TypeScript + Vite 生产构建 — ✅ 通过
- [x] 开发运行时：`/arena#item-22`、P3 占位和 `/debug/sse` — ✅ 通过
- [x] 生产运行时：竞技场可用、`/debug/sse` 返回项目 404 — ✅ 通过
- [x] 手动视觉与交互验证 — ✅ 通过（用户确认）
- [x] 代码规范：文件行数、函数拆分、禁用样式/类型、`git diff --check` — ✅ 通过

## 已知问题

- BUG-001：React Router v7 Future Flag 警告仍存在，不影响当前功能。
- BUG-003：M7 干预事件仍未接入沙盒共享状态。
- BUG-004：档案馆成就系统仍使用静态 Mock 数据。
- 生产主包约 669.68 kB，超过 Vite 500 kB 提示阈值；不影响运行，后续宜做路由级懒加载和拆包。
- Step 25 的 `ExportPanel` 测试仍有未包裹 `act(...)` 的警告；后端 Starlette TestClient 有依赖弃用提示。
- 真 SSE、Arena 前后端和叙事真实 API 的结构仍需后续专项联调；当前演示按 `docs/demo-script.md` 使用明确的 Mock 主路径。

## 组件树

```text
App
└── Layout
    └── FeatureRouteBoundary
        ├── P0–P2：Feature status bar + Outlet
        └── P3：EmptyState
```

## 视觉走查

- [x] 暗色主题一致 — ✅
- [x] 动画流畅且支持 `motion-reduce` — ✅
- [x] 1280×720 不溢出 — ✅
- [x] 1920×1080 布局正常 — ✅
- [x] Mock 模式可独立浏览 — ✅

## 对下一步的提示

- Step 28 是当前计划最后一步。演示前按 `docs/demo-script.md` 完整彩排一次，并优先使用 Mock 主路径。
- 若进入真实联调，先统一后端 SSE 事件与前端 `SSEEvent` 字段，再定义 Arena API 和前端结果适配层；不要直接复用当前 Mock 便利结构冒充真实接口。
- 后续性能治理可从路由懒加载开始，处理 Vite 主包体积警告。
