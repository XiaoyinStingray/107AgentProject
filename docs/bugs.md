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
  
  ## BUG-005：LLM API Key 无效时错误提示不友好
  
  - **状态**：待处理
  - **优先级**：P2（不阻塞代码运行，但影响用户体验）
  - **发现日期**：2026-07-21
  - **环境**：后端 `POST /api/agents`，DeepSeek API
  - **复现步骤**：
    1. 在 `.env` 中配置无效的 LLM API Key。
    2. 启动后端，访问 M1 铸造厂。
    3. 输入描述，点击「创建 Agent」。
  - **实际结果**：前端显示红色错误「failed to fetch」，后端日志显示 `401 Authentication Fails`。用户无法判断是网络问题、后端问题还是 API Key 问题。
  - **期望结果**：前端应显示明确的错误提示，如「LLM API Key 无效，请检查 .env 配置」。后端应返回结构化的错误信息（如 `{error: "invalid_api_key", message: "..."}`），而非通用 400/500。
  - **影响范围**：M1 铸造厂、M2 单人剧场、M3 群体沙盒、M4 竞技场、M5 叙事工厂——所有依赖 LLM 的功能。
  - **关联位置**：
    - `backend/src/api/agents.py` — `create_agent` 错误处理
    - `backend/src/llm/client.py` — LLM 客户端初始化
    - `frontend/src/api/client.ts` — 错误展示逻辑
  - **临时解决方案**：确保 `.env` 中的 `LLM_API_KEY` 有效。

---

## BUG-006：M4/M5/M6 页面仍使用 Mock 数据，新创建 Agent 不出现

- **状态**：待处理
- **优先级**：P1（核心功能链路断裂——铸造厂创建的 Agent 无法在竞技场、叙事工厂、控制台中使用）
- **发现日期**：2026-07-23
- **环境**：前端 Arena / NarrativeFactory / ControlPanel 页面
- **复现步骤**：
  1. 在 M1 铸造厂通过 `POST /api/agents` 创建新 Agent。
  2. 切换到 M4 竞技场（`/arena`）→ Agent 选择列表中没有刚创建的 Agent。
  3. 切换到 M5 叙事工厂（`/narratives`）→ Agent 选择列表中没有刚创建的 Agent。
  4. 切换到 M6 控制台（`/control`）→ 仪表盘/搜索等面板未显示新 Agent。
- **实际结果**：M4/M5/M6 的 Agent 列表仍从 Mock 数据或本地 Zustand Store 获取，未走真实 API（`GET /api/agents`）。铸造厂创建的 Agent 已持久化到 SQLite，但这些页面无法感知。
- **期望结果**：所有页面的 Agent 列表应统一从 `useAgents()` hook（React Query + `GET /api/agents`）获取，创建 Agent 后通过 `invalidateQueries(['agents'])` 自动刷新所有消费方。
- **影响范围**：
  - M4 竞技场：无法选择真实 Agent 进行辩论/面试/路演
  - M5 叙事工厂：无法选择真实 Agent 生成叙事
  - M6 控制台：仪表盘/热力图/搜索/决策模式均显示 Mock 数据
- **关联位置**：
  - `frontend/src/pages/Arena.tsx` — Agent 选择组件
  - `frontend/src/pages/NarrativeFactory.tsx` — Agent 选择组件
  - `frontend/src/pages/ControlPanel.tsx` — Dashboard / Search 面板
  - 根因：这些页面尚未完成 Step 36（API 层收敛），仍使用 Step 29 之前的 Mock/Store 数据源
- **修复方向**：Step 36 中统一将上述页面切换为 `useAgents()` hook，消除 Mock 数据依赖。
