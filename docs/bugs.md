# Bug 记录

> 测试发现的问题集中记录在这里；修复并确认完成后，再更新文档并删除对应记录。

---

## 2026-07-24: BUG-010 ~ BUG-014 修复

### BUG-010 单人剧场暂停后恢复事件不加载 ✅
- **根因**: `replayMissedEvents` 只在 SSE `onopen` 调用，且数据库里事件未落库（`handleBack` disconnect 过早）
- **修复**: replay 移入 useEffect（不依赖 SSE）；`handleBack` 等 2 秒再断连

### BUG-011 暂停后自动恢复 / 关系变化弹出 ✅
- **根因**: (1) `tick_boundary` 在 `paused` 事件前到达，覆盖用户手动暂停的 `isPaused`；(2) 暂停后 tick 继续推事件到前端
- **修复**: `isPaused` 只由按钮 + 首次 connected 事件控制；SSE generator 暂停后跳过 yield（tick 后台静默完成）

### BUG-012 群体沙盒返回后历史为空 ✅
- **根因**: `handleBack` 未设 `worldId=null` 导致 useSSE 不重连；`replayMissedEvents` 只在事件非空时取近 5 tick
- **修复**: handleBack 设 worldId=null；replay 事件为空时从 tick 0 拉全部

### BUG-013 Goal 检测不工作 ✅
- **根因**: `_llm_check_goals` 未启用 JSON 输出，异常静默吞掉
- **修复**: `json_output=True`；阈值从 0.3 提到 0.5

### BUG-014 world_type 隔离不完整 ✅
- **根因**: 迁移前旧 World 默认 world_type='group'
- **修复**: DB 迁移修正单 Agent World → solo；SoloTheater 加 world_type 过滤

---

## BUG-001：React Router 加载页面时产生 Future Flag 控制台警告

- **状态**：✅ 已修复并自动化验证（2026-07-27，State 3 T2）
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
- **2026-07-27 复测**：
  - 浏览器刷新后仍稳定出现 `v7_startTransition` 与 `v7_relativeSplatPath` 两条 warning。
  - 相关 Vitest 回归测试全部通过，但测试 stderr 同样输出上述 warning，确认记录仍有效。
- **2026-07-27 修复**：
  - `BrowserRouter` 显式启用 `v7_startTransition` 与 `v7_relativeSplatPath`。
  - 所有前端测试使用的 `MemoryRouter` 同步启用 future flags，避免测试夹具继续污染 stderr。
  - 新增 App 路由配置回归测试；全量前端 `239 passed`，不再输出这两条 warning。
  - 浏览器访问 M5/M7/M8 后控制台 warning/error 为 0。

---

## BUG-003：M7 导演干预台注入事件与沙盒隔离

- **状态**：✅ 已修复并完成自动化链路验证（2026-07-27，State 3 T2）
- **优先级**：P1（注入是 M7 核心功能，但完全不影响模拟）
- **发现日期**：2026-07-19
- **环境**：前端 DirectorIntervention + GroupSandbox
- **复现步骤**：
  1. 进入 `/intervention`，选择"世界事件"，填写描述，点击"注入事件"。
  2. 成功提示显示，干预历史新增一条记录。
  3. 切换到 `/sandbox`，启动模拟。
- **原始实际结果**：注入的事件仅保存在 DirectorIntervention 的本地 `useState` 中，GroupSandbox 的 `useSandboxMockSSE` 完全不知情。注入的历史记录能看，但不会出现在沙盒的 EventFeed / ThoughtStream 中。
- **期望结果**：注入事件应写入共享 Store（Zustand），GroupSandbox 消费该 Store 并将注入事件混入 `visibleEvents` 流。
- **原关联位置**：
  - `frontend/src/pages/DirectorIntervention.tsx` — 注入仅写本地 `history` state
  - `frontend/src/pages/GroupSandbox.tsx` — `useSandboxMockSSE` 独立事件源
- **2026-07-27 复测**：
  - 当前干预台已改为真实 `POST /api/worlds/{id}/inject`，历史从后端 `interventions` 表加载。
  - World 引擎已通过 `_pending_injects` 将干预加入 SSE 流，群体沙盒使用真实 `useSSE`。
  - 后端注入相关测试 `2 passed`；前端干预组件测试 `37 passed`。
  - 当前数据库中的 World 为暂停状态，且本次后端进程未持有其运行时引擎，因此未执行一次会调用真实 LLM 的完整注入链路；完成该 E2E 后再标记为 verified。
- **2026-07-27 修复与验证**：
  - 注入类型、目标 Agent 和描述现会完整写入运行时 `SimEvent`，不再统一退化为 `world_event`。
  - 注入事件与干预历史在同一 API 请求内持久化；页面重连后可通过 REST 事件重放恢复。
  - 新增 API → 运行时 pending 队列 → SQLite events/interventions 的 Mock LLM 集成测试，以及 SSE 首事件顺序测试。
  - 后端注入相关定向测试 `32 passed`；前端干预台、沙盒和 World 组件测试 `44 passed`。

---

## BUG-004：档案馆成就系统使用静态 Mock 数据，不追踪实际行为 ✅

- **状态**：✅ 已修复 (2026-07-25, Step 45)
- **修复**：新建 `backend/src/api/achievements.py` — `GET /api/achievements` 从 SQLite 统计 agents/worlds/simulations/arenas 计数；前端 `useAchievements()` 连真实 API
  
  ---
  
## BUG-005：LLM API Key 无效时错误提示不友好

- **状态**：✅ 已修复并自动化验证（2026-07-27，State 3 T2）
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
- **2026-07-27 复测**：为避免覆盖有效 Key 和产生真实 API 调用，本次未改 `.env`；代码审查确认后端创建接口仍只捕获 `ValueError`，未映射上游 401，前端统一客户端也只透传通用 `detail`，因此根因仍在。
- **2026-07-27 修复**：
  - 后端新增统一 LLM 错误边界，将认证失败、限流、超时和连接失败转换为安全的结构化响应。
  - 无效 Key 返回 `401` 与 `{error: "invalid_api_key", message: "LLM API Key 无效，请检查 .env 配置并重启后端"}`。
  - 前端统一客户端兼容结构化错误与既有 FastAPI `detail`，并将后端断连明确显示为“无法连接后端服务”。
  - 使用模拟 DeepSeek `AuthenticationError` 验证 `/api/agents` 完整链路，未修改 `.env`、未调用真实 LLM。

---

## BUG-006：M4/M5/M6 页面仍使用 Mock 数据，新创建 Agent 不出现 ✅

- **状态**：✅ 已修复并复测（2026-07-27）
- **优先级**：P1（核心功能链路断裂——铸造厂创建的 Agent 无法在竞技场、叙事工厂、控制台中使用）
- **发现日期**：2026-07-23
- **环境**：前端 Arena / NarrativeFactory / ControlPanel 页面
- **复现步骤**：
  1. 在 M1 铸造厂通过 `POST /api/agents` 创建新 Agent。
  2. 切换到 M4 竞技场（`/arena`）→ Agent 选择列表中没有刚创建的 Agent。
  3. 切换到 M5 叙事工厂（`/narratives`）→ Agent 选择列表中没有刚创建的 Agent。
  4. 切换到 M6 控制台（`/control`）→ 仪表盘/搜索等面板未显示新 Agent。
- **原始实际结果**：M4/M5/M6 的 Agent 列表仍从 Mock 数据或本地 Zustand Store 获取，未走真实 API（`GET /api/agents`）。铸造厂创建的 Agent 已持久化到 SQLite，但这些页面无法感知。
- **期望结果**：所有页面的 Agent 列表应统一从 `useAgents()` hook（React Query + `GET /api/agents`）获取，创建 Agent 后通过 `invalidateQueries(['agents'])` 自动刷新所有消费方。
- **影响范围**：
  - M4 竞技场：无法选择真实 Agent 进行辩论/面试/路演
  - M5 叙事工厂：无法选择真实 Agent 生成叙事
  - M6 控制台：仪表盘/热力图/搜索/决策模式均显示 Mock 数据
- **原关联位置**：
  - `frontend/src/pages/Arena.tsx` — Agent 选择组件
  - `frontend/src/pages/NarrativeFactory.tsx` — Agent 选择组件
  - `frontend/src/pages/ControlPanel.tsx` — Dashboard / Search 面板
  - 根因：这些页面尚未完成 Step 36（API 层收敛），仍使用 Step 29 之前的 Mock/Store 数据源
- **修复方向**：Step 36 中统一将上述页面切换为 `useAgents()` hook，消除 Mock 数据依赖。
- **2026-07-27 复测**：M4 竞技场、M5 叙事工厂、M6 控制台均通过 `useAgents()` 展示与 `GET /api/agents` 一致的 6 个真实 Agent，未再发现 Mock/Store 数据隔离。

---

## BUG-007：M8 精彩回放使用静态 Mock 数据，且点击跳转到沙盒创建页而非回放 ✅

- **状态**：✅ 已修复 (2026-07-25, Step 45)
- **修复**：`useSimulations()` 连真实 API + SQLite 持久化 simulations 表；点击展开卡片在线展示事件（不跳转沙盒）；运行中的模拟每 10s 自动轮询增量事件 + 🔄 手动刷新按钮

---

## BUG-008：M8 实验模板使用 Mock 数据，点击行为与回放相同 ✅

- **状态**：✅ 已修复 (2026-07-25, Step 45)
- **修复**：`useScenarios()` 连真实场景 API；双按钮显式选择 🎭 单人（→ `/theater`）和 👥 多人（→ `/sandbox`）；SoloTheater 支持从导航 state 预选场景；多人沙盒预选 Agent 数量

---

## BUG-009：M8 研究报告导出使用裸 fetch，未复用 useExportReport hook ✅

- **状态**：✅ 已修复 (2026-07-25, Step 45)
- **修复**：`useExportReport()` 重写为匹配真实 GET API（返回 blob），ExportPanel 改用 `exportReport.mutateAsync()`

---

## BUG-010：单人剧场暂停后恢复，事件不加载

