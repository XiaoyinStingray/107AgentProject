# Step 18 — SSE Hook + 思维流组件

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-18 |
| Phase | Phase 7.3 |
| Plan 章节 | [development-plan.md](../development-plan.md) §7.3.4 |
| 状态 | ✅ done |

## 产出

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/types/events.ts` | 修改 | 补 `SSEEvent` 接口 |
| `frontend/src/mocks/sse.ts` | 新建 | 15 条 Mock SSE 事件 + `useMockSSE()` hook |
| `frontend/src/stores/useSSEStore.ts` | 新建 | Zustand：events[]（上限 500）+ connected |
| `frontend/src/hooks/useSSE.ts` | 新建 | 真 EventSource hook，连后端 SSE 端点 |
| `frontend/src/components/agent/ThoughtBubble.tsx` | 新建 | 群聊气泡（Agent + 阶段图标 + 消息体 + 配色） |
| `frontend/src/components/agent/ThoughtStream.tsx` | 新建 | 自滚动容器 + Tick 分隔线 + 手动上滚检测 |
| `frontend/src/pages/debug/SSEDebug.tsx` | 新建 | 隐藏测试页 `/debug/sse`（Mock 驱动） |
| `frontend/src/App.tsx` | 修改 | 追加 `/debug/sse` 路由 |
| `frontend/src/pages/Home.tsx` | 修改 | 快捷入口扩至 8 个 + 可点击跳转 + Badge + Agent 卡片可跳转 |
| `frontend/src/components/shared/Card.tsx` | 修改 | `p-4` → `p-5`（全局卡片纵向空间+4px） |
| `frontend/src/pages/AgentFoundry.tsx` | 修改 | 列表卡片 line-clamp-2 → 3 |
| 全局 12 个 .tsx 文件 | 修改 | 字号统一升级（text-[10px]→text-xs, text-xs→text-sm） |
| `docs/development-plan.md` | 更新 | §7.3.4 重写：群聊气泡规格 + 组件接口 + 隐藏路由 |

## 决策记录

- **视觉风格定为群聊气泡（非终端日志）：** 终端风格太像系统日志。群聊气泡能一眼看出谁在思考/对话/行动，更符合"观察 Agent 社会"的定位。

- **事件类型配色体系：** 思考=蓝底（bg-accent-blue/15），行动=绿底，对话=紫底，世界事件=橙色横幅居中，Tick 边界=灰色分隔线。支持 compact 模式（连续同类型消息不重复显示头像）。

- **气泡透明度迭代：** 初版 /5 在暗色背景上几乎看不见→提至 /15，边框 /30。subtext 从 60%→80% 不透明度。

- **全局字号升级：** 初始设计字号偏小（正文 12px/标签 10px），讨论后统一升档（10→12, 12→14）。Card 内边距同步从 16→20px 补偿纵向空间。列表描述 line-clamp 从 2→3。

- **Dashboard 快捷入口完善：** 原来 4 个（铸造厂/剧场/沙盒/竞技场）→ 8 个全量，4×2 网格，每个带优先级 Badge + 可点击跳转。Agent 卡片同步可点击→`/agents/:id`。

- **隐藏测试路由 `/debug/sse`：** 不在 Sidebar 中出现，手动输入 URL。Step 19 完成后可移除。

- **useMockSSE 在 mocks/sse.ts：** 非 hooks/——测试代码，Step 19 用 useSSE 替代。

## 组件树

```
SSEDebug (/debug/sse)
├── 控制栏（▶ 开始 / ⏹ 停止 / 清空 / 状态灯 / 事件计数）
├── ThoughtStream
│   ├── ThoughtBubble × N（蓝=think / 紫=msg / 绿=action）
│   │   ├── Agent 头部（灯 + 名 + 阶段图标）
│   │   └── 消息体（圆角卡片 + 配色背景 + subtext）
│   ├── Tick 分隔线（═══ Tick #N ═══）
│   ├── 世界事件横幅（🌐 橙色居中）
│   └── ↓ 回到底部 按钮（用户上滚浮出）
└── 状态栏（Mock 模式提示）

Home（Dashboard 更新）
├── 8 模块快捷入口（4×2 网格，可点击 + Badge + 描述）
└── 3 个 Mock Agent 卡片（可点击→agents/:id）
```

## 测试结果

- [x] `npx tsc --noEmit` — ✅ 零类型错误
- [x] `npx vite build` — ✅ 2385 modules, 2.40s
- [x] Mock 推流 → ThoughtBubble 逐条渲染 — ✅
- [x] 自动滚底 + 手动上滚暂停 — ✅
- [x] Tick 分隔线 / 世界事件横幅 — ✅
- [x] 清空 / 停止 / 重开 — ✅
- [x] 群聊气泡配色区分清晰 — ✅
- [x] 全局字号可读性提升 — ✅
- [x] Dashboard 8 入口 + 点击跳转 — ✅
- [x] Agent 卡片点击跳转详情 — ✅

## 视觉走查

- [x] 暗色主题一致 — ✅
- [x] 气泡配色区分（蓝/紫/绿/橙） — ✅
- [x] 滚动流畅 — ✅
- [x] 全局字号（正文 14px / 标签 12px） — ✅

## 对下一步的提示

- Step 19（单人剧场）：用 `useSSE` 接真后端 SSE，`ThoughtStream` 嵌入 SoloTheater 页面
- `useSSE` 接口完整但未经真实场景验证——Step 19 需确认 EventSource + Vite proxy 正常工作
- 移除 `/debug/sse` 和 `pages/debug/` 的时机：Step 19 做完 + 视觉确认后
