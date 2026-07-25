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

---

## BUG-007：M8 精彩回放使用静态 Mock 数据，且点击跳转到沙盒创建页而非回放

- **状态**：待处理
- **优先级**：P2（展示时可看到数据，但无实际追踪价值）
- **发现日期**：2026-07-23
- **环境**：前端 Archive → 精彩回放 Tab
- **复现步骤**：
  1. 在沙盒运行一次模拟（如期末周，3 Agent × 几 tick）。
  2. 模拟结束。
  3. 进入 `/archive` → 精彩回放 Tab。
- **实际结果**：
  - 回放列表始终显示 MOCK_REPLAYS（新生报到、期末周、毕业选择），与用户实际运行的模拟无关。
  - 点击回放卡片跳转到 `/sandbox` 并传入 `{ scenario: scenarioName }`，进入的是**沙盒创建页**（新建模拟），而非该次模拟的回放/详情页。
- **期望结果**：
  - 回放列表应从 `GET /api/simulations` 读取真实模拟记录。
  - 点击应跳转到该次模拟的**历史事件回放页面**（加载已有 World 的事件流，只读模式），而非创建新模拟。
- **影响范围**：M8 档案馆 → 精彩回放 Tab
- **关联位置**：
  - `frontend/src/pages/Archive.tsx` — HighlightsPanel 组件（行 90-140）
  - `frontend/src/mocks/archive.ts` — MOCK_REPLAYS 静态数据
  - `backend/src/api/simulations.py` — 已有 `GET /api/simulations` 端点可用
  - 缺少：历史 World 回放模式（加载已有事件流）
- **修复方向**：Step 45（档案馆功能 #51）

---

## BUG-008：M8 实验模板使用 Mock 数据，点击行为与回放相同

- **状态**：待处理
- **优先级**：P2
- **发现日期**：2026-07-23
- **环境**：前端 Archive → 实验模板 Tab
- **复现步骤**：
  1. 进入 `/archive` → 实验模板 Tab。
  2. 点击"使用模板"。
- **实际结果**：
  - 模板列表始终显示 MOCK_TEMPLATES（3 个硬编码模板），无法反映用户保存的场景配置。
  - 点击跳转到 `/sandbox` 并传入模板名称——进入沙盒创建页，但不会自动填入模板的场景参数。
- **期望结果**：
  - 模板列表应从后端 `GET /api/worlds?type=template` 或 `GET /api/scenarios` 获取用户可复用的场景。
  - 点击应在沙盒创建页预填所选场景配置。
- **关联位置**：
  - `frontend/src/pages/Archive.tsx` — TemplatesPanel 组件（行 145-184）
  - `frontend/src/mocks/archive.ts` — MOCK_TEMPLATES 静态数据
  - `backend/src/api/scenarios.py` — 已有场景 CRUD 端点
- **修复方向**：Step 45（档案馆功能 #52）

---

## BUG-009：M8 研究报告导出使用裸 fetch，未复用 useExportReport hook

- **状态**：待处理  
- **优先级**：P3（功能可用，但代码不规范——Step 36 创建的 hook 未被使用）
- **发现日期**：2026-07-23
- **环境**：前端 Archive → 研究报告导出 Tab
- **复现步骤**：
  1. Step 36 新建了 `api/export.ts`（`useExportReport()` hook）。
  2. 进入 `/archive` → 导出 Tab。
- **实际结果**：ExportPanel 仍使用裸 `fetch(/api/export/report/${worldId}${ext})` 和内联 blob 下载逻辑，未复用 `useExportReport()`。
- **期望结果**：导出面板应使用 `useExportReport` mutation hook，保持一致性。
- **关联位置**：
  - `frontend/src/pages/Archive.tsx` — ExportPanel 组件 handleApiExport（行 265-290）
  - `frontend/src/api/export.ts` — useExportReport hook
- **修复方向**：Step 45 中顺手改

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

## BUG-015：M8 研究报告导出 MD 报错、JSON 为空

- **状态**：待处理
- **优先级**：P2（功能可用但数据源错误——只读内存不读 DB）
- **发现日期**：2026-07-24
- **环境**：Archive → 研究报告导出
- **复现步骤**：
  1. 创建一个 World，模拟几 tick，暂停
  2. 进入 `/archive` → 研究报告导出 Tab
  3. 点「导出 Markdown」
  4. 点「导出 JSON」
- **实际结果**：
  - MD：`404 No events found. Start a simulation first.`
  - JSON：200 OK 但下载文件内容为空（`"total_events": 0`）
- **根因**：`backend/src/api/export.py:163-168` `_collect_events()` 只从 `_active_worlds` 内存取事件，不查 SQLite。服务器重启、World 结束/重置后 engine 不在内存 → 返回空列表
- **对比**：`GET /api/worlds/{id}/events` 查询 SQLite `events` 表——正常工作
- **修复方向**：`_collect_events()` 应增加 DB fallback，与 events API 一致的查询逻辑
- **关联位置**：
  - `backend/src/api/export.py` — `_collect_events()` (line 163-168) + `export_report_markdown()` (line 206-209) 空检查 + `export_report_json()` (line 245) 缺空检查

---

## BUG-017：Agent 日记入口在 M1 但实现在 M5

- **状态**：待处理
- **优先级**：P2（功能可用但入口放错模块）
- **发现日期**：2026-07-24
- **环境**：M1 铸造厂 / M5 叙事工厂
- **实际结果**：M1 Agent 详情中有「生成日记」按钮，点击后跳转到 M5 叙事工厂——功能本身在 M5 实现，但入口放在了 M1。用户困惑日记是 M1 的功能还是 M5 的
- **修复方向**：要么把入口移到 M5（叙事工厂 Agent 选择后直接生成），要么在 M1 保持入口但跳转时自动选中该 Agent 并切换到日记风格

---

## BUG-016：M5 叙事工厂侧边栏选取无效

- **状态**：待处理
- **优先级**：P1（侧边栏 Agent 列表点击后主界面功能框不切换）
- **发现日期**：2026-07-24
- **环境**：前端 NarrativeFactory 页面
- **复现步骤**：
  1. 打开 `/narratives`
  2. 左侧 Agent 列表中点击某个 Agent
  3. 观察右侧主界面的叙事风格选择 / 生成按钮
- **实际结果**：右侧功能框不跟随侧边栏选择变化——始终停留在初始状态
- **期望结果**：选中 Agent 后，主界面叙事风格选择区和生成按钮应关联到该 Agent
- **关联位置**：
  - `frontend/src/pages/NarrativeFactory.tsx` — Agent 选择 → 叙事生成的状态绑定