- **状态**：✅ 已修复 (2026-07-24)
- **优先级**：P0（核心交互断裂）
- **发现日期**：2026-07-24
- **根因**：`handleBack` 设 `worldId=null` → useSSE 清空事件 + `lastTickRef=0`；但 `replayMissedEvents` 只在事件非空时拉取近 5 tick——恢复时事件为空导致漏拉全部历史
- **修复内容**（见 BUG-012 修复）：
  1. `useSSE.replayMissedEvents` 新增判断：`events` 为空时从 tick 0 拉取全部历史事件
  2. `SoloTheater.handleStart` 新增 `clear()`——防止上次残留事件混入新会话
- **关联位置**：
  - `frontend/src/hooks/useSSE.ts` — replayMissedEvents（当 `storeEvents.length === 0` → from=0）
  - `frontend/src/pages/SoloTheater.tsx` — handleStart 加 clear()

---

## BUG-011：群体沙盒暂停后偶尔自动恢复

- **状态**：✅ 已修复 (2026-07-24)
- **优先级**：P1
- **发现日期**：2026-07-24
- **根因**：`handleBack` 中 `await pauseWorld` 是异步的——在等 API 返回期间 `activeWorldId` 仍存在。等 `setWorldId(null)` + `setPhase("setup")` 执行后，auto-restore useEffect 检测到 `activeWorldId && phase==="setup" && !worldId` 三条全满足，立即把页面拉回运行态，形成「返回→自动恢复→再返回」死循环，导致 SSE 连接风暴（3 秒 11 次重连）和"暂停后自动继续"的错觉
- **修复内容**：
  1. `GroupSandbox.handleBack` 第一步先 `setActiveWorld(null)`——在 async 调用前清除，阻断 auto-restore 条件
  2. `SandboxHeader` 状态标签从英文 `"PAUSED"` 改为中文 `⏸ 已暂停`，头栏加颜色区分
- **关联位置**：
  - `frontend/src/pages/GroupSandbox.tsx` — handleBack (先 clear activeWorldId) + auto-restore useEffect
  - `frontend/src/components/world/SandboxHeader.tsx` — 状态标签中文化

---

## BUG-012：群体沙盒返回后再进入，历史消息为空

- **状态**：✅ 已修复 (2026-07-24)
- **优先级**：P0
- **发现日期**：2026-07-24
- **根因**：`handleBack` 未设 `worldId = null`，导致 `useSSE` effect 不重连；`replayMissedEvents` 只在事件非空时拉取近 5 tick
- **修复内容**：
  1. `GroupSandbox.handleBack` 新增 `setWorldId(null)`——使 useSSE effect 在恢复时正确重连
  2. `useSSE.replayMissedEvents` 新增判断：事件列表为空时从 tick 0 拉取全部历史
  3. `handleResumeWorld` 开启 `restoring` 模式——历史事件直接展示，不走节流器
- **关联位置**：
  - `frontend/src/pages/GroupSandbox.tsx` — handleBack, handleResumeWorld
  - `frontend/src/hooks/useSSE.ts` — replayMissedEvents

---

## BUG-013：Goal 检测不工作（LLM 判定）

- **状态**：✅ 已修复 (2026-07-24)
- **优先级**：P1
- **发现日期**：2026-07-24
- **根因**：`_llm_check_goals` 未启用 `json_output=True`，LLM 返回的 JSON 不可靠；所有异常静默吞掉，无法排查
- **修复内容**：
  1. 改用 `UserMessage(content=prompt, source="goal_checker")` 保持与项目其他 LLM 调用一致
  2. 添加 `json_output=True` 参数强制 JSON 输出
  3. 改进 JSON 解析：校验返回类型为 list、逐项安全提取、索引边界检查
  4. 异常时通过 `logger.warning` 记录具体错误，便于调试
- **关联位置**：
  - `backend/src/engines/world/engine.py` — `_llm_check_goals`

---

## BUG-014：world_type 隔离不完整

- **状态**：✅ 已修复 (2026-07-24)
- **优先级**：P2
- **发现日期**：2026-07-24
- **根因**：`world_type` 列通过 `ALTER TABLE ... DEFAULT 'group'` 添加，迁移前创建的 solo World 被错误标记为 group
- **修复内容**：
  1. `db.py` 增量迁移：扫描 `world_type='group'` 的 World，若 `agent_ids` 只有 1 人则修正为 `'solo'`
  2. `SoloTheater.tsx` 新增 `world_type !== "group"` 过滤，与 GroupSandbox 的 `!== "solo"` 过滤对称
- **关联位置**：
  - `backend/src/db.py` — BUG-014 增量迁移逻辑
  - `frontend/src/pages/SoloTheater.tsx` — worlds 过滤

---

## BUG-015：M8 研究报告导出 MD 报错、JSON 为空 ✅

- **状态**：✅ 已修复 (2026-07-25, Step 45)
- **修复**：`_collect_events()` 改为 async，优先读内存引擎 → SQLite events 表 fallback；两个调用处已加 `await`

---

## BUG-017：Agent 日记入口在 M1 但实现在 M5 ✅

- **状态**：✅ 已修复并复测（2026-07-27）
- **优先级**：P2（功能可用但入口放错模块）
- **发现日期**：2026-07-24
- **环境**：M1 铸造厂 / M5 叙事工厂
- **原始实际结果**：M1 Agent 详情中有「生成日记」按钮，点击后跳转到 M5 叙事工厂——功能本身在 M5 实现，但入口放在了 M1。用户困惑日记是 M1 的功能还是 M5 的
- **修复方向**：要么把入口移到 M5（叙事工厂 Agent 选择后直接生成），要么在 M1 保持入口但跳转时自动选中该 Agent 并切换到日记风格
- **2026-07-27 复测**：M1 当前已无「生成日记」入口；M5 叙事工厂提供独立「Agent 日记」风格，模块归属明确。

---

## BUG-016：M5 叙事工厂侧边栏选取无效 ✅

- **状态**：✅ 已修复并复测（2026-07-27）
- **优先级**：P1（侧边栏 Agent 列表点击后主界面功能框不切换）
- **发现日期**：2026-07-24
- **环境**：前端 NarrativeFactory 页面
- **复现步骤**：
  1. 打开 `/narratives`
  2. 左侧 Agent 列表中点击某个 Agent
  3. 观察右侧主界面的叙事风格选择 / 生成按钮
- **原始实际结果**：右侧功能框不跟随侧边栏选择变化——始终停留在初始状态
- **期望结果**：选中 Agent 后，主界面叙事风格选择区和生成按钮应关联到该 Agent
- **关联位置**：
  - `frontend/src/pages/NarrativeFactory.tsx` — Agent 选择 → 叙事生成的状态绑定
- **2026-07-27 复测**：点击 Agent 后「当前选择」立即显示对应姓名；继续选择 World 后「生成叙事」按钮正常启用。

---

## 2026-07-25: Step 45 新增 / 修复

### BUG-018：群体沙盒暂停延迟（前后端不对齐）

- **状态**：✅ 已修复 (2026-07-25)
- **优先级**：P1（前端显示暂停但后端仍在跑 LLM，最长 40s+ 才生效）
- **发现日期**：2026-07-25
- **环境**：GroupSandbox
- **复现步骤**：
  1. 群体沙盒投放 2+ Agent，开始模拟
  2. LLM 正在生成时点「暂停」
  3. 观察后端日志
- **实际结果**：前端立即显示"已暂停"，但后端继续生成消息——暂停 POST 返回 200 后，LLM 仍在跑（日志出现 think_aloud / send_message），直到当前 tick 所有 Agent 发言完毕才真正停止
- **根因**：`_stream_group_tick` 的 AutoGen `GroupChat.run_stream()` 无外部可取消的 CancellationToken——消息间的 `world.status` 检查无法中断正在生成的 LLM 调用
- **修复**：
  1. `_stream_group_tick` 中创建 `CancellationToken` 并存在 `engine._group_cancel_token`
  2. 暂停端点 (`pause_world`) 中主动 `token.cancel()` → GroupChat 收到 CancelledError → 中断当前 LLM 调用
  3. streaming.py 增加 `CancelledError` 捕获 + `aclose()` 清理
  4. 单人模式在 Step 45 早期已通过 polling 修复
- **关联位置**：
  - `backend/src/engines/world/streaming.py` — `_stream_group_tick`
  - `backend/src/api/worlds.py` — `pause_world`

### BUG-019：侧边栏导航跳转问题（预存）

- **状态**：📝 wontfix（2026-07-27，产品确认保留）
- **优先级**：P2
- **发现日期**：2026-07-25
- **环境**：前端侧边栏
- **描述**：复测 10 个顶层入口均能进入正确模块；其中从其他模块点击 M5 时，URL 会自动变为 `/narratives#item-29`，而不是停留在 `/narratives`。根因是 NarrativeFactory 将默认「小说化叙事」主动同步为 `#item-29`。功能可用，需要团队确认这是预期的默认功能定位，还是应保持模块根路由。
- **wontfix 原因**：`#item-29` 表示 M5 当前默认的「小说化叙事」子功能，可用于侧边栏定位和深链接；页面和顶层导航均正常。移除 hash 会削弱当前功能定位且没有功能收益，因此保留现状。
- **2026-07-27 验证**：浏览器直接进入 `/narratives`，页面加载完成后稳定同步为 `/narratives#item-29`，默认风格为「小说化叙事」。
- **不在 Step 45 范围内**

### BUG-022：档案馆成就系统 4 个统计数字不显示

- **状态**：✅ 已修复并自动化验证（2026-07-27，State 3 T2）
- **优先级**：P2
- **发现日期**：2026-07-26
- **环境**：M8 档案馆 → 成就 tab
- **实际结果**：成就页面的 Agent 总数/World 总数/模拟次数/竞技场次数字显示为空或 0
- **关联位置**：`frontend/src/pages/Archive.tsx` AchievementsPanel、`backend/src/api/achievements.py`
- **2026-07-27 复测**：成就页四个标签均正常出现，但数字为空。后端响应使用 `total_agents` / `total_simulations` / `total_ticks` / `total_narratives`，前端读取 `totalAgents` / `totalSimulations` / `totalTicks` / `totalNarratives`，字段命名未转换。
- **2026-07-27 修复**：
  - 在 `frontend/src/api/achievements.ts` 的 API 边界统一将后端 snake_case 转为现有 camelCase 共享类型，并同步转换 `unlocked_at`。
  - 未修改后端响应和 `frontend/src/types/archive.ts` 共享类型。
  - 新增字段映射测试，并加强成就面板测试以断言四个实际数字；相关测试 `33 passed`。
  - 浏览器使用本地真实数据库验证四项统计均显示数值（`6 / 1 / 0 / 2`），不再为空。

