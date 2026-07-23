# Step 36 — API 层收敛 + 重复代码消除

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-23 |
| Phase | Phase 11.1 |
| Plan 章节 | [plan-state2.md](../plan-state2.md) §Step 36 |
| 状态 | ✅ done |

## 产出

### 36a. API 层补全

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/api/simulations.ts` | **新建** | `useSimulations()` `useSimulation(id)` — 对应后端 GET /api/simulations |
| `frontend/src/api/export.ts` | **新建** | `useExportReport()` — 对应后端 POST /api/export/report |
| `frontend/src/api/achievements.ts` | **新建** | `useAchievements()` — 当前 Mock 数据，Step 45 切后端 |
| `frontend/src/api/queryKeys.ts` | 修改 | 追加 `simulationKeys` `achievementKeys` |
| `frontend/src/utils/formatDate.ts` | **新建** | `formatDateTime()` `formatDate()` — 统一日期格式化 |

### 36b. 重复代码消除

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/pages/AgentFoundry.tsx` | 修改 | 删除 Zustand `addAgent` 双写——React Query 成为唯一 Agent 数据源 |
| `frontend/src/pages/Arena.tsx` | 修改 | `useAvailableAgents()` → `useAgents()`；删 MOCK_AGENTS + useAgentStore + useMemo 依赖 |
| `frontend/src/pages/NarrativeFactory.tsx` | 修改 | `useAvailableAgents()` → `useAgents()`；内联 `formatTime` → 共享 `formatDateTime` |
| `frontend/src/pages/ControlPanel.tsx` | 修改 | `useAvailableAgents()` → `useAgents()`；删 MOCK_AGENTS + useAgentStore + useMemo 依赖 |
| `frontend/src/pages/Archive.tsx` | 修改 | `useAvailableAgents()` → `useAgents()`；`useAvailableWorlds()` → `useWorlds()`；删 MOCK_AGENTS + useAgentStore + AgentResponse/WorldResponse type 依赖 |

### 36c. 测试适配

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/components/control/control-components.test.tsx` | 修改 | +`QueryClientProvider` + mock `useAgents` |
| `frontend/src/components/narrative/narrative-components.test.tsx` | 修改 | +`QueryClientProvider` + mock `useAgents` |
| `frontend/src/components/archive/archive-components.test.tsx` | 修改 | +`QueryClientProvider` + mock `useAgents` + mock `useWorlds` |
| `frontend/src/pages/Arena.test.tsx` | 修改 | +mock `useAgents`（代替 `useAgentStore.setState`）；+`QueryClientProvider`；+ResizeObserver polyfill |

### 消除的重复

- ❌ `useAvailableAgents()` × 4 处（Arena / NarrativeFactory / ControlPanel / Archive）
- ❌ `useAvailableWorlds()` × 1 处（Archive）
- ❌ `formatTime()` 内联 × 1 处（NarrativeFactory）
- ❌ Zustand `useAgentStore.addAgent` 双写 × 1 处（AgentFoundry）

## 决策记录

- **跳过 `useAutoScroll` 提取：** ThoughtStream 和 EventFeed 的滚动逻辑经过大量调试，改动风险高。不在此步合并。
- **保守的常量抽取：** `DECISION_LABELS` / `DECISION_VALUE_LABELS` 仍内联在 AgentFoundry，留给 Step 37。
- **ControlPanel events 保留 Mock：** `MOCK_SANDBOX_EVENTS` 不在此步替换，留给 Step 43。

## 接口变更

- 无 BREAKING。所有 API hook 接口与 Step 29 一致。`useAvailableAgents()` 移除为内部重构，无外部调用方。

## 测试结果

- [x] TypeScript — ✅ 零错误
- [x] 前端 13/13 测试文件通过，203/203 测试通过 — ✅
- [x] 后端无回归 — ✅ 212 passed, 2 failed（已有 env 问题）

## 已知问题

- **BUG-006 已修复：** M4/M5/M6 现在统一从 `useAgents()` 获取 Agent 列表，M1 创建后自动同步。
- **ResizeObserver polyfill：** Arena.test.tsx 中 jsdom 缺少 ResizeObserver，已在 `beforeEach` 中 polyfill。

## 对下一步的提示

- Step 37（共享组件 + 常量抽取）可将 `DECISION_LABELS`、`DECISION_VALUE_LABELS` 移入 `constants/labels.ts`
- Step 43 将 ControlPanel 的 events 从 Mock 切到真实 API
- `useAchievements()` hook 已就绪，Step 45 只需换 queryFn 实现
