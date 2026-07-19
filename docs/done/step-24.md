# Step 24 — 控制台 + 干预台 (M6/M7)

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-19 |
| Phase | Phase 7.9 |
| Plan 章节 | [development-plan.md](../development-plan.md) §7.3.9 |
| 状态 | ✅ done |

## 产出

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/types/control.ts` | 新建 | M6 控制台类型：ControlTab / AgentStats / HeatmapCell / DecisionPattern + 4 组件 Props |
| `frontend/src/types/intervention.ts` | 新建 | M7 干预台类型：InjectionEventType / InjectionRecord / InjectionTypeMeta / InterventionPanel |
| `frontend/src/mocks/control.ts` | 新建 | M6 Mock + 工具函数：CONTROL_TABS（7 项）+ computeAgentStats/computeAllAgentStats/computeSummary/buildHeatmap/heatmapCellColor/computeDecisionPatterns/searchAgents/highlightMatch + 标签映射 |
| `frontend/src/mocks/intervention.ts` | 新建 | M7 Mock：INJECTION_TYPES（4 种）+ INTERVENTION_PLACEHOLDERS（5 个 P3）+ MOCK_INTERVENTION_HISTORY（3 条示例）+ createInjectionRecord/formatInjectionTime/generateInjectionId 工具函数 |
| `frontend/src/pages/ControlPanel.tsx` | 新建 | M6 控制台页面：Tab 栏（4 可用 + 3 P3 disabled）+ 条件渲染 4 个子组件 + EmptyState 占位 |
| `frontend/src/pages/DirectorIntervention.tsx` | 新建 | M7 干预台页面：事件注入表单（类型选择 + 目标 Agent + 描述 + 注入按钮）+ 5 个 P3 占位卡 + 干预历史侧栏 |
| `frontend/src/components/control/AgentDashboard.tsx` | 新建 | 多 Agent 仪表盘（P1）：顶部汇总 4 卡 + Agent 状态卡网格（精力条/情绪/计数/最后活跃） |
| `frontend/src/components/control/EventHeatmap.tsx` | 新建 | 事件热力图（P2）：Agent×Tick 矩阵 + 密度色阶 + 图例 |
| `frontend/src/components/control/AgentSearch.tsx` | 新建 | Agent 搜索（P2）：实时模糊匹配 + 高亮片段 + 价值观/目标匹配标记 |
| `frontend/src/components/control/DecisionPatterns.tsx` | 新建 | 决策模式识别（P2）：4 维柱状图 + Agent 决策快照表 |
| `frontend/src/components/control/control-components.test.tsx` | 新建 | 45 个 Vitest 测试：Tab 栏/切换、4 子组件渲染、Mock 工具函数 |
| `frontend/src/components/intervention/intervention-components.test.tsx` | 新建 | 37 个 Vitest 测试：注入表单交互、注入流程、干预历史、P3 占位、Mock 工具函数 |
| `frontend/src/App.tsx` | 修改 | `/control` 和 `/intervention` 路由从 PlaceholderPage 切换为真实组件 |

## 决策记录

- **数据源复用 MOCK_SANDBOX_EVENTS：** M6 控制台与 GroupSandbox（Step 20）共享同一事件源，保证用户在沙盒观察后切到控制台能看到一致的统计数据。

- **7 个 Tab 中 4 个可用 + 3 个 P3 占位：** 与 menuData.ts M6 模块 7 项对齐。异常检测/长期追踪/策略提取标 P3 disabled + Badge，延续 Step 22-23 的占位模式。

- **M7 干预台 1+5 布局：** 事件注入（P2）为主功能占左 2/3 宽度，5 个 P3 占位面板（上帝之声/时间回溯/分支探索/人格篡改/剧本模式）以 Card 形式排列在注入表单下方。干预历史作为侧栏占右 1/3。

- **注入表单类型驱动：** `needsTarget` 控制目标 Agent 选择器的显隐。world_event 不需要目标，其余 3 种需要。未选目标时注入按钮 disabled + 红色提示。

- **注入成功反馈 2 秒自动消失：** 使用 `setTimeout` + fake timer 测试覆盖。

- **Agent 来源复用 `useAvailableAgents`：** Zustand store + MOCK_AGENTS 合并去重，与 Arena/SoloTheater/GroupSandbox/NarrativeFactory 一致。

## 接口变更

```typescript
// 新增类型（types/control.ts）
export type ControlTab = "dashboard" | "heatmap" | "search" | "patterns" | "anomaly" | "tracking" | "strategy";
export interface AgentStats { agentId; agentName; mbti; energy; emotionLabel; actionCount; messageCount; thoughtCount; relationCount; lastActiveTick; values; }
export interface HeatmapCell { agentId; agentName; tick; count; }
export interface DecisionPattern { info_processing; risk_preference; social_tendency; stress_response; }