### BUG-021：群体动力学报告生成后无下载按钮 ✅

- **状态**：✅ 已修复 (2026-07-26)
- **优先级**：P2
- **发现日期**：2026-07-26
- **修复**：`GroupDynamics.tsx` 报告展示区加「⬇ 下载 .md」按钮——Blob → Markdown 文件下载
- **关联位置**：`frontend/src/components/control/GroupDynamics.tsx`

### BUG-020：REST 事件字段与 SSE 事件字段不一致（已修复）

- **状态**：✅ 已修复 (2026-07-25)
- **优先级**：P0（导致暂停恢复后历史对话不显示 / 显示 ID）
- **根因**：`useSSE.replayMissedEvents` 从 REST API 取事件时，`SimEvent` 字段名 (`source_agent_id`, `description`) 与前端消费的 `SSEEvent` 字段名 (`agent_id`, `content`, `message`, `subtext`, `action`, `target`) 不一致，缺少完整的字段平铺
- **修复**：
  1. 后端 `get_world_events` 注入 `agent_name` 到 `data` 中
  2. `useSSE.ts` 映射完全对齐 `sse.py:_event_to_dict`（含 `message`/`subtext`/`tone`/`action`/`target`）
  3. `Archive.tsx` 回放事件映射同上
- **关联位置**：
  - `frontend/src/hooks/useSSE.ts` — `replayMissedEvents`
  - `frontend/src/pages/Archive.tsx` — `handleToggleReplay`
  - `backend/src/api/worlds.py` — `get_world_events`

---

## BUG-023：M11 首次进入 Agent 不加载，需切换场景后才出现

- **状态**：✅ 已修复 (2026-07-28, Step 65)
- **优先级**：P2
- **发现日期**：2026-07-28
- **修复**：GameCanvas mount 时通过 `game.registry.set("pendingMapId"/"pendingAgents")` 桥接初始数据；MapScene.create() 从 registry 读取，彻底绕过 `getScene()` 时序依赖。

---

## BUG-025：多人剧场加载 Team 的 World，world_type 隔离缺失

- **状态**：✅ 已修复 (2026-07-29)
- **优先级**：P1（模块隔离失效——Team 的 World 出现在 GroupSandbox 中）
- **发现日期**：2026-07-29
- **环境**：GroupSandbox（多人剧场）M3 + TeamDashboard M9
- **复现步骤**：
  1. 在 M9 Agent Team 中创建一个 Team 并执行任务
  2. 切换到 M3 群体沙盒
  3. 查看「已有实验」列表
- **实际结果**：Team 创建的 World 出现在群体沙盒的 World 列表中（因为 Team 使用 `world_type="group"`）
- **根因**：
  1. `backend/src/engines/team/engine.py:249` — Team 创建 World 时使用 `world_type="group"`，而非独立的 `"team"`
  2. `frontend/src/pages/GroupSandbox.tsx:50` — `worlds` 过滤条件为 `w.world_type !== "solo"`，导致 Team World 漏入群体沙盒
  3. `backend/src/models/world.py:24,34` — `world_type` 字段文档仅标注 `solo | group`，缺少 `team`
- **修复内容**：
  1. `world.py` — `world_type` 字段文档更新为 `solo | group | team`
  2. `team/engine.py` — 创建 World 时 `world_type="team"`
  3. `world_orm.py` — 默认值注释更新
  4. `GroupSandbox.tsx` — 过滤条件改为 `w.world_type === "group"`（显式匹配，不留缺口）
  5. `SoloTheater.tsx` — 确认已过滤 `world_type !== "group"`，Team World 不会漏入
- **关联位置**：
  - `backend/src/engines/team/engine.py` — line 249（world_type 赋值）
  - `frontend/src/pages/GroupSandbox.tsx` — line 50（worlds 过滤）
  - `backend/src/models/world.py` — line 24, 34（类型文档）
  - `backend/src/models/world_orm.py` — line 25（DB 列默认值）
- **影响范围**：
  - Team Dashboard 创建 World 后不影响 Team 本身的功能
  - 仅影响多人剧场（M3）的 World 列表展示——用户看到不该出现的 Team World
- **优先级**：P3
- **发现日期**：2026-07-28
- **环境**：M11 侧边栏 → 子项（时间轴与快照/导演模式/叙事导出）
- **复现步骤**：
  1. 展开 M11 侧边栏
  2. 点击 ⏪ 时间轴与快照 / 🎬 导演模式 / 📖 叙事导出
- **实际结果**：跳转到 `/scene#item-57` 等 hash 路由，但 `/scene` 页面不处理 hash，停留在场景选择页无变化
- **根因**：menuData 子项的导航逻辑为 `navigate('/scene#item-{id}')`，hash 片段不被 React Router 或 M11 页面消费
- **计划修复时机**：对应功能（Step 65 时间轴、Step 66 导演、Step 71 叙事导出）实现后改为跳转具体子页面/锚点

---

## 2026-07-29：State 3 T4 — Phase 15 Bug 修补

### BUG-025：Bench 全 tick 失败仍被记为成功

- **状态**：✅ 已修复并定向验证（2026-07-29，State 3 T4）
- **优先级**：P1
- **根因**：单 tick 异常被转换为普通 `error` 事件，调度器随后仍计算非零指标并把 BenchResult 标为 `done`。
- **修复**：8 个 tick 全部失败时抛出任务失败，保存六维全零、错误摘要和 `failed` 状态；零分纳入聚合。27 条全部失败时 BenchRun 同样标为 `failed`。
- **回归测试**：`test_all_tick_failures_are_persisted_as_zero_score_failures`。

### BUG-026：Bench 鲁棒性聚合几乎恒为 100

- **状态**：✅ 已修复并定向验证（2026-07-29，State 3 T4）
- **优先级**：P1
- **根因**：每条任务的鲁棒性固定为 80，聚合时只计算这组固定值的变异系数，方差恒为零。
- **修复**：改为比较每条任务其余五维综合分的跨任务变异系数；全零任务返回 0，单样本保留 85。
- **回归测试**：覆盖稳定样本、高波动样本、占位值隔离和全零边界。

### BUG-027：运行中 Bench 可删除但后台任务不会取消

- **状态**：✅ 已修复并定向验证（2026-07-29，State 3 T4）
- **优先级**：P1
- **根因**：删除端点未检查运行状态，数据库记录删除后后台任务仍会调用 LLM 并写入子结果。
- **修复**：运行中删除返回 HTTP 409；前端删除按钮在运行态禁用。已完成或失败的评测仍可删除。
- **回归测试**：Bench API `14 passed`；BenchLab 运行态按钮测试通过。

### BUG-028：失效 Team 模板下载失败仍增加计数

- **状态**：✅ 已修复并定向验证（2026-07-29，State 3 T4）
- **优先级**：P2
- **根因**：下载次数在确认原始 Team 存在之前提交。
- **修复**：先验证 MarketItem 和 Team，再增加并提交下载次数；404 失败下载保持原计数。
- **回归测试**：Market API `14 passed`，包含删除原 Team 后下载的回归场景。

### BUG-029：Bench 页面空闲时永久轮询

- **状态**：✅ 已修复并定向验证（2026-07-29，State 3 T4）
- **优先级**：P2
- **根因**：`useBenchRuns()` 无条件设置 3 秒轮询。
- **修复**：仅当列表中至少一个 Run 为 `running` 时轮询；空列表或全部结束后停止。
- **回归测试**：fake timer 覆盖空闲不轮询与运行中按 3 秒轮询。

### BUG-030：期末周 Bench 上下文未插值剩余座位

- **状态**：✅ 已修复并定向验证（2026-07-29，State 3 T4）
- **优先级**：P2
- **根因**：资源状态字符串缺少 f-string，LLM 收到的是字面量 `{max(0, 80 - tick * 10)}`。
- **修复**：提取 `_build_tick_context()`，按 tick 计算实际剩余座位；其他场景保持天气上下文。
- **回归测试**：期末周插值与普通场景上下文 `2 passed`。

### BUG-031：后端重启后 Bench 任务永久停留在运行中

- **状态**：✅ 已修复并验收（2026-07-29，State 3 T4）
- **优先级**：P1（任务无法继续或删除，且数据库残留运行时 API Key）
- **根因**：Bench 使用进程内 `BackgroundTasks` 执行，进程退出后协程丢失；数据库只保存了进度和 `running` 状态，没有启动恢复策略。
- **修复**：应用启动并完成数据库初始化后，将遗留的 `running` 评测标为 `failed`，清空 API Key，并在报告中说明中断原因和已保留进度；已有子结果不删除，失败记录可正常删除。
- **回归测试**：覆盖 `running → failed`、Key 清除、`6/27` 进度和子结果保留、非运行记录不变，以及应用生命周期调用恢复函数。
- **当前限制**：T4 不实现暂停、继续或断点续跑；完整的持久化任务控制延期至 Step 69。

---

## 2026-07-31：State 3 T5 — Phase 16 性能与 E2E

### BUG-032：静音模式的拟声 Promise 提前完成

- **状态**：✅ 已修复（2026-07-31，T6）
- **优先级**：P1
- **现象**：关闭声音时，`AgentVoiceEngine.speak()` 在静音播放计时结束前就完成，调用方会误以为当前消息已经播放完毕。
- **根因**：静音分支调用 `playSilent(...)` 时缺少 `await`。
- **影响**：破坏对话气泡与拟声的严格串行语义，可能提前消费下一条消息。
- **修复**：静音分支等待 `playSilent(...)` 完成后再结束当前拟声任务。
- **回归测试**：`frontend/src/game/audio/AgentVoiceEngine.test.ts`。

### BUG-033：暂停后恢复可能并行播放两条对话

