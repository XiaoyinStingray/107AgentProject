# Step 21 — 关系网络图

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-18 |
| Phase | Phase 7.6 |
| Plan 章节 | [development-plan.md](../development-plan.md) §7.6 |
| 状态 | ✅ done |

## 产出

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/components/world/RelationshipGraph.tsx` | 新建 | SVG 圆形布局关系网络图，边颜色编码（绿/红/灰）+ 线宽动态变化 + 事件高亮动画 |
| `frontend/src/pages/GroupSandbox.tsx` | 修改 | 中间栏集成 RelationshipGraph，Timeline 与关系图双列并排 |
| `frontend/src/components/world/world-components.test.tsx` | 修改 | 新增 3 个 RelationshipGraph 测试用例 |

## 决策记录

- **SVG 自绘而非图表库：** recharts 不提供 NetworkGraph 组件，采用纯 SVG 绘制节点和边，无需引入新依赖。
- **圆形布局：** 3–8 个 Agent 时等分排列在圆周上，从正上方顺时针展开。
- **边聚合策略：** 对同一对 Agent 的多条 `relationship_change` 事件取最新 `score`，A↔B 与 B↔A 合并为同一边。
- **高亮动画：** 最新 `relationship_change` 事件触发对应边 1.2s 脉冲高亮，之后自动恢复。
- **布局调整：** 中间栏顶部使用 `grid grid-cols-2` 双列布局，Timeline 与 RelationshipGraph 并排，EventFeed 仍占满下方。

## 接口变更

- 新增 `RelationshipEdge` 接口（从 `RelationshipGraph.tsx` 导出），不修改 Phase 0 共享类型。
- ⚠️ **BREAKING：** 修改 Step 20 产出 `GroupSandbox.tsx` 中间栏布局（Timeline 从全宽变为半宽），已回归测试通过。

## 组件树

```text
GroupSandbox (/sandbox)
├── SandboxSetup
│   ├── AgentSelection
│   └── ScenarioSelection
└── running
    ├── SandboxHeader
    ├── AgentStatusPanel × N
    ├── [grid-cols-2]
    │   ├── Timeline
    │   └── RelationshipGraph ← Step 21
    ├── EventFeed
    └── ThoughtStream
```

## 测试结果

- [x] 前端 Layer 1：Vitest `8 passed`（5 原有 + 3 新增）
- [x] TypeScript：`npx tsc --noEmit` 无错误
- [x] 生产构建：`npx vite build` 通过（587 kB，已有 chunk 体积警告不影响功能）
- [x] Step 20 回归：GroupSandbox 启动、Tick 推进、速度切换测试通过

## 视觉走查

- [x] 暗色主题一致——节点使用 `bg-card` 背景 + `border` 描边，边颜色取自设计 Token
- [x] 图例（友好/中立/敌对）清晰展示颜色编码
- [x] 1280px 不炸——双列布局自适应，SVG `viewBox` 自动缩放
- [x] Mock 模式可独立浏览——无需后端

## 已知问题

- Vite 构建产物 587 kB，超过 500 kB 提示阈值（已有问题，同 Step 20）。
- 当前环境 pytest 未安装，后端回归未执行；Step 21 仅修改前端文件，不影响后端。
- `docs/bugs.md` BUG-001 保持不变；本步未发现新 bug。

## 对下一步的提示

- **Step 22（竞技场页面 M4）：** 依赖 Step 16 前端骨架，可直接开始。
- 后续接入真实 SSE 数据源时，`aggregateEdges` 函数可直接消费后端推送的 `relationship_change` 事件，无需修改组件接口。
