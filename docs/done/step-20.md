# Step 20 — 主观察界面 (M3)

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-18 |
| Phase | Phase 7.5 |
| Plan 章节 | [development-plan.md](../development-plan.md) §7.5 |
| 状态 | ✅ done |

## 产出

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/types/sandbox.ts` | 新建 | 定义沙盒阶段、速度、状态、Timeline 和 EventFeed Props 类型 |
| `frontend/src/mocks/sandbox.ts` | 新建 | 3 个内置场景、关系变化事件和有序 Mock SSE 事件流 |
| `frontend/src/components/world/Timeline.tsx` | 新建 | Tick 聚合时间线、事件数量和关系变化标记 |
| `frontend/src/components/world/EventFeed.tsx` | 新建 | 事件流展示、Tick 筛选和关系变化元数据 |
| `frontend/src/components/world/SandboxSetup.tsx` | 新建 | Agent 与场景选择、启动入口 |
| `frontend/src/components/world/SandboxHeader.tsx` | 新建 | World、Tick、运行状态、暂停/继续、速度和重置控制 |
| `frontend/src/pages/GroupSandbox.tsx` | 新建 | M3 主观察界面、Mock 事件播放器和三栏布局 |
| `frontend/src/App.tsx` | 修改 | `/sandbox` 从占位页面接入 `GroupSandbox` |
| `frontend/src/components/world/world-components.test.tsx` | 新建 | Timeline、EventFeed、SandboxSetup、SandboxHeader 和 GroupSandbox 测试 |
| `frontend/vitest.config.ts` | 新建 | Vitest + jsdom + React 测试配置 |
| `frontend/src/test/setup.ts` | 新建 | Testing Library DOM 匹配器初始化 |
| `frontend/package.json` | 修改 | 添加 `test` 脚本和前端测试依赖 |

## 决策记录

- **Mock 独立运行：** Step 20 当前是前端观察界面，不直接依赖后端 DB 或 LLM；使用独立的 `MOCK_SANDBOX_EVENTS` 验证完整页面和事件流。
- **复用已完成组件：** 复用 Step 19 的 `AgentStatusPanel`、`ThoughtStream`，以及共享的 `Card`、`StatusDot`。
- **关系演化边界：** 本步展示 `relationship_change` 事件和关系变化元数据；关系网络图属于 Step 21，完整群体动力学不在本步实现范围。
- **速度切换：** 修复运行中切换 Speed 后定时器未重新调度的问题，并通过前端测试和手动回归验证。

## 接口变更

- 新增 `frontend/src/types/sandbox.ts` 的页面内部类型，不修改 Phase 0 共享类型。
- ⚠️ **BREAKING：** 修改 Step 16 产出 `frontend/src/App.tsx`，将 `/sandbox` 从 `PlaceholderPage` 切换为 `GroupSandbox`。已重新回归 Dashboard、M1、M2 和 Sidebar。

## 组件树

```text
GroupSandbox (/sandbox)
├── SandboxSetup
│   ├── AgentSelection
│   └── ScenarioSelection
└── running
    ├── SandboxHeader
    ├── AgentStatusPanel × N
    ├── Timeline
    ├── EventFeed
    └── ThoughtStream
```

## 测试结果

- [x] 前端 Layer 1：Vitest `5 passed`
- [x] 前端 Layer 2：Mock 模式可独立运行，启动、事件推送和组件交互通过
- [x] 后端回归：pytest `168 passed`，仅有已有 Starlette deprecation warning
- [x] TypeScript：`pnpm exec tsc --noEmit` 通过
- [x] 生产构建：`pnpm run build` 通过
- [x] 代码检查：`git diff --check` 通过
- [x] Step 16 回归：Dashboard、M1、M2、Sidebar 通过
- [x] 手动交互：启动、Tick 推进、关系事件、Tick 筛选、暂停、继续、Speed 1x/2x、重置通过

## 视觉走查

- [x] 暗色主题一致
- [x] 事件流与 Thought Stream 显示正常
- [x] 1280px 无横向溢出
- [x] 1920px：用户在普通 Chrome 模拟视口中确认三栏布局、事件流和控制栏正常
- [x] Mock 模式无需后端即可浏览和运行

## 已知问题

- Vite 构建产物约 583.35 kB，超过 500 kB 提示阈值；不影响本步功能，后续可通过代码分割优化。
- 后端测试存在已有 Starlette/httpx deprecation warning；不影响测试结果。
- `docs/bugs.md` 中已有 BUG-001 保持不变；本步发现的 Speed 问题已在本步修复并完成回归，不新增 bug 记录。

## 对下一步的提示

- **Step 21（关系网络图）：** 可直接消费本步的 `relationship_change` 事件和 `MOCK_SANDBOX_RELATIONSHIP_EVENTS`，实现 Agent 节点、关系边和关系变化动画。
- 后续接入真实 World/SSE 时，将 `useSandboxMockSSE` 替换为 Step 18 的真实 `useSSE` 数据源。