- **状态**：✅ 已修复（2026-07-31，T6）
- **优先级**：P1
- **现象**：队列在当前消息暂停期间积累新消息时，恢复会同时恢复当前音频并启动下一条队列消息。
- **根因**：`DialoguePlaybackQueue.resume()` 恢复活动引擎后，只要待处理队列非空就再次调用 `processNext()`，没有检查当前消息是否仍在播放。
- **影响**：违反 Step 66-A 的全场严格串行要求，可能产生气泡和声音重叠。
- **修复**：恢复活动音频时不重复启动队列消费者，保持单一播放所有权。
- **回归测试**：`frontend/src/game/audio/DialoguePlaybackQueue.test.ts`。

### BUG-034：音频控制组件卸载后残留 visibilitychange 监听器

- **状态**：✅ 已修复（2026-07-31，T6）
- **优先级**：P2
- **现象**：反复进入和离开 M11 后，页面可见性变化会触发已经卸载组件注册的回调。
- **根因**：`AudioControls` 使用匿名函数注册 `visibilitychange`，且没有在 effect cleanup 中移除。
- **影响**：产生监听器泄漏，并可能重复暂停或恢复音频。
- **修复**：使用稳定处理函数注册监听器，并在 effect cleanup 中移除。
- **回归测试**：`frontend/src/components/scene/scene-components.test.tsx`。

### BUG-035：Checkpoint 可以通过错误场景路径删除
### BUG-035：Checkpoint 可以通过错误场景路径删除

- **状态**：✅ 已修复（2026-07-31，T6）
- **优先级**：P2
- **现象**：在 `library` 创建的 Checkpoint，可以通过 `/api/scenes/dorm/checkpoints/{id}` 删除。
- **根因**：删除查询只按 Checkpoint ID 匹配，没有同时校验 `scene_id`。
- **影响**：场景资源边界失效，错误请求可能删除其他场景的存档。
- **修复**：Checkpoint 查询和删除同时校验 `id + scene_id`，错误场景返回 404。
- **回归测试**：`backend/tests/test_scenes_api.py`。

### BUG-036：切换场景后自动对话扫描停止

- **状态**：✅ 已修复（2026-07-31，T6）
- **优先级**：P1
- **现象**：切换场景后 Agent 仍会移动和显示情绪，但不再自动产生新对话。
- **根因**：`MapScene.loadMap()` 调用 `destroyScene()` 清理定时器，地图重建后没有重新启动对话扫描器。
- **影响**：M11 的核心自主互动在首次切换场景后失效。
- **修复**：地图构建完成后重新创建对话扫描器，切图前统一清理旧会话和音频状态。
- **验证方式**：浏览器依次切换六个场景后观察对话日志与气泡。

### BUG-037：耳语内容没有进入 Agent 行为链路

- **状态**：✅ 已修复并人工验收（2026-07-31，T6）
- **优先级**：P1
- **现象**：向 Agent 发送“去和某人说话”等耳语后，只有角色闪烁，Agent 不会执行指令，也没有接收或失败反馈。
- **根因**：前端事件虽然携带耳语文本，但 `MapScene` 监听器只读取 Agent ID 并播放闪烁 tween；文本未保存、未调用后端，也未注入对话或决策上下文。
- **影响**：Step 64b 的耳语入口为视觉占位，不具备计划中的干预语义。
- **修复**：本地模式保存一次性指令并路由目标对话；Brain 模式将指令注入下一 tick，抢占普通对话并显示排队、执行、回应或超时状态。
- **人工复现**：详情面板选择 Agent，发送明确行动指令，观察角色仅闪烁。

### BUG-038：Checkpoint 加载不恢复已有 Agent 的坐标

- **状态**：✅ 已修复并人工验收（2026-07-31，T6）
- **优先级**：P1
- **现象**：删除 Agent 后加载存档可以恢复人物，但移动已有 Agent 后加载存档不会恢复原坐标。
- **根因**：加载操作只更新 React `agents`；`MapScene.syncAgentsInPlace()` 为避免普通状态同步干扰实时移动，明确不使用 React 坐标覆盖已有 sprite，导致存档恢复也走了同一条非覆盖路径。
- **影响**：无法从相同场面起点比较不同干预结果，Checkpoint 只实现了部分恢复。
- **修复**：增加显式 `restoreAgents()` 读档通道，停止 mover/tween 后强制恢复已有 Agent 坐标、动作和起始格。
- **人工复现**：暂停并保存 Checkpoint，移动角色，再加载该 Checkpoint。

---

## 2026-07-31: State 4 回归修复 + Worker 补丁

### BUG-039：场景启动 Crash — WorldRow 传入不存在的 scenario_id 参数

- **状态**：✅ 已修复 (2026-07-31)
- **优先级**：P0（场景启动 500 错误，M11 完全不可用）
- **根因**：scenes.py 构造 WorldRow 时传入不存在的 scenario_id 列
- **修复**：scenario_id=... → scenario_json=json.dumps({...})
- **关联位置**：`backend/src/api/scenes.py` — lines 302, 315

### BUG-040：AI 驱动场景对话过长

- **状态**：✅ 已修复 (2026-07-31)
- **优先级**：P1（State 4 回归——system prompt 无对话长度约束）
- **现象**：AI 驱动模式下 Agent 对话超长，偶发 TimeoutError
- **根因**：两条路径均缺长度约束——
  Path A（interact 端点）：generate_dialogue_llm 无 SystemMessage
  Path B（WorldEngine+SceneBridge）：build_core_system_message 鼓励“有血有肉的人”但无长度限制；GroupChat task 也无
- **修复（3 处）**：
  1. `scene/engine.py`：新增 system_prompt 硬约束（≤30字、禁止前缀/旁白/元叙述），[SystemMessage, UserMessage] 结构
  2. `persona/prompt_templates.py`：`_build_identity_section` 新增“对话风格规范”（10-30字、拆分长想法、禁止元叙述）——对所有 LifeAgent 生效
  3. `world/messages.py`：`_build_group_task` 新增长度约束（10-30字、拆分长对话）——对每 tick GroupChat 生效
- **关联位置**：`engines/scene/engine.py`, `engines/persona/prompt_templates.py`, `engines/world/messages.py`

### BUG-041：M5 侧边栏点击后主面板风格不更新

- **状态**：✅ 已修复 (2026-07-31)
- **优先级**：P1（侧边栏导航完全无效）
- **根因**：NarrativeFactory hash→style useEffect 依赖[]（仅 mount），同路由内 hash 变化不 remount
- **修复**：改用 useLocation().hash 作为依赖
- **关联位置**：`frontend/src/pages/NarrativeFactory.tsx` — lines 66-78

## 2026-07-31: State 5 — Worker + scenes bug 修复

### BUG-039：场景启动 Crash — WorldRow 传入不存在的 scenario_id 参数

- **状态**：✅ 已修复 (2026-07-31)
- **优先级**：P0（场景启动 500 错误，M11 完全不可用）
- **发现日期**：2026-07-31
- **环境**：`POST /api/scenes/library/start`
- **复现步骤**：
  1. 启动后端
  2. 调用 `POST /api/scenes/library/start` 任意场景
- **实际结果**：返回 500 Internal Server Error，Traceback：`TypeError: 'scenario_id' is an invalid keyword argument for WorldRow`
- **根因**：`scenes.py` 第 302 行和 315 行在构造 `WorldRow(...)` 时传入了 `scenario_id="builtin_study"` 和 `scenario_id=scenario_row.id`。`WorldRow` ORM 模型没有 `scenario_id` 列——场景数据应存入 `scenario_json` 列（JSON 字符串）。
- **修复**：两处 `scenario_id=...` 改为 `scenario_json=_json.dumps({"id": ..., "name": ...})`，与 `worlds.py` 中 `_sync_world_to_db` 的序列化格式一致。
- **关联位置**：`backend/src/api/scenes.py` — lines 302, 315

---

## 2026-07-31：State 3 T6 — M11 耳语与移动补充修复

### BUG-042：多个 Agent 可能移动到同一格

- **状态**：🧪 已修复并通过自动化测试；人工长时间复测转入全局回归
- **优先级**：P1
- **现象**：两个 Agent 偶尔完全重叠，头像中心和姓名标签落在同一位置。
- **根因**：多个 mover 可在同一帧同时判断目标格为空；SSE 移动和对话结束退场也没有共享目标格预占。
- **修复**：增加场景级目标格预占与释放；本地移动、SSE 移动和退场统一使用该协议；初次投放和 Checkpoint 加载自动纠正重复坐标。
- **回归测试**：`AutonomousMover.test.ts`、`MapScene.test.ts`；浏览器 6 Agent 连续移动观察未再出现同格重叠。

### BUG-043：耳语“移动到某人旁边”被误判为对话

- **状态**：🧪 已修复并通过自动化测试；Brain ON/OFF 人工复测转入全局回归
- **优先级**：P2
- **现象**：用户要求 A 移动到 B 旁边时，A 可能只说话或静默，不执行可见位移。
- **根因**：耳语链路以对话为中心；本地模式把五格内视为足够接近，Brain 模式又会把出现人名的指令优先归类为社交指令。
- **修复**：独立识别“移动/移位/靠近/前往某人旁边”等意图，由场景确定 B 身边的安全格；Brain 开关两种模式走同一条确定性移动路径。
- **边界反馈**：已相邻、暂停排队、目标不存在、周围无空位均返回明确提示；“去和 B 说话”仍走原对话链路。
- **回归测试**：M11 定向回归 `45 passed`；前端全量 `351 passed, 7 个既有 NarrativeFactory 测试失败`。

---

## 2026-08-09：M1 Agent 铸造厂 模块测试

> 详细测试记录见 [test-done/m01.md](test-done/m01.md)。

### BUG-M1-001：Loading 圆圈错位

- **状态**：✅ 已修复 (2026-08-09)
- **优先级**：P2
- **根因**：LoadingSpinner 未用 Card 包裹，样式脱离预期
- **修复**：改为内联 flex 横向布局（圆圈在左、文字在右），移除 LoadingSpinner 组件
- **修复文件**：`frontend/src/pages/AgentFoundry.tsx`

### BUG-M1-002：过短输入显示代码报错

