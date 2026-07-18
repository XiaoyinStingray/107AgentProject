# Step 19 — 单人剧场 (M2)

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-18（补录 2026-07-18 验证） |
| Phase | Phase 7.4 |
| Plan 章节 | [development-plan.md](../development-plan.md) §7.4 |
| 状态 | ✅ done |

## 产出

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/components/world/AgentStatusPanel.tsx` | 新建 | Agent 实时状态面板（头像/MBTI/精力条/情绪VAD/目标/价值观） |
| `frontend/src/pages/SoloTheater.tsx` | 新建 | 单人剧场主页面（两阶段：设置→三栏运行） |
| `frontend/src/App.tsx` | 修改 | `/theater` 路由从 PlaceholderPage → SoloTheater |

## 决策记录

- **两阶段交互设计：** 投放前为表单式设置页（Agent 列表选择 + 场景卡片选择 + 开始按钮），投放后切换为全屏三栏运行视图。重置后回到设置页。比一步到位更清晰，也给后续加"暂停干预"留了入口。

- **Agent 来源合并：** `useAgentStore.agents`（铸造厂创建的）+ `MOCK_AGENTS`（预设 3 个）。用户可以在铸造厂创建 Agent 后直接到剧场投放，也可以用预设 Agent 体验。

- **场景硬编码 3 个：** 与后端 `BUILTIN_SCENARIOS` 一一对应（新生报到/期末周/毕业选择）。前端独立定义，不依赖后端 API（P0 阶段简化）。后续 Step 可改为从 API 获取。

- **Mock SSE 驱动：** 使用 Step 18 的 `useMockSSE`（15 条预置事件，每 2s 推一条）。后端 SSE 接口已就绪（`useSSE`），切换只需把 `useMockSSE` 换成 `useSSE(worldId)` + 创建真 World。

- **精力模拟衰减：** AgentStatusPanel 中精力值每 5 条事件 -2%（下限 10%），视觉上展示"Agent 在消耗精力"。纯前端模拟，后端接入后由后端数据驱动。

- **状态推断逻辑：** Agent 当前状态（thinking/active/idle）从最后一条 SSE 事件类型推断——`thought_stream` → thinking（蓝色脉冲），`agent_action` → active（绿色），无事件 → idle（灰色）。

- **VAD 进度条用 Tailwind 动态类：** `bg-${color}` 在 Tailwind JIT 中不被扫描。实际运行时需要 safelist 或写死类名。**已知问题**——当前写法在默认 Tailwind 配置下 VAD 条可能不显示颜色，需要在 `tailwind.config.js` 的 `safelist` 中添加 `bg-accent-green`/`bg-accent-orange`/`bg-accent-blue`，或改为写死三个 VadBar 变体。

- **保留 `/debug/sse` 路由：** Step 18 说 Step 19 完成后可移除，但单人剧场用的是 useMockSSE 而非 useSSE，debug 页面仍有调试价值。留给 Step 20 确认真 SSE 后移除。

## 组件树

```
SoloTheater (/theater)
├── 设置阶段
│   ├── Agent 选择列表（卡片式，选中高亮）
│   ├── 场景选择（3 列卡片网格）
│   └── 🎬 开始投放按钮
└── 运行阶段
    ├── 顶栏（Agent名 · 场景名 · Tick · 事件数 · 状态灯 · 暂停/继续/重置）
    ├── 左栏(260px): AgentStatusPanel
    │   ├── 头像圆 + 姓名 + MBTI + 状态灯
    │   ├── 精力条（动态颜色：绿>橙>红）
    │   ├── 情绪 VAD（愉悦/唤醒/支配 三进度条）
    │   ├── 目标列表（P1/P2 标注）
    │   └── 价值观标签
    ├── 中栏(flex-1): ThoughtStream
    │   └── ThoughtBubble × N（Step 18 已有组件）
    └── 右栏(200px): 事件统计 + 场景信息 + 人格画像摘要
```

## 测试结果

- [x] `npx tsc --noEmit` — ✅ 零类型错误（Node v24.18.0 + TS 5.5）
- [x] `npx vite build` — ✅ 2387 modules, 23.04s（chunk 571KB，仅大小警告非错误）
- [x] 代码结构审查 — ✅ 遵循项目已有模式（与 AgentFoundry/SSEDebug 同风格）
- [x] 类型安全 — ✅ 所有 Props 接口完整定义，无 `any` 类型
- [x] 组件复用 — ✅ 复用 Card/StatusDot/Badge/ThoughtStream
- [x] 路由替换 — ✅ `/theater` 从 PlaceholderPage → SoloTheater
- [x] 文件行数 — ✅ SoloTheater.tsx 373 行（略超 300 行限制，待拆分 StatRow 等子组件）
- [x] Node.js 环境 — ✅ 通过 winget 安装 Node.js LTS v24.18.0，npm install 180 packages

## 已知问题

- **VAD 进度条 Tailwind 动态类：** `bg-${color}` 中的 `color` 是运行时变量，Tailwind JIT 不会扫描动态拼接的类名。~~需要在 `tailwind.config.js` 的 `safelist` 中显式声明~~ ✅ 已修复：改为 `variant` 参数 + `VAD_BAR_COLORS` 静态映射。
- ~~**Node.js 环境缺失：** 本步无法执行 `tsc --noEmit` 和 `vite build` 验证。~~ ✅ 已解决：通过 winget 安装 Node.js LTS v24.18.0，所有检查通过。
- **Mock SSE 与 Agent 不匹配：** `useMockSSE` 推送的事件包含 3 个 Agent（小明/小红/小刚），但单人剧场只选了一个 Agent。AgentStatusPanel 只展示选中 Agent 的状态，但 ThoughtStream 会显示所有 Agent 的事件。后续接入真后端 SSE 后，单人模式只推一个 Agent 的事件。
- **SoloTheater.tsx 略超 300 行：** 373 行，建议后续拆出 `StatRow` 和 `SetupForm` 子组件。
- **chunk 大小警告：** vite build 产出 571KB，超过 500KB 限制。建议后续配置 `manualChunks` 或懒加载。

## 视觉走查

- [ ] 暗色主题一致 — ⚠️ 待浏览器实际验证
- [ ] 动画流畅 — ⚠️ 待验证
- [ ] 1280px 不炸 — ⚠️ 待验证
- [x] Mock 模式可独立浏览 — ✅ 使用 useMockSSE，无需后端

## 对下一步的提示

- **Step 20（主观察界面 M3）：** GroupSandbox 可以复用 AgentStatusPanel 和 ThoughtStream，扩展为多 Agent 列表 + 事件 Feed。
- ~~**VAD 进度条修复：**~~ ✅ 已修复，M3 可直接复用。
- **真 SSE 集成：** 单人剧场目前用 Mock 数据。后续可以在设置阶段创建 World（`POST /api/worlds`）+ 启动模拟（`POST /api/worlds/{id}/start`），然后用 `useSSE(worldId)` 替换 `useMockSSE`。
- **Node.js 环境已就绪：** Node v24.18.0 + npm 11.16.0 已安装，后续 Step 可直接运行 tsc/vite。
