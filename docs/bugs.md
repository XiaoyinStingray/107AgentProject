# Bug 记录

> 测试发现的问题集中记录在这里；修复并确认完成后，再更新文档并删除对应记录。

---

## BUG-001：React Router 加载页面时产生 Future Flag 控制台警告

- **状态**：待处理
- **优先级**：P2（不阻塞功能，但污染测试控制台）
- **发现日期**：2026-07-18
- **环境**：前端 Vite，`http://127.0.0.1:5173/`
- **复现步骤**：
  1. 启动前端开发服务器。
  2. 访问 `/`、`/agents` 或 `/debug/sse` 等任意路由。
  3. 查看浏览器控制台 warning。
- **实际结果**：每次路由加载出现两条 React Router Future Flag warning：`v7_startTransition` 与 `v7_relativeSplatPath`。
- **期望结果**：测试控制台无框架升级提示，或项目显式配置对应 future flags 后不再重复提示。
- **影响范围**：不影响当前页面渲染与交互，但会干扰控制台错误筛查。
- **关联位置**：`frontend/src/App.tsx` 的 `BrowserRouter` 路由入口。

---

## BUG-002：Sidebar 手风琴子项 hash 跳转无效

- **状态**：待处理
- **优先级**：P1（影响 56 菜单导航体验）
- **发现日期**：2026-07-19
- **环境**：前端 Sidebar 组件
- **复现步骤**：
  1. 展开任意模块（如 M3 群体沙盒）。
  2. 点击子项（如"关系网络图"）。
  3. URL 变为 `/sandbox#item-21`，页面渲染了 GroupSandbox，但没有任何 UI 变化。
- **实际结果**：hash 只在 Arena 页面被解析（`parseArenaItemId`），其余页面（GroupSandbox / NarrativeFactory / ControlPanel 等）完全忽略 hash。用户点击子项后 URL 变了但页面无反应，感觉"跳转无效"。
- **期望结果**：每个页面至少对侧边栏 hash 做最小响应（如滚动到对应区域或高亮对应功能），或 Sidebar 改为纯路由导航（不带 hash）。
- **关联位置**：
  - `frontend/src/components/layout/Sidebar.tsx` — 子项 `onClick` 第 135 行
  - 各页面缺少 `useLocation().hash` 解析逻辑

---

## BUG-003：M7 导演干预台注入事件与沙盒隔离

- **状态**：待处理
- **优先级**：P1（注入是 M7 核心功能，但完全不影响模拟）
- **发现日期**：2026-07-19
- **环境**：前端 DirectorIntervention + GroupSandbox
- **复现步骤**：
  1. 进入 `/intervention`，选择"世界事件"，填写描述，点击"注入事件"。
  2. 成功提示显示，干预历史新增一条记录。
  3. 切换到 `/sandbox`，启动模拟。
- **实际结果**：注入的事件仅保存在 DirectorIntervention 的本地 `useState` 中，GroupSandbox 的 `useSandboxMockSSE` 完全不知情。注入的历史记录能看，但不会出现在沙盒的 EventFeed / ThoughtStream 中。
- **期望结果**：注入事件应写入共享 Store（Zustand），GroupSandbox 消费该 Store 并将注入事件混入 `visibleEvents` 流。
- **关联位置**：
  - `frontend/src/pages/DirectorIntervention.tsx` — 注入仅写本地 `history` state
  - `frontend/src/pages/GroupSandbox.tsx` — `useSandboxMockSSE` 独立事件源

---

## BUG-004：档案馆成就系统使用静态 Mock 数据，不追踪实际行为

- **状态**：待处理
- **优先级**：P2（演示时可展示静态数据，但无实际追踪价值）
- **发现日期**：2026-07-19
- **环境**：前端 Archive 页面
- **复现步骤**：
  1. 在铸造厂创建 5 个 Agent。
  2. 在沙盒运行 3 次模拟。
  3. 在叙事工厂生成 2 篇叙事。
  4. 进入 `/archive` → 成就系统 Tab。