// 新增类型（types/intervention.ts）
export type InjectionEventType = "world_event" | "agent_message" | "agent_action" | "relationship_change";
export interface InjectionRecord { id; type; targetAgentId; targetName; description; timestamp; status; }
export interface InjectionTypeMeta { key; label; emoji; description; needsTarget; }
export type InterventionPanel = "inject" | "voice_of_god" | "rewind" | "branch" | "persona" | "history" | "script";
```

- ⚠️ BREAKING: 修改 Step 16 产出 `App.tsx` 中 `/control` 和 `/intervention` 路由（PlaceholderPage → 真实组件），已回归测试通过。
- 不修改 Phase 0 共享类型。所有新增类型为本步独有，定义在前端 types/ 层。

## 组件树

```text
ControlPanel (/control)
├── Tab 栏（4 可用 + 3 P3 disabled）
│   └── 每个 Tab：emoji + label + Badge(P1/P2/P3)
├── dashboard → AgentDashboard
│   ├── SummaryCard ×4（Agent 数 / 总事件 / 总 Tick / 行动消息思考）
│   └── AgentStatCard ×N（头像 + 精力条 + 情绪 + 4 维计数 + 最后活跃）
├── heatmap → EventHeatmap
│   ├── Agent×Tick 矩阵（横向滚动 + sticky 首列）
│   └── 密度图例（0/1/2/3/4+）
├── search → AgentSearch
│   ├── 搜索框（实时模糊匹配）
│   └── AgentResultCard ×N（高亮片段 + 价值观 + 目标）
├── patterns → DecisionPatterns
│   ├── DimensionChart ×4（信息处理/风险偏好/社交倾向/压力应对）
│   └── Agent 决策快照表
└── anomaly/tracking/strategy → EmptyState (P3)

DirectorIntervention (/intervention)
├── 左栏 (lg:col-span-2)
│   ├── 事件注入表单 (P2)
│   │   ├── 类型选择（4 种 InjectionType 按钮）
│   │   ├── 目标 Agent 选择器（needsTarget 时显示）
│   │   ├── 描述文本框（动态 placeholder）
│   │   └── 注入按钮 + 成功提示（2s 自动消失）
│   ├── P3 占位面板 ×5（上帝之声/时间回溯/分支探索/人格篡改/剧本模式）
└── 右栏 (lg:col-span-1)
    └── 干预历史侧栏
        ├── 记录计数 + 清空按钮
        └── HistoryItem ×N（类型 emoji + 目标 + 时间 + 描述）
```

## 测试结果

- [x] 前端 Layer 1：Vitest `107 passed`（5 test files）
  - M6 控制台：45 tests（Tab 栏/切换、AgentDashboard、EventHeatmap、AgentSearch、DecisionPatterns、Mock 工具函数）
  - M7 干预台：37 tests（注入表单渲染/交互、注入流程、干预历史、P3 占位、Mock 工具函数）
- [x] TypeScript：`npx tsc --noEmit` 无错误
- [x] 生产构建：`npx vite build` 通过（650 kB，chunk 体积警告为已有问题）
- [x] Step 16 回归：`/control` 和 `/intervention` 路由从占位页切换为真实组件，其余路由不受影响
- [x] 后端测试回归：未修改后端代码，无需重跑

## 视觉走查

- [x] 暗色主题一致——所有色彩使用 design token（bg-bg-card / text-accent-green / text-accent-orange / border-border 等）
- [x] 1280px 不炸——grid-cols-1 lg:grid-cols-3 响应式布局 + 热力图横向滚动
- [x] Mock 模式可独立浏览——无需后端，MOCK_AGENTS + MOCK_SANDBOX_EVENTS + MOCK_INTERVENTION_HISTORY 驱动
- [x] Tab 切换 / 注入流程 / 成功提示 fade-in 动画流畅
- [x] 注入按钮 disabled 状态逻辑正确（空描述 / 需目标但未选目标）

## 已知问题

- 后端 `/api/worlds/{id}/inject` 端点在 plan §5.1 路由表中列出但尚未实现，当前注入操作仅在前端状态中记录。后端接入后需将 `handleInject` 替换为 API 调用。
- Vite 构建产物 650 kB，超过 500 kB 提示阈值（已有问题，同 Step 20–23）。
- BUG-001（React Router Future Flag 警告）仍存在，不影响功能。

## 对下一步的提示

- **Step 25（档案馆 M8）：** 依赖 Step 16，可直接开始。需要创建 `Archive.tsx` 页面 + 可能的子组件。
- **后端注入 API：** 当 `/api/worlds/{id}/inject` 实现后，将 `DirectorIntervention` 中的 `handleInject` 替换为 `useApi` hook 的 POST 请求。接口应接收 `{ type, target_agent_id?, description }`，返回 `InjectionRecord`。
- **M6 数据源升级：** 当前 `MOCK_SANDBOX_EVENTS` 为静态数据。接真实 SSE 后，需从 `useSSEStore` 获取实时事件流传入 `AgentDashboard` / `EventHeatmap`。
- `ControlTab` / `InjectionEventType` / `InjectionRecord` 类型已定义，后端对齐即可直接复用。
