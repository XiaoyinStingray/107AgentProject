# Step 17 — 铸造厂页面 (M1)

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-18 |
| Phase | Phase 7.2 |
| Plan 章节 | [development-plan.md](../development-plan.md) §7.3.2 (§7.3.2a 补充) |
| 状态 | ✅ done |

## 产出

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/hooks/useApi.ts` | 新建 | 通用 fetch hook（GET/POST/PUT/DELETE），Mock 拦截 + AbortController |
| `frontend/src/stores/useAgentStore.ts` | 新建 | Zustand 全局 Agent 列表，跨路由不丢失 |
| `frontend/src/components/agent/AgentCard.tsx` | 新建 | Agent 摘要卡片（姓名/MBTI/精力条/情绪/目标） |
| `frontend/src/components/agent/PersonaRadar.tsx` | 新建 | 大五人格雷达图（Recharts RadarChart + 决策风格表） |
| `frontend/src/pages/AgentFoundry.tsx` | 新建 | 铸造厂主页面（输入→创建→详情→列表） |
| `frontend/src/App.tsx` | 修改 | `/agents` 从 PlaceholderPage → AgentFoundry |
| `docs/development-plan.md` | 补充 | §7.3.2a 追加 useApi/AgentCard/PersonaRadar 接口定义 |

## 决策记录

- **useApi 设计为通用 hook（泛型 + 手动触发 + Mock 拦截）：** `useApi<TResponse, TBody>(method, url, options?)`。传入 `mockData` → 模拟 delay 后返回；不传 → 走 fetch。AbortController 防竞态。所有后续 Step 共用。

- **Agent 列表用 Zustand 全局存储：** 不在页面 `useState` 中管理——`useAgentStore` 跨路由持久化（同一次会话内）。Step 25 档案馆直接复用同一个 store。

- **Mock 模式 ID 去重：** `MOCK_AGENT_RESPONSE` 的 id 固定为 `"mock-1"`，多次创建导致 id 碰撞。实际实现追加 `-${Date.now()}` 保证唯一性。切真 API 后不需要此逻辑（后端 UUID 天然唯一）。

- **详情/列表双视图：** 上方"创建结果"展示选中 Agent 的完整人格（AgentCard + PersonaRadar + 画像 + 背景 + 价值观），下方"已创建的 Agent"展示所有 Agent 的网格卡片。点击卡片切换详情，选中卡片绿色 ring 高亮，最新创建标记"最新"标签。

- **输入交互：** Enter 提交 + 200 字限制 + Shift+Enter 换行。空输入按钮 disabled。

## 组件树

```
AgentFoundry
├── 页面标题 + 已创建计数 Badge
├── 输入区 Card（textarea + ✨ 创建按钮）
├── Loading / Error
├── 详情展示（displayedAgent）
│   ├── [左] AgentCard
│   ├── [右] PersonaRadar Card
│   ├── [左] 人格画像
│   ├── [右] 背景故事
│   └── 核心价值观
└── 已创建列表网格
    └── 每张卡片可点击 → setSelectedId → 切换详情
```

## 测试结果

- [x] `npx tsc --noEmit` — ✅ 零类型错误
- [x] `npx vite build` — ✅ 2380 modules, 2.36s
- [x] 输入创建 → 1.5s loading → 结果展示 — ✅
- [x] 连续创建多个 Agent，列表不丢失 — ✅ (zustand store)
- [x] 路由切换后回到铸造厂，列表仍存在 — ✅
- [x] 点击列表卡片切换详情 — ✅ (selectedId + 绿色 ring)
- [x] "最新"标签仅在最后创建的卡片显示 — ✅
- [x] Mock ID 去重（每次创建唯一 ID） — ✅
- [x] Enter 提交 + 空输入防提交 — ✅

## 视觉走查

- [x] 暗色主题一致 — ✅
- [x] Recharts 雷达图渲染正常 — ✅
- [x] 动画流畅 — ✅
- [x] 响应式（mobile 单列 / desktop 双列） — ✅

## 已知问题

- Recharts 导致 vendor chunk 较大（553 KB）。后续 Step 可 code-split。
- Mock 模式下所有创建结果 Persona 相同——真 API 每次生成不同角色。
- `stores/useAgentStore` 的 `removAgent` 已定义但未使用——Step 25 档案馆给 UI 入口。

## 对下一步的提示

- Step 18（SSE Hook + 思维流组件）：`useSSE.ts` + `ThoughtBubble.tsx` + `useSSEStore.ts`，为 Step 19 单人剧场准备实时推流。
- useApi hook 就绪——Step 19 可用 GET/POST 调用真 API（去掉 mockData 即可）。
- useAgentStore 就绪——Step 25 档案馆直接复用。