- **实际结果**：成就进度和统计摘要始终显示 `MOCK_ACHIEVEMENTS` / `MOCK_ACHIEVEMENT_SUMMARY` 中的固定值（Agent 数=3、模拟次数=3、总 Tick=43、叙事数=6），与用户实际操作无关。无论做了什么，成就始终不变。
- **期望结果**：成就进度应从共享 Store 读取实时数据。各关键操作点（创建 Agent / 启动模拟 / 生成叙事 / 完成竞技）应触发 Store 更新，Archive 从中动态计算进度。
- **关联位置**：
  - `frontend/src/pages/Archive.tsx` — AchievementsPanel 消费 `MOCK_ACHIEVEMENTS`
  - `frontend/src/mocks/archive.ts` — 静态 Mock 数据
  - 缺少：共享成就追踪 Store + 各页面埋点

---

## BUG-005：AgentFoundry 创建 Agent 偶发失败（useApi Mock 竞态）

- **状态**：待处理
- **优先级**：P1（影响核心功能——创建 Agent）
- **发现日期**：2026-07-19
- **环境**：前端 AgentFoundry + useApi hook（Mock 模式）
- **复现步骤**：
  1. React 18 StrictMode 开发模式下进入 `/agents`。
  2. 输入描述，点击"创建 Agent"。
  3. 多次重复创建。
- **实际结果**：部分创建请求返回 `null`，Agent 未被添加到列表。`useApi` hook 第 58 行的 `cancelRef.current?.abort()` 会在每次 `execute()` 调用时取消上一次的 AbortController。Mock 模式下 `setTimeout` 无法被真正取消——1500ms 延迟后 `controller.signal.aborted === true` → `return null`。React 18 StrictMode 双重挂载加剧此问题（组件挂载两次，`execute` 被调用两次，第一次的 timeout 在 abort 后返回 null）。
- **期望结果**：Mock 模式不受 AbortController 影响（或 abort 后不检查 signal），每次创建请求都能正常返回 mock 数据。
- **修复方向**：Mock 分支中移除 `controller.signal.aborted` 检查，仅保留 `mountedRef.current` 防卸载后 setState。
- **关联位置**：`frontend/src/hooks/useApi.ts` 第 69 行

---

## BUG-006：ArenaEngine 裁判参与 GroupChat 轮转导致辩论中断

- **状态**：待处理
- **优先级**：P1（裁判在辩论过程中插话，破坏辩论流程）
- **发现日期**：2026-07-19
- **环境**：后端 ArenaEngine
- **复现步骤**：
  1. 创建 ArenaEngine 并调用 `run_debate(agent_a, agent_b, topic, rounds=3)`。
  2. 观察 GroupChat 的对话轮次。
- **实际结果**：`RoundRobinGroupChat` 的 participants 包含 [辩手A, 辩手B, 裁判] 三人。RoundRobin 按顺序轮转：A → B → 裁判 → A → B → 裁判 → ...。裁判在每轮都会有机会发言，而不是仅在辩论结束后做一次总结评分。这导致辩论被裁判的插话打断，transcript 中混入裁判发言。
- **期望结果**：辩手 A 和 B 完成全部 rounds 轮辩论后，裁判再单独发言一次。不应将裁判放入 GroupChat 的轮转 participants 中。Plan §2.6 明确说"最后追加一个'裁判 Agent'来评分"。
- **修复方向**：
  1. GroupChat participants 仅包含辩手 A 和 B（`max_turns = rounds * 2`）。
  2. 辩论结束后，单独调用裁判 Agent 或 `model_client.create()` 生成评分（当前 `_judge_score` 已经走 `model_client.create`，只需把裁判从 GroupChat 中移除即可）。
- **关联位置**：`backend/src/engines/arena/engine.py` 第 109–112 行（GroupChat participants 包含 judge）
