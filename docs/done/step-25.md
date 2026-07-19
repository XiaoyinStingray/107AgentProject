# Step 25 — 档案馆 (M8)

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-19 |
| Phase | Phase 7.10 |
| Plan 章节 | [development-plan.md](../development-plan.md) §7.3.10 |
| 状态 | ✅ done |

## 产出

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/types/archive.ts` | 新建 | M8 档案馆类型：ArchiveTab / ReplayRecord / ExperimentTemplate / Achievement / AchievementSummary / ExportConfig + 4 面板 Props |
| `frontend/src/mocks/archive.ts` | 新建 | M8 Mock + 工具函数：ARCHIVE_TABS（7 项）+ MOCK_REPLAYS（3 条）+ MOCK_TEMPLATES（3 条，复用 Step 20 场景）+ MOCK_ACHIEVEMENTS（10 项）+ MOCK_ACHIEVEMENT_SUMMARY + formatReplayStatus/replayStatusColor/formatArchiveTime/generateMockReport/downloadAsFile |
| `frontend/src/pages/Archive.tsx` | 新建 | M8 档案馆页面：Tab 栏（4 可用 + 3 P3 disabled）+ 条件渲染 4 个子面板 + EmptyState 占位 |
| `frontend/src/components/archive/archive-components.test.tsx` | 新建 | 27 个 Vitest 测试：Tab 栏/切换、4 面板渲染、导出交互、Mock 工具函数 |
| `frontend/src/App.tsx` | 修改 | `/archive` 路由从 PlaceholderPage 切换为真实 Archive 组件 |

## 决策记录

- **7 个 Tab 中 4 个可用 + 3 个 P3 占位：** 与 menuData.ts M8 模块 7 项（#50-#56）对齐。精彩回放/实验模板/成就系统/报告导出标 P2 可用；Agent 市场/社区数据大屏/API 开放标 P3 disabled + Badge，延续 Step 22-24 的占位模式。

- **实验模板复用 MOCK_SANDBOX_SCENARIOS：** 模板数据直接映射 Step 20 的内置场景（新生报到/期末周/毕业选择），保证用户在沙盒观察后切到档案馆能看到一致的模板。

- **成就系统纯 Mock：** 10 个成就中 3 个已解锁（造物主/三人成众/说书人），7 个显示进度百分比。解锁状态为硬编码——后端成就 API 尚未存在。

- **报告导出走 Blob 下载：** 使用 `URL.createObjectURL` + `<a>` 标签模拟下载。jsdom 中无 `URL.createObjectURL`，测试中用 `vi.stubGlobal` mock。

- **Agent 来源复用 `useAvailableAgents`：** Zustand store + MOCK_AGENTS 合并去重，与 Arena/SoloTheater/GroupSandbox/NarrativeFactory/ControlPanel/DirectorIntervention 一致。

- **Archive.tsx 359 行，超过 300 行规范：** 4 个面板组件（HighlightsPanel/TemplatesPanel/AchievementsPanel/ExportPanel）逻辑简单且仅在本页使用，暂不拆分为独立文件。如需拆分可将每个面板提取到 `components/archive/` 目录。

## 接口变更

```typescript
// 新增类型（types/archive.ts）
export type ArchiveTab = "highlights" | "templates" | "achievements" | "export" | "market" | "dashboard" | "api";
export interface ReplayRecord { id; scenarioName; agents: AgentResponse[]; totalTicks; status; createdAt; eventCount; }
export interface ExperimentTemplate { id; name; description; scenario: Scenario; suggestedAgents; estimatedTicks; tags; }
export interface Achievement { id; emoji; title; description; progress; unlocked; unlockedAt?; }
export interface AchievementSummary { totalAgents; totalSimulations; totalTicks; totalNarratives; }
export interface ExportConfig { agentId; format; includeNarratives; includeEvents; includeStats; }
```

- ⚠️ BREAKING: 修改 Step 16 产出 `App.tsx` 中 `/archive` 路由（PlaceholderPage → Archive 组件），已回归测试通过。
- 不修改 Phase 0 共享类型。所有新增类型为本步独有，定义在前端 types/ 层。

## 组件树

```text
Archive (/archive)
├── Tab 栏（4 可用 + 3 P3 disabled）
│   └── 每个 Tab：emoji + label + Badge(P2/P3)
├── highlights → HighlightsPanel
│   └── ReplayCard ×N（场景名 + Agent 标签 + 状态 + Tick/事件计数 + 时间）
├── templates → TemplatesPanel
│   └── TemplateCard ×N（名称 + 描述 + 标签 + Agent 数/Tick 数 + 使用模板按钮）
├── achievements → AchievementsPanel
│   ├── SummaryCard ×4（Agent 数 / 模拟次数 / 总 Tick / 叙事数）
│   └── AchievementCard ×N（emoji + 标题 + 描述 + 进度条 + 解锁状态）
├── export → ExportPanel
│   ├── Agent 选择卡片网格（头像 + 名称 + MBTI）
│   ├── 格式切换（Markdown / JSON）
│   └── 导出按钮 + 成功提示（2s 自动消失）
└── market/dashboard/api → EmptyState (P3)
```

## 测试结果

- [x] 前端 Layer 1：Vitest `139 passed`（6 test files）
  - M8 档案馆：27 tests（Tab 栏/切换、HighlightsPanel、TemplatesPanel、AchievementsPanel、ExportPanel、Mock 工具函数）
- [x] TypeScript：`npx tsc --noEmit` 无错误
- [x] 生产构建：`npx vite build` 通过（662 kB，chunk 体积警告为已有问题）
- [x] Step 16 回归：`/archive` 路由从占位页切换为真实组件，其余路由不受影响
- [x] 后端测试回归：未修改后端代码，无需重跑

## 视觉走查

- [x] 暗色主题一致——所有色彩使用 design token（bg-bg-card / text-accent-green / text-accent-purple / border-border 等）
- [x] 1280px 不炸——grid-cols-1 md:grid-cols-2/3/5 响应式布局
- [x] Mock 模式可独立浏览——无需后端，MOCK_REPLAYS + MOCK_TEMPLATES + MOCK_ACHIEVEMENTS + MOCK_AGENTS 驱动
- [x] Tab 切换 / 导出成功提示 fade-in 动画流畅
- [x] 导出按钮 disabled 状态逻辑正确（未选 Agent 时 disabled）

## 已知问题

- Vite 构建产物 662 kB，超过 500 kB 提示阈值（已有问题，同 Step 20–24）。
- BUG-001（React Router Future Flag 警告）仍存在，不影响功能。
- Archive.tsx 超过 300 行规范（359 行），如后续需拆分子面板可提取到 `components/archive/`。

## 对下一步的提示

- **Phase 7 前端全部完成（Step 16-25）。** 10 个模块页面均已实现，56 个菜单中 P1/P2 功能可用，P3 以 EmptyState 占位。
- **Step 26（竞技引擎）：** 后端模块，依赖 Step 5/9。与前端无关。
- **Step 27（56 菜单铺量 + 报告导出）：** 需要将 P3 占位页逐步替换为真实功能，并实现 PDF 报告导出（当前仅支持 Markdown/JSON 前端下载）。
- `ArchiveTab` / `ReplayRecord` / `ExperimentTemplate` / `Achievement` 类型已定义，后端对齐即可直接复用。

---

## 补充记录（2026-07-19 交互修复）

### 修复问题

档案馆页面的按钮无交互响应（BUG）：

1. **"使用模板"按钮**：`<button>` 存在但无 `onClick` 处理器，点击无反应
2. **回放记录卡片**：Card 有 `hover` 视觉反馈但无点击交互

### 修复方案

| 文件 | 修改 |
|------|------|
| `pages/Archive.tsx` | 给"使用模板"按钮添加 `onClick` → `navigate("/sandbox", { state: { scenario } })`；给回放卡片添加"🔄 查看回放"按钮 → 同样导航到沙盒 |
| `pages/GroupSandbox.tsx` | 添加 `useLocation()` 读取路由状态，预选场景（非破坏性，默认值仍为"期末周"） |
| `archive-components.test.tsx` | 用 `MemoryRouter` 包裹组件（`useNavigate` 需要 Router 上下文） |
| `world-components.test.tsx` | 同上（`useLocation` 需要 Router 上下文） |

### 验证结果

- ✅ TypeScript 检查通过
- ✅ 139 个测试全部通过
- ✅ 生产构建成功 (662 kB)

### 影响范围

- ⚠️ 回溯修改 Step 20 产出 `GroupSandbox.tsx`（添加 `useLocation`），已回归测试通过。
- 修改为向后兼容：无路由状态时行为与修改前完全一致。