- **状态**：✅ 已修复 (2026-08-09)
- **优先级**：P1
- **根因**：缺少客户端输入长度校验
- **修复**：输入 ≤3 字符时禁用按钮 + 橙色提示
- **修复文件**：`frontend/src/pages/AgentFoundry.tsx`

### BUG-M1-003：背景故事标题换行/间距不当

- **状态**：✅ 已修复 (2026-08-09)
- **优先级**：P2
- **根因**：`dt` 元素未设置 `whitespace-nowrap`
- **修复**：添加 `whitespace-nowrap` 样式
- **修复文件**：`frontend/src/pages/AgentFoundry.tsx`

### BUG-M1-004：不同 Agent 重名

- **状态**：✅ 已修复 (2026-08-09)
- **优先级**：P1
- **根因**：后端无重名检测，LLM 多次返回相同名字
- **修复**：三级降级策略——LLM 重新取名 → 本地名字池（25 个中文名）→ 随机后缀
- **修复文件**：`backend/src/api/agents.py`、`backend/src/engines/persona/builder.py`

### BUG-M1-005：模板创建后不滚动到顶部

- **状态**：✅ 已修复 (2026-08-09)
- **优先级**：P1
- **根因**：创建成功后缺少 `scrollTo` 逻辑
- **修复**：`AgentFoundry` 监听 `createdName` 变化滚动到顶部；`TemplateBrowser.handleCreate` 添加 `scrollTo`
- **修复文件**：`frontend/src/pages/AgentFoundry.tsx`、`frontend/src/pages/agent-foundry/TemplateBrowser.tsx`

### BUG-M1-006：侧边栏"目标系统"跳错位置

- **状态**：✅ 已修复 (2026-08-09)
- **优先级**：P1
- **根因**：anchor 指向 `foundry` 而非 `goals`
- **修复**：menuData / GuidePage 中 anchor 从 `foundry` 改为 `goals`
- **修复文件**：`frontend/src/data/menuData.ts`、`frontend/src/pages/GuidePage.tsx`

### BUG-M1-007：侧边栏点"创建 Agent"不回到顶部

- **状态**：✅ 已修复 (2026-08-09)
- **优先级**：P1
- **根因**：输入区缺少 `id="foundry"` 锚点，无专用滚动 effect
- **修复**：包裹 `<div id="foundry">` + `useEffect` 监听 hash 变化执行 `scrollTo(0)`
- **修复文件**：`frontend/src/pages/AgentFoundry.tsx`

### BUG-M1-008：目标截止时间不合理

- **状态**：✅ 已修复 (2026-08-09)
- **优先级**：P2
- **根因**：Prompt 示例 `deadline: null`，LLM 倾向生成 null 或过去日期
- **修复**：Prompt 新增 deadline 生成指导规则；Mock 数据改为 `"2027-06-30"`
- **修复文件**：`backend/src/engines/persona/builder.py`、`backend/src/engines/persona/remixer.py`

### BUG-M1-009：点击"创建 Agent"后页面滚动过头

- **状态**：✅ 已修复 (2026-08-09)
- **优先级**：P1
- **根因**：`scrollIntoView` 与 `scrollTo` 两个 effect 冲突，先跳下去再弹回来
- **修复**：`#foundry` 锚点跳过 `scrollIntoView`，只执行 `scrollTo(0)`
- **修复文件**：`frontend/src/pages/AgentFoundry.tsx`

---

## 2026-08-10：M2 单人剧场 模块测试

> 详细测试记录见 [test-done/m02.md](test-done/m02.md)。

### BUG-M2-001：暂停继续及结束后 Tick 回到 T0

- **状态**：✅ 已修复并人工验收（2026-08-10）
- **优先级**：P1
- **现象**：实验暂停后继续显示 Tick 0；结束后的实验列表同样显示 T0，无法保留最终进度。
- **根因**：WorldEngine 的 Tick 只在内存中增长，暂停和结束接口从 SQLite 读取旧的 `current_tick=0` 并再次回写。
- **修复**：暂停和手动结束时以运行时引擎 Tick 为准；单人剧场达到 8 Tick 自动结束时同步 `finished` 和最终 Tick；引擎重建后从持久化 Tick 继续。
- **修复文件**：`backend/src/api/worlds.py`、`backend/src/api/sse.py`
- **回归测试**：World API/SSE 聚焦测试 `40 passed`；M2 后端相关回归 `153 passed`。
- **人工复测**：暂停返回列表、继续、手动结束和最终 Tick 均通过。

### BUG-M2-002：已完成实验没有历史回放入口

- **状态**：✅ 已修复并人工验收（2026-08-10）
- **优先级**：P2
- **现象**：已完成实验只能删除，无法进入已保存的事件记录。
- **根因**：M2 列表仅为 `running/paused` World 提供“继续”，没有衔接 M8 已有的真实 Simulation 回放能力。
- **修复**：已完成实验增加“查看回放”；携带准确 `world_id` 进入 M8 档案馆，自动定位并展开对应事件，不重新启动 World 或调用 LLM。
- **修复文件**：`frontend/src/pages/SoloTheater.tsx`、`frontend/src/pages/Archive.tsx`
- **回归测试**：M2 前端相关测试 `22 passed`；M2 → M8 精确回放聚焦测试通过。
- **人工复测**：用户确认入口跳转、自动展开和事件查看全部通过。

---

## 2026-08-11: M5 叙事工厂模块测试

### BUG-044：P3 叙事端点参数错误——microfilm/serial/selfportrait 全部 500 ✅

- **状态**：✅ 已修复 (2026-08-11)
- **优先级**：P0（三种叙事风格完全不可用）
- **发现日期**：2026-08-11
- **环境**：`POST /api/narratives/microfilm`、`/serial`、`/selfportrait`
- **复现步骤**：
  1. 启动后端
  2. 在前端 M5 叙事工厂选择 microfilm/serial/selfportrait 风格并点击生成
- **实际结果**：500 Internal Server Error，TypeError: missing required positional arguments
- **根因**：`narratives.py` L282-297 三个端点调用 `_generate_narrative(req, Style)` 参数顺序错误且缺少 `db`、`engine` 依赖注入
- **修复**：三个端点改为与 story/diary 等端点相同的模式——添加 `db: AsyncSession = Depends(get_db)` 和 `engine: NarrativeEngine = Depends(get_narrative_engine)`，调用顺序改为 `_generate_narrative(NarrativeStyle.XXX, req, db, engine)`，添加 try/except 错误处理
- **关联位置**：`backend/src/api/narratives.py` — lines 282-324
- **回归测试**：后端 narrative engine 10 passed；agents/worlds API 46 passed；前端组件 13 passed

### BUG-045：M5 isPending 和 handleGenerate 依赖不完整 ✅

- **状态**：✅ 已修复并关闭 (2026-08-12)
- **优先级**：P2（UX 缺陷——P3 风格生成时按钮不显示加载态）
- **发现日期**：2026-08-11
- **环境**：前端 M5 叙事工厂页面
- **复现步骤**：
  1. 选择 microfilm/serial/selfportrait 风格
  2. 点击生成叙事
- **实际结果**：按钮不显示"生成中…"状态，用户可能重复点击
- **根因**：`isPending` 只检查前 5 种风格的 mutation，`handleGenerate` 依赖数组缺少 P3 mutations
- **修复**：`isPending` 补充 `generateMicrofilm.isPending || generateSerial.isPending || generateSelfportrait.isPending`；`handleGenerate` 依赖数组补充 `generateMicrofilm, generateSerial, generateSelfportrait`
- **关联位置**：`frontend/src/pages/NarrativeFactory.tsx` — lines 97-105, 169-172
- **回归测试**：前端组件 13 passed；TypeScript 零新增错误

### BUG-046：日记风格无独立标题，正文第一行被当作标题 ✅

- **状态**：✅ 已修复并关闭 (2026-08-12)
- **优先级**：P2（输出质量问题）
- **发现日期**：2026-08-11
- **环境**：M5 叙事工厂，日记风格生成
- **复现步骤**：选择日记风格生成叙事
- **实际结果**：标题为正文第一句（如「今天下雨了。」），没有独立标题
- **根因**：DIARY_PROMPT 模板缺少标题格式指令，LLM 不返回标题，_parse_narrative 把正文前 30 字当标题
- **修复**：模板添加标题格式返回指令；要求改为「标题用日期或主题，正文以今天...开头」
- **关联位置**：backend/src/engines/narrative/templates.py — DIARY_PROMPT
- **回归测试**：后端 narrative engine 10 passed

### BUG-047：信件风格标题为称呼语，不是真正标题 ✅

- **状态**：✅ 已修复并关闭 (2026-08-12)
- **优先级**：P2（输出质量问题）
- **发现日期**：2026-08-11
- **环境**：M5 叙事工厂，信件风格生成
- **复现步骤**：选择信件风格生成叙事
- **实际结果**：标题为「亲爱的未来的自己：」等称呼语，应放在正文第一行而非标题
- **根因**：LETTER_PROMPT 模板缺少标题格式指令，LLM 以称呼开头，解析器把称呼当标题
- **修复**：模板添加标题格式返回指令；明确要求「标题自拟，不要用称呼作标题；称呼和落款放在正文中」
- **关联位置**：backend/src/engines/narrative/templates.py — LETTER_PROMPT
- **回归测试**：后端 narrative engine 10 passed

### BUG-048：播客/平行对话生成内容偏离用户输入的主题 ✅

- **状态**：✅ 已修复并关闭 (2026-08-12)
- **优先级**：P1（核心功能——用户输入的主题被完全忽略）
- **发现日期**：2026-08-12
- **环境**：M5 叙事工厂，播客风格生成
- **复现步骤**：选择播客风格，输入主题「豆腐脑是甜的还是咸的」，点击生成
- **实际结果**：标题为「《菠萝电台》第7期：独处时，也能种出快乐」，与输入主题完全无关
- **根因**：PODCAST_PROMPT 和 PARALLEL_PROMPT 模板只把 target 当作「信息」列出，没有强制 LLM 围绕主题写标题和内容
- **修复**：两个模板均添加「标题必须包含/反映主题，不得偏离」「内容必须围绕主题展开」指令；同时补充标题格式返回指令
- **关联位置**：backend/src/engines/narrative/templates.py — PODCAST_PROMPT, PARALLEL_PROMPT
- **回归测试**：后端 narrative engine 10 passed

