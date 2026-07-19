# Step 22 — 竞技场页面 (M4)

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-19 |
| Phase | Phase 7.7 |
| Plan 章节 | [development-plan.md](../development-plan.md) §7.7 |
| 状态 | ✅ done |

## 产出

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/mocks/arena.ts` | 新建 | Mock 辩论赛完整结果（分数/评语/对话记录）+ 3 个预置辩题 |
| `frontend/src/pages/Arena.tsx` | 新建 | 竞技场页面：模式选择 → Agent 配对 → 辩题 → 2s mock 裁决 → 结果展示 |
| `frontend/src/components/world/arena-components.test.tsx` | 新建 | 4 个 Arena 测试用例 |
| `frontend/src/App.tsx` | 修改 | Arena 路由从 PlaceholderPage 切换为真实组件 |

## 决策记录

- **仅实现辩论赛模式：** 面试竞争和路演对决用 Tab 占位（disabled + P2 Badge），Phase 8 竞技引擎上线后三种模式才真正分化。
- **Agent 来源复用 `useAvailableAgents`：** 与铸造厂/沙盒一致——Zustand store + MOCK_AGENTS 合并去重。
- **Mock 结果预制：** 后端 ArenaEngine 是 Phase 8 的事。前端用预置的小明 vs 小刚辩论结果，含 4 维评分 + 裁判评语 + 3 轮对话记录。
- **三阶段流程：** `setup` → `debating`（逐轮展开对话，1.8s/条）→ `judging`（1.5s 裁判评分动画）→ `result`。
- **评分维度：** 论点质量 / 表达能力 / 应变能力 / 人设一致性，每项 0–10 分，总分 40。

## 接口变更

- 新增 `ArenaScore`、`ArenaTranscriptRound`、`ArenaJudgeComment` 接口（从 `mocks/arena.ts` 导出），不修改 Phase 0 共享类型。
- ⚠️ BREAKING: 修改 Step 16 产出 `App.tsx` 中 Arena 路由（PlaceholderPage → <Arena />），已回归测试通过。

## 组件树

```text
Arena (/arena)
├── setup
│   ├── mode tabs（辩论赛 active / 面试竞争 🚧 / 路演对决 🚧）
│   ├── AgentSelector × 2（正方 / 反方，从 useAvailableAgents 取）
│   ├── 辩题选择（3 预设 + 自定义）
│   └── 开始按钮
├── running（2s mock 延迟 + 加载动画）
└── result
    ├── 胜者横幅
    ├── 比分对比（ScoreBar × 4 维度 × 2 人）
    ├── 裁判评语
    └── 对话记录（按轮次分组，TranscriptBubble 左右交替）
```

## 测试结果

- [x] 前端 Layer 1：Vitest `12 passed`（8 原有 + 4 新增）
- [x] TypeScript：`npx tsc --noEmit` 无错误
- [x] 生产构建：`npx vite build` 通过（599 kB，chunk 体积警告为已有问题）
- [x] Step 16 回归：Arena 路由从占位页切换为真实组件，其余路由不受影响

## 视觉走查

- [x] 暗色主题一致——模式 Tab 使用 design token 色值
- [x] 1280px 不炸——grid-cols-2 Agent 选择器 + 比分对比自适应
- [x] Mock 模式可独立浏览——无需后端

## 已知问题

- 面试竞争和路演对决为占位 Tab，Phase 8 实现 ArenaEngine 后补充。
- 当前 Mock 结果始终返回小明获胜，后续接真实 ArenaEngine 后动态生成。
- Vite 构建产物 599 kB，超过 500 kB 提示阈值（已有问题，同 Step 20–21）。

## 对下一步的提示

- **Step 23（叙事页面 M5）：** 依赖 Step 15（叙事引擎）+ Step 16（前端骨架），可直接开始。
- Phase 8（ArenaEngine）实现后，替换 Mock 数据为真实 API 调用。
- `ArenaScore`、`ArenaJudgeComment` 接口已定义，Phase 8 后端对齐即可。
