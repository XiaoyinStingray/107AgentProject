# State 7 实施报告 — DONE

> **日期:** 2026-08-04
> **分支:** main
> **版本:** 7.1

---

## 总览

4 个 Step 全部完成，后端 6 个 Python 文件 + 前端 5 个 TSX/TS 文件。所有代码编译通过，零新增 TypeScript 错误。

---

## Step 103 — 用户可调参数面板 ✅

**9 个可调参数**：temperature_think/act、randomness_pct、proactive_chat_interval_min、idle_pause_minutes、emotion_decay_seconds、worker_max_steps/revisions/timeout_minutes

### 后端

| 文件 | 改动 |
|------|------|
| `config.py` | 新增 `UserSettings` Pydantic 模型 (ge/le 校验) + `get_settings()` 单例 + `save_user_settings()` JSON 持久化至 `backend/data/user_settings.json` |
| `api/settings.py` | **新建** — `GET/PUT /api/settings` + `POST /api/settings/reset`。PUT 通过 `UserSettings(**merged)` 重新校验 |
| `main.py` | 注册 `settings_router` |
| `llm/client.py` | `create_model_client()` 温度优先读 `UserSettings`，兜底 `.env` |
| `engines/worker/engine.py` | `_max_steps` 从 UserSettings 读取，替代硬编码 `MAX_STEPS=20`；主循环新增 `_timeout_seconds` 超时检查 |
| `engines/worker/state_machine.py` | `MAX_STEPS` 常量保留为兜底默认值 |

### 前端

| 文件 | 改动 |
|------|------|
| `api/settings.ts` | **新建** — React Query hooks: `useSettings` / `useUpdateSettings` / `useResetSettings` |
| `pages/SettingsPage.tsx` | **新建** — 3 组滑块面板 + 按组/全局恢复默认 + 保存持久化 |
| `App.tsx` | `/settings` 路由 |
| `Sidebar.tsx` | ⚙️ 齿轮图标入口 |

---

## Step 104 — 结点重构 + PipelineEdge + Loop/Branch ✅

### 数据模型

`PipelineNodeSpec` 从 6 字段扩到 12 字段：
```
id, title, agent_id, task           ← 原有
role, produces, expects             ← 新增
depends_on, depends_on_files         ← 过渡保留
extra_tools, enabled_tools          ← Step 105 消费
```

`PipelineEdge` 新建（8 字段，3 种类型）：
```
id, from_node, to_node
edge_type: flow | loop | branch
condition, condition_field
max_iterations, iteration_label    ← Loop 专属
priority, label                     ← Branch 专属
```

### 引擎

| 功能 | 状态 |
|------|------|
| `get_flow_deps()` — FLOW 边 + depends_on → 依赖映射 | ✅ |
| `_topological_sort()` — 支持显式 deps | ✅ |
| LOOP 回边 — 条件满足 → 回放路径节点 | ✅ |
| BRANCH 分支 — 条件满足 → 跳过被绕过节点 | ✅ |
| `_eval_condition()` — 简单/数值/正则 3 种模式 | ✅ |
| 条件评估读取 workspace 文件 | ✅ |
| `_path_between()` — 向上游回溯 | ✅ |
| `_skip_bypassed()` — BFS 递归标记 | ✅ |
| ERROR 节点可触发回边 | ✅ |
| 回放节点重新拓扑排序（避免竞态） | ✅ |

### API

`PUT /api/pipelines/{id}` — 完整接受 nodes(12字段) + edges
`GET /api/pipelines/{id}` — 返回 nodes(12字段) + edges
`_save_pipelines` / `_load_pipelines` — JSON 序列化含 edges

---

## Step 105 — 8 个特殊工具 ✅

### 工具注册表 (`tools.py`)

| 工具 | 输入 | 产出 | 实现 |
|------|------|------|------|
| `mindmap_generate` | topic | Mermaid 思维导图 → `mindmap.md` | LLM prompt |
| `chart_generate` | data_json, chart_type | matplotlib PNG → `chart.png` | Python 沙盒 (白名单 bar/line/pie/scatter) |
| `timeline_generate` | events_json | 交互式 HTML → `timeline.html` | HTML 模板 |
| `summarize` | path, max_words | 结构化摘要 → `summary.md` | LLM prompt |
| `translate` | path, target_lang | 翻译文件 → `{name}_{lang}.md` | LLM prompt |
| `data_profile` | path | 数据画像 → `data_profile.md` | pandas 沙盒 |
| `code_review` | path | 4 维审查 → `code_review.md` | LLM prompt |
| `outline_generate` | topic, sections | 文档大纲 → `outline.md` | LLM prompt |