---

## 2026-08-12: M6 观察者控制台模块测试

> 详细测试记录见 [test-done/m06.md](test-done/m06.md)。

### BUG-M6-001：M2 单人剧场 `[END_TICK]` 泄漏到显示内容 ✅

- **状态**：✅ 已修复 (2026-08-12)
- **优先级**：P1
- **现象**：对话气泡中出现 `[END_TICK]` 文字
- **根因**：`_clean_group_content()` 只在 group chat 路径调用，solo theater 的 `_inner_message_to_event` 和 `_final_message_to_event` 未清理
- **修复**：后端两个方法添加 `_clean_group_content()` + 空内容守卫；前端 `ThoughtBubble.tsx` 和 `EventFeed.tsx` 加 `stripInternalMarkers` 防御性过滤
- **修复文件**：`backend/src/engines/world/messages.py`、`frontend/src/components/agent/ThoughtBubble.tsx`、`frontend/src/components/world/EventFeed.tsx`

### BUG-M6-002：仪表盘 Agent 精力全部显示 100% ✅

- **状态**：✅ 已修复 (2026-08-12)
- **优先级**：P2
- **现象**：所有 Agent 精力条满格，实际应低于 100%
- **根因**：`computeAgentStats` 直接取 `agent.energy`（数据库值始终 100.0），未应用衰减公式
- **修复**：添加与 `AgentStatusPanel` 一致的衰减公式 `Math.max(10, agent.energy - Math.floor(events.length / 5) * 2)`
- **修复文件**：`frontend/src/mocks/control.ts`

### BUG-M6-003：搜索/决策模式 Tab 受 World 过滤影响 ✅

- **状态**：✅ 已修复 (2026-08-12)
- **优先级**：P1
- **现象**：Agent 搜索和决策模式只显示选中 World 的 Agent，应展示全部
- **根因**：`ControlPanel.tsx` 将 `filteredAgents` 传给了所有 Tab
- **修复**：`AgentSearch` 和 `DecisionPatterns` 改回使用 `agents`（全部 Agent）
- **修复文件**：`frontend/src/pages/ControlPanel.tsx`

### BUG-M6-004：单人剧场行动事件（agent_action）不渲染 ✅

- **状态**：✅ 已修复 (2026-08-12)
- **优先级**：P1
- **现象**：单人剧场只显示对话气泡，思考和行动气泡全部消失
- **根因**：`ThoughtBubble.tsx` 的 `resolveBodyText` 处理 `agent_action` 时只从 `event.data` 提取，但后端把可读描述放在 `event.description`，导致 `bodyText` 为空被跳过
- **修复**：`agent_action` 分支在 `data` 字段提取失败后回退到 `event.description`
- **修复文件**：`frontend/src/components/agent/ThoughtBubble.tsx`

---

## 2026-08-13: BUG-M8-001 ~ BUG-M8-007 修复

### BUG-M8-001：回放缺少消息类型图例 ✅

- **状态**：✅ 已修复 (2026-08-13)
- **优先级**：P2
- **现象**：回放事件列表显示 💬🌍📌 等图标，但没有图例说明每个图标代表什么消息类型
- **根因**：事件列表渲染区域缺少图例行
- **修复**：在事件列表上方添加图例行（对话/思考/行动/世界/其他）
- **修复文件**：`frontend/src/pages/Archive.tsx`

### BUG-M8-002：#highlight URL hash 无法定向到回放 ✅

- **状态**：✅ 已修复 (2026-08-13)
- **优先级**：P2
- **现象**：在 M8 其他功能下输入 URL `#highlight` 无法定向到精彩回放 Tab
- **根因**：`Archive.tsx` 的 hash→tab 映射缺少 `highlights` 键
- **修复**：在 MAP 中添加 `highlights: "highlights"`
- **修复文件**：`frontend/src/pages/Archive.tsx`

### BUG-M8-003：World 暂停后回放未立即拉取 ✅

- **状态**：✅ 已修复 (2026-08-13)
- **优先级**：P2
- **现象**：从 World 切换到精彩回放后，World 自动暂停，但回放不会立即拉取最新事件
- **根因**：轮询逻辑只在 `running` 状态下工作，状态变为 `paused` 时直接返回
- **修复**：检测状态从 `running` 变为 `paused` 时立即执行一次 `handleRefresh()`
- **修复文件**：`frontend/src/pages/Archive.tsx`

### BUG-M8-004：展开回放后 URL 不变化 ✅

- **状态**：✅ 已修复 (2026-08-13)
- **优先级**：P2
- **现象**：点开模拟回放记录后 URL 不会变化，无法分享特定回放链接
- **根因**：`handleToggleReplay` 未更新 URL search params
- **修复**：展开时添加 `?replay=world_id`，收起时清除该参数
- **修复文件**：`frontend/src/pages/Archive.tsx`

### BUG-M8-005：成就进度条和百分比不对应 ✅

- **状态**：✅ 已修复 (2026-08-13)
- **优先级**：P2
- **现象**：进度条宽度和显示百分比可能因浮点精度不一致
- **根因**：进度条用 `Math.min(100, ach.progress * 100)`，百分比用 `Math.round(ach.progress * 100)`
- **修复**：统一使用 `Math.round(ach.progress * 100)` 计算
- **修复文件**：`frontend/src/pages/Archive.tsx`

### BUG-M8-006：导出报告命名/Agent 过滤/事件类型中文 ✅

- **状态**：✅ 已修复 (2026-08-13)
- **优先级**：P2
- **现象**：(1) 文件名使用 hash 而非 World 名称；(2) 参与 Agent 列出全部 Agent 而非仅参与者；(3) 事件分布使用英文类型名
- **根因**：`_ascii_slug` 生成 hash 文件名；`_collect_agent_names` 返回全部 Agent；事件类型未映射中文
- **修复**：(1) 文件名直接使用 World 名称（清理非法字符）；(2) 过滤只保留 events 中出现的 agent_id；(3) 添加 `_TYPE_CN` 映射表；(4) Content-Disposition header 使用 RFC 5987 UTF-8 编码
- **修复文件**：`backend/src/api/export.py`

### BUG-M8-007：宽度缩小后布局不合理 ✅

- **状态**：✅ 已修复 (2026-08-13)
- **优先级**：P2
- **现象**：成就卡片在中等宽度下显示 2 列太窄，布局不合理
- **根因**：`grid-cols-2 md:grid-cols-5` 断点跳跃太大
- **修复**：改为 `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5` 更合理的断点
- **修复文件**：`frontend/src/pages/Archive.tsx`

---

## 2026-08-14：M9 Agent Team 模块测试

> 详细测试记录见 [test-done/m09.md](test-done/m09.md)。

### BUG-M9-001：test_team_engine.py 测试旧接口（on_tick / _save_report / finish）✅

- **状态**：✅ 已修复 (2026-08-14)
- **优先级**：P1（4/4 测试全部失败——State 8 重写后测试未同步更新）
- **现象**：`AttributeError: 'TeamEngine' has no attribute 'on_tick'`
- **根因**：State 8 将 TeamEngine 从 GroupChat 模式重写为 Worker 编排模式，旧测试仍调用 `on_tick`、`_save_report`、`finish` 等已删除方法
- **修复**：完全重写为 25 个新测试，覆盖 SSE 工具函数（_make_sse, _make_error_sse, _prefix_worker_sse, _parse_sse_dict）、Agent ID 解析（_resolve_agent_id）、StepResult 数据类和 _find_agent_name
- **修复文件**：`backend/tests/test_team_engine.py`

### BUG-M9-002：test_teams_api.py execute 响应字段名不匹配 ✅

- **状态**：✅ 已修复 (2026-08-14)
- **优先级**：P1（3 个测试失败——KeyError: 'id'）
- **现象**：旧测试期望 `data["id"]`、`data["steps"]`、`data["world_id"]`，但新 execute API 返回 `{"team_id", "plan_id", "status"}`
- **根因**：State 8 重写 execute 端点返回结构变化，测试未同步
- **修复**：`data["id"]` → `data["plan_id"]`；evaluate 测试改用 `GET /plan` 端点获取步骤数据
- **修复文件**：`backend/tests/test_teams_api.py`

### BUG-M9-003：execute 双重分解——API 和 engine 各分解一次，产生两个 PlanRow ✅

- **状态**：✅ 已修复 (2026-08-14)
- **优先级**：P1（核心功能缺陷——每次执行产生两个 Plan，数据不一致）
- **现象**：execute_team 端点预分解任务创建 Plan A，engine.execute() 再次分解创建 Plan B，DB 中出现两个 PlanRow
- **根因**：`api/teams.py` 的 execute_team 在启动后台任务前调用 `decompose_task` + `_create_plan_row`，但 `engine.execute()` 不知道已有 Plan，又执行一次分解
- **修复**：`engine.execute()` 添加 `pre_steps` / `pre_plan_id` 关键字参数；API handler 传递预计算值，engine 跳过重复分解
- **修复文件**：`backend/src/engines/team/engine.py`、`backend/src/api/teams.py`

### BUG-M9-004：execute 幂等性失效——重复执行创建新 Plan ✅

- **状态**：✅ 已修复 (2026-08-14)
- **优先级**：P1（重复点击执行按钮会创建多个 Plan）
- **现象**：第二次 `POST /execute` 返回不同的 plan_id，而非复用第一个
- **根因**：team 状态更新 `"executing"` 发生在后台 `_run()` 内的 engine.execute() 中（异步），API handler 返回响应时 team 状态仍为 `"idle"`，第二次请求直接走新建流程
- **修复**：在 API handler 中创建 Plan 后立即更新 `team_row.status = "executing"` 并 commit，确保后续请求命中幂等检查分支
- **修复文件**：`backend/src/api/teams.py`

---

## 2026-08-14：M9 人工验收 Bug（第一轮）

### BUG-M9-005："智能推荐角色"应改为"智能分配角色" ✅

- **状态**：✅ 已修复 (2026-08-14)
- **优先级**：P2（文案不准确）
- **现象**：按钮显示"智能推荐角色"，用户期望"智能分配角色"
- **修复文件**：`frontend/src/pages/TeamDashboard.tsx` line 407

