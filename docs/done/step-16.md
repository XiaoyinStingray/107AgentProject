# Step 16 — 前端骨架 + Sidebar（56 菜单）

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-18 |
| Phase | Phase 7.1 |
| Plan 章节 | [development-plan.md](../development-plan.md) §7.1 / §7.3.1 |
| 状态 | ✅ done |

## 产出

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/types/agent.ts` | 修改 | 补 `Persona.name: string`（与 Step05 后端对齐） |
| `frontend/src/data/menuData.ts` | 新建 | 56 项菜单共享数据 + `findItemById()` 查找工具 |
| `frontend/src/mocks/agents.ts` | 新建 | `MOCK_AGENT_RESPONSE` + `MOCK_AGENTS`（3 个角色） |
| `frontend/src/components/shared/Card.tsx` | 新建 | 玻璃面板容器，支持 hover 交互 |
| `frontend/src/components/shared/Badge.tsx` | 新建 | P0–P3 优先级色标标签 |
| `frontend/src/components/shared/StatusDot.tsx` | 新建 | 4 态呼吸指示灯（active/thinking/idle/offline） |
| `frontend/src/components/shared/TerminalText.tsx` | 新建 | 等宽打字机风格文字，可选 prompt 前缀 |
| `frontend/src/components/shared/EmptyState.tsx` | 新建 | 🚧 建设中占位组件 |
| `frontend/src/components/layout/TopBar.tsx` | 新建 | 顶栏——Logo 可点击回 Dashboard + 面包屑 + 状态灯 |
| `frontend/src/components/layout/Sidebar.tsx` | 新建 | Dashboard 入口 + 8 模块手风琴 + 56 子项 hash 导航 |
| `frontend/src/components/layout/Layout.tsx` | 重构 | Sidebar + TopBar + Outlet 三栏布局 |
| `frontend/src/pages/Home.tsx` | 新建 | Dashboard 总览（快捷入口 + Mock Agent 列表） |
| `frontend/src/App.tsx` | 重构 | 9 路由 + hash 感知 PlaceholderPage |

## 决策记录

- **菜单数据抽为共享常量 `data/menuData.ts`：** Sidebar 和 App.tsx 的 PlaceholderPage 都消费同一份数据。`findItemById()` 按 URL hash 查找功能项信息，实现 56 子项点击后显示对应名称/emoji/优先级。

- **56 子项用 URL hash 导航（`/agents#item-3`）：** React Router v6 不会对同路径不同 hash 重新挂载组件，因此 PlaceholderPage 内部通过 `useLocation().hash` 主动响应变化。后续实现模块页面时可用同样机制定位到页面内对应 section。

- **Layout 重构为三栏结构：** Sidebar（可折叠 56px/256px）+ TopBar + `<Outlet />`。原底栏废弃，状态灯合并到 TopBar 右侧。

- **TopBar Logo 可点击返回首页：** 用 `<Link to="/">` 包裹 "Life Lab v0.1.0"。Sidebar 顶部新增 Dashboard 入口作为第二路径。

- **路由采用 8 个一级路径 + agents/:id 子路由：** 与 blueprint §6.1 对齐。所有非首页路由暂用 `PlaceholderPage`——Step 17–25 逐个替换。

## 接口变更

```typescript
// Persona 新增字段（前端补齐，对应 Step05 后端变更）
export interface Persona {
  name: string;  // ← 新增
  // ... 其余不变
}
```

无破坏性变更。`name` 在 `AgentResponse` 顶层已有，`Persona.name` 是增量补齐。

## 组件树

```
App
└── Layout
    ├── TopBar（Logo→Home · 面包屑 · READY 灯）
    ├── Sidebar
    │   ├── 折叠/展开按钮
    │   ├── Dashboard 入口（🏠 回首页）
    │   ├── 8 个手风琴 Section（M1–M8）
    │   │   └── 每 Section 7 个 SubItem → navigate(/agents#item-N)
    │   └── 底部统计（P0:6 · P1:14 · P2:19 · P3:17）
    └── <Outlet />
        ├── Home（Dashboard）
        │   ├── 4 个快捷入口 Card
        │   └── 3 个 Mock Agent Card
        └── PlaceholderPage（8 模块 + 404）
            ├── 无 hash → 模块通用占位
            └── 有 hash → 查找 menuData → 显示功能名+emoji+Badge
```

## 测试结果

- [x] `npx tsc --noEmit` — ✅ 零类型错误
- [x] `npx vite build` — ✅ 1564 modules, 1.43s
- [x] Mock 模式可独立浏览 — ✅ Home 页使用 `MOCK_AGENTS`，不依赖后端
- [x] 56 项菜单全部定义 — ✅ 8×7=56 项，含 emoji + 名称 + 优先级标签
- [x] Sidebar 展开/折叠 — ✅ 手风琴模式 + 图标折叠
- [x] Dashboard 返回 — ✅ TopBar Logo + Sidebar Dashboard 入口
- [x] 56 子项导航反馈 — ✅ URL hash 变化 → 页面显示对应功能名/模块/优先级

## 视觉走查

- [x] 暗色主题一致 — ✅ 全页面 bg-primary / text-primary / border 统一
- [x] 动画流畅 — ✅ 手风琴展开/折叠、Sidebar 宽度过渡
- [x] 1280px 不炸 — ✅ Tailwind 响应式，无溢出
- [x] Mock 模式可独立浏览 — ✅ `npm run dev` 不连后端可完整浏览

## 已知问题

- **56 项菜单中 priority 标注有蓝图内不一致：** `agent-lab-blueprint.md` 各模块优先级标签与 §3.1 汇总表不完全一致（如 #30 未来的信：M5 节标 P2，汇总表归 P1）。menuData.ts 以模块节为准。

## 对下一步的提示

- Step 17（铸造厂页面）将 `/agents` 从 `PlaceholderPage` 替换为 `AgentFoundry.tsx`，复用 `Card`/`Badge`/`StatusDot` + `MOCK_AGENT_RESPONSE`
- `useApi.ts` hook 尚未创建——Step 17 需要封装 `fetch` 调 `POST /api/agents`
- `zustand` 和 `@tanstack/react-query` 已安装未使用——Step 17/18 开始接入
- 56 项 hash 导航基础设施已就绪——后续模块页面可用 `useLocation().hash` 定位到页内 section