### 安全性

- `chart_type` 白名单校验 (bar/line/pie/scatter)
- `data_json` 和 `path` 转义 `'''` 和 `\\` 防代码注入

### 集成

- `make_worker_tools(workspace, extra_tools=[...])` — 按需注册
- `AgentWorker.execute(task, extra_tools=[...])` — 逐节点传递
- `PipelineEngine` — 从 `node.extra_tools` 传给 worker

---

## Step 106 — 图形化管线编辑器 ✅

### 组件

| 文件 | 功能 |
|------|------|
| `pages/PipelineEditor.tsx` | React Flow 画布 + 工具栏（添加/保存/自动布局）+ 拖拽连线 + 右侧属性面板 |
| `components/pipeline/PipelineNodeComponent.tsx` | 自定义节点渲染 — 5 色角色配色 + 输入/输出桩 + 文件徽章 + 工具计数 |

### 功能清单

- [x] React Flow 画布 (`@xyflow/react`)
- [x] 节点按 role 着色 (analyst紫/writer绿/reviewer琥珀/executor灰蓝)
- [x] 拖拽桩创建 FLOW 边
- [x] 回边按钮 + 条件+迭代上限
- [x] 分支按钮 + 条件+标签
- [x] 三种边样式: flow(灰实线) / loop(橙虚线) / branch(绿点线)
- [x] 右侧面板: 标题/Agent下拉/角色下拉/任务描述/产出文件/特殊工具勾选
- [x] 自动布局 (拓扑排序 → 层级排列)
- [x] 保存/加载 API 集成
- [x] `depends_on` → FLOW edge 自动迁移
- [x] Controls + MiniMap + 背景点阵

### 路由

`/pipeline-editor` — 图形化编辑器
`/pipeline` — 原有表单编辑器（保留兼容）

---

## Bug 修复 (本会话)

| 文件 | 问题 | 状态 |
|------|------|------|
| `MapScene.ts` | 30 个合并冲突标记 + 5 个重复 `restoreAgents` | ✅ |
| `AgentVoiceEngine.ts` | 重复 volume 参数 + 重复 getVol | ✅ |
| `DialoguePlaybackQueue.ts` | 重复 getEffectiveVolume + 重复 volume 回调 | ✅ |
| `MapScene.ts` (receiveWhisper) | 耳语"没有可互动的目标" | ✅ |
| `ProactiveChatManager.ts` | 无手动触发 | ✅ forceTrigger() |
| `ProactiveChat.tsx` | 对话结束后自动关闭太快 | ✅ 手动关闭按钮 |
| `ProactiveChat.tsx` | 硬编码 A/B/C 选项 | ✅ LLM 生成 + 自定义输入 |
| `Home.tsx` | 缺 M12 首页入口 | ✅ 已加 |

## 代码审查修复 (10 项)

| # | 严重度 | 修复 |
|---|--------|------|
| 1 | 🔴 | `_path_between` 向上游回溯 |
| 2 | 🔴 | 条件读取 workspace 文件 |
| 3 | 🔴 | 回放节点拓扑排序 |
| 4 | 🔴 | ERROR 节点可触发回边 |
| 5 | 🔴 | `_skip_bypassed` 递归标记 |
| 6 | 🟠 | GET pipeline 返回 edges |
| 7 | 🟠 | PUT settings 重新校验 |
| 8 | 🟠 | engine 超时检查 |
| 9 | 🟠 | chart/data_profile 防注入 |
| 10 | 🟡 | Settings 恢复默认用真值 |
| 11 | 🟡 | Agent 下拉绑 `agent_id` |

---

## 编译状态

- **后端**: 6 个修改/新建文件 — 全部 `py_compile` 通过
- **前端**: 5 个新文件 + 修改 — 零新增 TypeScript 错误
- **预存错误** (未改动): `WorkerTerminal.tsx` ×2, `EventFeed.tsx` ×1