### BUG-M9-006：空模板提示中"发布"应改为"存模板" ✅

- **状态**：✅ 已修复 (2026-08-14)
- **优先级**：P2（文案不一致——按钮是"存模板"但提示说"发布"）
- **现象**：MarketPanel 空状态提示"在 Team 卡片上点「发布」将配置保存为模板"，但按钮文字是"存模板"
- **修复文件**：`frontend/src/pages/team/MarketPanel.tsx` line 40

### BUG-M9-007：模板卡片删除键太小且不易识别 ✅

- **状态**：✅ 已修复 (2026-08-14)
- **优先级**：P2（UX 缺陷——删除按钮只有一个小  图标，不易识别）
- **现象**：模板卡片的删除按钮仅显示 `🗑` 图标，样式暗淡（text-text-secondary/40），用户难以识别为删除操作
- **修复文件**：`frontend/src/pages/team/MarketPanel.tsx` lines 63-73

### BUG-M9-008：步骤负责人显示 Agent ID 而非名称 ✅

- **状态**：✅ 已修复 (2026-08-14)
- **优先级**：P1（可读性问题——用户看到的是 UUID 而非 Agent 名称）
- **现象**：StepCard 中"负责人"显示 `06f09bef` 等 UUID 前缀，而非 Agent 名称
- **根因**：StepCard 使用 `step.assigneeName`，但 SSE `plan_created` 事件中 `assignee_name` 可能为空或回退到 ID；重入恢复时 `assignee_name` 字段可能缺失
- **修复文件**：`frontend/src/components/team/StepCard.tsx`、`frontend/src/stores/useTeamStore.ts`

### BUG-M9-009：报告代码块内容泄漏到 plaintext 外导致排版错乱 ✅

- **状态**：✅ 已修复 (2026-08-14)
- **优先级**：P1（显示缺陷——代码块内容出现在 `<details>` 外部，后续排版全乱）
- **现象**：ReportViewer 渲染报告时，代码块（```plaintext...```）内的文字出现在折叠区域外，导致后续内容排版混乱
- **根因**：ReportViewer 的 `renderMarkdown` 正则 `/```(\w*)\n([\s\S]*?)```/g` 对代码块格式要求严格（必须换行后接语言标签），当 LLM 生成的代码块格式稍有偏差时匹配失败，内容被当作普通文本处理
- **修复文件**：`frontend/src/components/team/ReportViewer.tsx`

### BUG-M9-010：文件下载应提供每个产出文件的单独链接 ✅

- **状态**：✅ 已修复 (2026-08-14)
- **优先级**：P2（UX 改进——当前只有一个"下载 Markdown"按钮，用户期望每个 .md/.json 文件有独立下载链接）
- **现象**：报告页面只有一个整体下载按钮，用户无法单独下载每个步骤产出的文件
- **修复文件**：`frontend/src/components/team/ReportViewer.tsx`、`frontend/src/pages/TeamDashboard.tsx`

### BUG-M9-011：Team 对抗可以选择两个相同的 Team ✅

- **状态**：✅ 已修复 (2026-08-14)
- **优先级**：P1（逻辑缺陷——对抗双方不应是同一团队）
- **现象**：VersusPanel 两个下拉框可以选择同一个 Team，虽然 `canStart` 有 `teamA !== teamB` 检查，但用户界面没有阻止选择
- **修复文件**：`frontend/src/pages/team/VersusPanel.tsx`

### BUG-M9-012：Team 对抗流程不清晰，报告不可见 ✅

- **状态**：✅ 已修复 (2026-08-14)
- **优先级**：P1（功能可用性问题——用户不清楚对抗流程，对抗结果报告无法查看）
- **现象**：用户不知道对抗是"两队各自完成任务再评审"还是"直接评审已有报告"；对抗结果显示有报告但看不见内容
- **根因**：VersusPanel 只显示评分对比条，不展示两队的完整报告；对抗流程说明不足
- **修复文件**：`frontend/src/pages/team/VersusPanel.tsx`

### BUG-M9-013：报告中应显示每个 Agent 的角色 ✅

- **状态**：✅ 已修复 (2026-08-14)
- **优先级**：P2（信息缺失——报告只列出 Agent 名称，没有角色信息）
- **现象**：即使创建时已分配角色，报告中的"团队"部分只显示"名称 — 成员"，没有显示实际角色（如产品经理、开发等）
- **根因**：`engine._compile_report()` 使用 `a.get("role", "成员")` 但 `self._agents` 中的 role 来自 `team.roles` 映射，如果创建时未分配角色则全部显示"成员"
- **修复文件**：`backend/src/engines/team/engine.py` _compile_report 方法

### BUG-M9-014：找不到重新执行按钮和学习曲线入口 ✅

- **状态**：✅ 已修复 (2026-08-14)
- **优先级**：P1（功能缺失——finished Team 无法重新执行，学习曲线不易发现）
- **现象**：Team 卡片上 finished 状态只有"查看"按钮，没有"重新执行"按钮；学习曲线只在执行视图中显示，列表页看不到
- **根因**：TeamDashboard.tsx 列表视图中 execute 按钮只在 `team.status === "idle"` 时显示；学习曲线只在执行视图 `isDone` 时渲染
- **修复文件**：`frontend/src/pages/TeamDashboard.tsx`

## 2026-08-14：M9 人工验收 Bug（第二轮）

### BUG-M9-015：导出文件点击后跳转异常，应直接下载 ✅

- **状态**：✅ 已修复 (2026-08-14)
- **优先级**：P2（UX 缺陷——文件链接用 `target="_blank"` 打开新页签，而非下载）
- **现象**：点击步骤产出文件链接后浏览器打开新页签显示文件内容，而非触发下载
- **根因**：文件链接使用 `<a href="..." target="_blank">` 直接导航，未使用 Blob + download 属性
- **修复文件**：`frontend/src/pages/TeamDashboard.tsx`（改为 fetch + Blob + download 触发下载）

### BUG-M9-016：代码块内容泄漏到 plaintext 折叠区外 ✅

- **状态**：✅ 已修复 (2026-08-14)
- **优先级**：P1（显示缺陷——代码块内容出现在 `<details>` 外部，排版错乱）
- **现象**：ReportViewer 渲染报告时，部分代码块内容泄漏到折叠区外
- **根因**：正则 `/```(\w*)[ \t]*\n([\s\S]*?)```/g` 对代码块格式要求严格，LLM 生成的 4 反引号或无换行格式无法匹配
- **修复文件**：`frontend/src/components/team/ReportViewer.tsx`（增加 3-4 反引号匹配 + 兜底正则）

### BUG-M9-017：finished 卡片 Badge 显示 executing ✅

- **状态**：✅ 已修复 (2026-08-14)
- **优先级**：P1（状态显示错误——SSE 已完成但 DB 状态未更新）
- **现象**：Team 卡片 Badge 显示 "executing"，但实际已完成
- **根因**：Badge 直接使用 `team.status`（DB 值），未考虑 SSE store 中的实时状态
- **修复文件**：`frontend/src/pages/TeamDashboard.tsx`（Badge 优先使用 SSE store 状态）

### BUG-M9-018：点击一个卡片执行，所有卡片显示“启动中” ✅

- **状态**：✅ 已修复 (2026-08-14)
- **优先级**：P2（UX 缺陷——全局 isPending 状态导致所有卡片按钮文字变化）
- **现象**：点击 Team A 的执行按钮，Team B/C 的按钮也变成“启动中…”
- **根因**：`executeTeam.isPending` 是 React Query 全局状态，所有卡片共享
- **修复文件**：`frontend/src/pages/TeamDashboard.tsx`（移除按钮文字中的 isPending 判断）

### BUG-M9-019：报告中团队角色仍显示“成员” ✅

- **状态**：✅ 已修复 (2026-08-14)
- **优先级**：P1（信息缺失——报告团队部分所有 Agent 显示“成员”）
- **现象**：即使创建时已分配角色，报告中仍显示“菠萝侠 — 成员”
- **根因**：`_compile_report` 中 `_evolved_roles` 优先级高于 `role_map`，且 `role_map` 默认值为“成员”
- **修复文件**：`backend/src/engines/team/engine.py`（调整优先级：team.roles > evolved_roles > agent.role）

### BUG-M9-020：负责人仍显示 ID 而非名字 ✅

- **状态**：✅ 已修复 (2026-08-14)
- **优先级**：P1（可读性问题——步骤负责人显示 UUID 前缀如 "d3a16204"）
- **现象**：StepCard 中负责人显示 "d3a16204" 而非 Agent 名称
- **根因**：API handler 中 `engine._find_agent_name()` 在 `engine._agents` 设置之前调用，无法查找名称
- **修复文件**：`backend/src/api/teams.py`（提前设置 `engine._agents`）+ `frontend/src/components/team/StepCard.tsx`（添加 ID 回退查找）

### BUG-M9-021：学习曲线内容过于单一 ✅

- **状态**：✅ 已修复 (2026-08-14)
- **优先级**：P2（信息不足——只显示任务次数和趋势）
- **现象**：学习曲线只显示“2 次任务 · 稳定”，信息量不足
- **修复文件**：`frontend/src/pages/team/LearningCurve.tsx`（添加平均分、最佳表现、趋势图标）

### BUG-M9-022：Team 对抗维度评分右侧数字未对齐 ✅

- **状态**：✅ 已修复 (2026-08-14)
- **优先级**：P2（视觉缺陷——不同位数数字导致右侧不对齐）
- **现象**：对抗结果中评分条右侧数字（如 "10" vs "3"）宽度不一致，视觉不对齐
- **修复文件**：`frontend/src/pages/team/VersusPanel.tsx`（固定数字宽度 + tabular-nums）

## 2026-08-14：M9 人工验收 Bug（第三轮）

### BUG-M9-023：执行按钮无加载状态 ✅

- **状态**：✅ 已修复 (2026-08-14)
- **优先级**：P2（UX 缺陷——点击执行后按钮文字不变化，用户不知道是否点击成功）
- **现象**：点击 Team 卡片的「▶ 执行」按钮后，按钮文字不变，无加载反馈
- **根因**：`executeTeam.isPending` 是全局 React Query 状态，之前为避免所有卡片同时显示"启动中"而移除了 isPending 判断，但导致完全没有加载状态
- **修复文件**：`frontend/src/pages/TeamDashboard.tsx`（添加 `executingTeamId` 局部状态，仅当前点击的卡片显示"启动中…"）

### BUG-M9-024：文件下载内容错误 ✅

- **状态**：✅ 已修复 (2026-08-14)
- **优先级**：P1（功能缺陷——下载的文件内容是 JSON 包装器而非实际文件内容）
- **现象**：下载的文件内容显示 `{"detail":"文件 'CONTEXT.md' 不存在"}` 或 JSON 包装格式
- **根因**：后端 API 返回 `{"path", "content", "size"}` JSON 对象，前端直接用 `resp.blob()` 下载了整个 JSON 而非提取 content 字段
- **修复文件**：`frontend/src/pages/TeamDashboard.tsx`（先 `resp.json()` 解析，再提取 `data.content` 创建 Blob）

### BUG-M9-025：plaintext 仍有文本溢出 ✅

- **状态**：✅ 已修复 (2026-08-14)
- **优先级**：P1（显示缺陷——代码块内容仍泄漏到折叠区外）
- **现象**：ReportViewer 渲染报告时，部分代码块内容仍出现在 `<details>` 外部
- **根因**：正则表达式对代码块格式要求严格，LLM 生成的代码块可能有尾部空格、空行等变体
- **修复文件**：`frontend/src/components/team/ReportViewer.tsx`（改用逐行扫描算法，更鲁棒地识别代码块边界）

### BUG-M9-026：Team 未分配角色 ✅

- **状态**：✅ 已修复 (2026-08-14)
- **优先级**：P1（功能缺失——创建 Team 时未点击"智能分配角色"则 roles 为空）
- **现象**：Team 卡片和报告中所有 Agent 显示"成员"，没有具体角色
- **根因**：前端创建 Team 时如果未调用 `suggest_roles`，roles 数组为空；后端直接存储空数组
- **修复文件**：`backend/src/api/teams.py`（当 roles 为空时，根据 Agent MBTI 自动分配默认角色）

### BUG-M9-027：对抗评估不合理 ✅

- **状态**：✅ 已修复 (2026-08-14)
- **优先级**：P2（体验缺陷——所有维度显示相同分数和"规则评估"，无区分度）
- **现象**：Team 对抗结果中所有维度分数相同，评语都是"规则评估"
- **根因**：LLM 客户端创建失败或 API 调用超时时，`_fallback_score` 返回无区分度的评分
- **修复文件**：`backend/src/engines/team/versus.py`（改进 `_fallback_score`，基于报告内容长度、结构、关键词等维度差异化评分）

## 2026-08-14：M9 人工验收 Bug（第四轮）

### BUG-M9-028：步骤产出文件下载无实际内容 ✅

- **状态**：✅ 已修复 (2026-08-14)
- **优先级**：P1（功能缺陷——下载的文件为空或内容错误）
- **现象**：点击步骤产出文件区域的文件名，下载出的文件没有实际内容
- **根因**：两个问题叠加：(1) `files_created` 存储的是相对于 worker workspace 的文件名（如 `output.md`），但下载 API 在 `run-*/` 下查找，路径不匹配；(2) 引擎中步骤目录名用 `step_{i+1}` 但 workspace 初始化用 `step_{i+1}_{title}`，目录名不一致
- **修复文件**：`backend/src/engines/team/engine.py`（`files_created` 存储相对于 run root 的完整路径 + 统一步骤目录命名）

### BUG-M9-029：代码块仍溢出报告区域 ✅

- **状态**：✅ 已修复 (2026-08-14)
- **优先级**：P2（UX 缺陷——代码块内容未被正确折叠，溢出到报告外部）
- **现象**：报告中的代码块内容没有被 ``` 包装，直接显示为普通文本
- **根因**：逐行扫描算法对代码块格式要求严格（结尾 ``` 必须独立成行），LLM 生成的非标格式代码块未被捕获
- **修复文件**：`frontend/src/components/team/ReportViewer.tsx`（在逐行扫描后添加兜底正则，捕获非标代码块）

### BUG-M9-030：Team 对抗评估内容不对或为空 ✅

- **状态**：✅ 已修复 (2026-08-14)
- **优先级**：P1（功能缺陷——评估结果无参考价值）
- **现象**：Team 对抗结束后的评估内容生成不对，甚至为空
- **根因**：(1) `_fallback_score` 中 `has_files = "" in content` 永远为 True（空字符串在任何字符串中），导致评分虚高；(2) `report` 从 DB 读取可能为 None，未做兜底处理
- **修复文件**：`backend/src/engines/team/versus.py`（修复 `has_files` 判断）、`backend/src/api/teams.py`（report None 兜底）

### BUG-M9-031：导出文件下载仍显示文件不存在 ✅

- **状态**：✅ 已修复 (2026-08-14)
- **优先级**：P1（功能缺陷——文件下载完全不可用）
- **现象**：点击步骤产出文件区域的文件名，仍然提示文件不存在
- **根因**：后端文件路径与 API 查找路径持续不匹配，修复路径问题的方案过于复杂且易出错
- **修复方案**：改变策略——不再通过 API 从文件系统读取，而是直接从报告正文中解析文件内容（报告中的 `####  filename` + ` ``` ` 代码块已包含完整文件内容），前端本地提取后生成下载
- **修复文件**：`frontend/src/pages/TeamDashboard.tsx`（从 `store.report.content` 正则提取文件内容，本地 Blob 下载）

### BUG-M9-032：已结束的 Team 仍显示“执行中” ✅

- **状态**：✅ 已修复 (2026-08-14)
- **优先级**：P1（UX 缺陷——用户无法区分已完成和正在执行的任务）
- **现象**：Team 执行完成后，列表卡片仍显示“executing”/“执行中”状态
- **根因**：`_finalize_plan` 可能因异常未被调用，导致 Team 状态停留在 "executing"；旧数据无修正机制
- **修复方案**：(1) 在 `_run()` 的 `finally` 块添加安全网，SSE 流结束时强制更新状态为 "finished"；(2) 在 `list_teams` API 中添加自动修正逻辑，检测 Plan 已 finished 但 Team 仍为 executing 的情况并自动修正
- **修复文件**：`backend/src/api/teams.py`（`_run()` 安全网 + `list_teams` 状态修正）

### BUG-M9-033：已完成 Team 的“评估团队”按钮失效 ✅

- **状态**：✅ 已修复 (2026-08-14)
- **优先级**：P1（功能缺陷——用户无法对已完成的任务进行评估）
- **现象**：Team 执行完成后，点击“查看”进入报告视图，但“评估团队”按钮不显示或失效
- **根因**：重新进入已完成的 Team 时，SSE 连接已断开，`isDone` 被重置为 `false`，`store.report` 为 `null`，导致报告视图（包括评估按钮）不渲染
- **修复方案**：修改报告视图的渲染条件，当 `store.report` 为空时使用 `teamPlan?.report`（从 DB 恢复的 Plan 数据）作为后备；统一使用 `currentReport` 变量访问报告内容
- **修复文件**：`frontend/src/pages/TeamDashboard.tsx`（报告视图条件判断 + 报告内容来源）

## 2026-08-15：M9 人工验收 Bug（第五轮）

### BUG-M9-034：对抗评分表右端未对齐 ✅

- **状态**：✅ 已修复 (2026-08-15)
- **优先级**：P2（UX 缺陷——评分表数字对齐不整齐）
- **现象**：Team 对抗多维评分表中，右侧的 A/B 分数数字没有对齐
- **根因**：数字 span 的宽度 `w-5` 太小，导致两位数时溢出破坏对齐
- **修复方案**：将数字 span 宽度从 `w-5` 增加到 `w-6`，确保两位数也能对齐
- **修复文件**：`frontend/src/pages/team/VersusPanel.tsx`（ScoreBar 组件数字宽度）

### BUG-M9-035：学习画像柱状图不可见 ✅

- **状态**：✅ 已修复 (2026-08-15)
- **优先级**：P2（UX 缺陷——柱状图高度太小且颜色太淡，几乎不可见）
- **现象**：学习画像区域显示“5 次任务 · 平均 100%”，但柱状图几乎看不到
- **根因**：(1) 柱子最小高度 4% of 48px ≈ 2px，太小；(2) 颜色不透明度 40% 太淡；(3) 容器高度 48px 不够
- **修复方案**：(1) 最小高度从 4% 增加到 8% 并添加 `minHeight: 8px`；(2) 颜色不透明度从 40% 增加到 60%；(3) 容器高度从 48px 增加到 64px；(4) 添加底部边框作为基准线
- **修复文件**：`frontend/src/pages/team/LearningCurve.tsx`（柱状图样式优化）

### IMP-M9-036：学习画像柱状图样式优化 ✅

- **状态**：✅ 已修复 (2026-08-15)
- **优先级**：P3（UX 改进——柱状图比例不协调）
- **现象**：柱状图宽度太宽（48px）、高度太低（容器 96px）、柱间距太小（gap-3）
- **根因**：样式参数不合理，视觉比例不协调
- **修复方案**：(1) 柱子宽度从 48px 减少到 32px；(2) 容器高度从 96px 增加到 128px；(3) 柱间距从 gap-3 增加到 gap-4；(4) 最小高度从 12px 增加到 16px
- **修复文件**：`frontend/src/pages/team/LearningCurve.tsx`
- **关于 100% 问题**：`completion_pct` 是步骤完成率（done/total），所有步骤完成即为 100%，这是正确行为。质量评分由 LLM 多维评分功能单独体现。

### IMP-M9-037：对抗评分表改为鱼骨图样式 ✅

- **状态**：✅ 已修复 (2026-08-15)
- **优先级**：P3（UX 改进——评分表视觉效果不够直观）
- **现象**：原评分表 A/B 长条在同一侧排列，不够直观
- **修复方案**：改为鱼骨图样式——数字在中间对齐（A|B），A 长条从右向左延伸（绿色），B 长条从左向右延伸（橙色），两侧各占 flex-1 空间
- **修复文件**：`frontend/src/pages/team/VersusPanel.tsx`（ScoreBar 组件重构）
