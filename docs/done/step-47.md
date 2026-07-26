# Step 47 — LLM 成本与性能优化

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-26 |
| Phase | Phase 13.1 |
| Plan 章节 | [plan-state2.md](../plan-state2.md) §Step 47 |
| 状态 | ✅ done |

## 产出

### 后端

| 文件 | 操作 | 说明 |
|------|------|------|
| `.env.example` | 修改 | 默认模型更新为 `deepseek-v4-flash`，补充 DeepSeek V4 思考模式配置说明 |
| `backend/src/config.py` | 修改 | 默认模型更新为 V4 Flash，新增内部配置 `llm_thinking_enabled=false` |
| `backend/src/llm/client.py` | 修改 | 新增 `think`/`act` 客户端 profile；按用途设置 0.8/0.5 温度；官方 DeepSeek V4 显式控制思考模式 |
| `backend/src/api/worlds.py` | 修改 | 构建 WorldEngine 时注入 act profile 客户端 |
| `backend/src/api/arenas.py` | 修改 | 竞技场裁判与评分使用 act profile 客户端 |
| `backend/src/engines/world/engine.py` | 修改 | 增加向后兼容的可选 act 客户端注入，并拆出目标判断职责；文件由 308 行降至 209 行 |
| `backend/src/engines/world/goals.py` | 新建 | 承接目标进度判断、结构化结果解析与 `goal_update` 事件生成 |
| `backend/src/engines/world/messages.py` | 修改 | GroupChat 发言人选择器优先使用 act profile 客户端 |
| `backend/src/engines/world/state.py` | 修改 | 最近事件进入 LLM 上下文前执行空白归一化、单条限长和总字符预算限制 |
| `backend/tests/test_step47_performance.py` | 新建 | 覆盖温度分级、DeepSeek 思考模式、上下文预算、客户端路由和可缓存前缀 |

### 前端

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/components/agent/ThoughtStream.tsx` | 修改 | 超过 200 条时使用手写窗口化列表；支持查看更早记录、返回最新和浏览旧记录时停止自动滚底 |
| `frontend/src/components/agent/ThoughtStream.test.tsx` | 新建 | 覆盖 200/201/500 条边界、旧记录浏览、返回最新、事件点击和空状态 |

### 文档

| 文件 | 操作 | 说明 |
|------|------|------|
| `docs/done/README.md` | 修改 | Step 47 标记完成 |
| `docs/done/step-47.md` | 新建 | 本步开发、测试、决策和已知问题记录 |

## 决策记录

- **上下文采用确定性限长，不新增 LLM 摘要调用：** 当前 `WorldEngine` 每 tick 清空 AutoGen 消息历史，且 `_build_world_context()` 原本只注入最近 3 条事件；按 plan 字面增加“前 5 轮 LLM 摘要”会增加调用成本，也无法在同步函数中直接安全执行。最终保留最近事件语义并增加 240 字单条限制和 800 字总预算。
- **使用 DeepSeek 自动前缀缓存：** DeepSeek 官方上下文缓存无需显式 `cache_control`。现有 system prompt 已将稳定人格/背景/决策内容放在动态记忆和世界状态之前，因此不修改 `prompt_templates.py`，并增加静态前缀回归测试。
- **Flash 模型与非思考模式并不冲突：** 模型仍为 `deepseek-v4-flash`；默认显式设置 `thinking=disabled`，使 Step 47 要求的 think 0.8、act 0.5 温度真实生效。开启思考模式时不发送会被忽略的 temperature。
- **供应商参数隔离：** `thinking` 只在官方 DeepSeek API 且模型名为 `deepseek-v4-*` 时发送；其他 OpenAI 兼容提供商继续仅接收通用参数。
- **按调用目的分级：** Persona、Remix、叙事和角色回复保持 think profile；GroupChat selector、目标判断和竞技裁判使用 act profile。这里的 think/act 是业务用途，不是 DeepSeek 思考模式。
- **局部拆分而非执行 38-S：** `engine.py` 已超过附录 B 的 300 行上限，本步仅把目标判断移动到 `goals.py`，不扩大为完整重构，不改变目标推进规则。
- **前端手写窗口化：** `ThoughtStream` 最多挂载 200 个气泡，以 100 条为步长查看旧记录；未引入 `react-window`，因此未修改 `package.json`、lockfile 或 pnpm 文件。
- **不隐藏包体积问题：** 未提高 Vite warning 阈值；以生产构建输出和磁盘实际字节同时验收 `<400 kB`。

## 接口变更

- 未新增或修改 REST API。
- 未修改数据库结构。
- 未修改 Phase 0 共享 Pydantic/TypeScript 类型。
- `create_model_client(profile="think")` 新增有默认值的内部 profile 参数，原调用方式兼容。
- `WorldEngine(..., act_model_client=None)` 新增有默认值的内部构造参数，原调用方式兼容。
- `LLM_THINKING_ENABLED` 是内部运行配置，不属于前后端共享接口。
- ⚠️ **BREAKING（流程回溯标记，不是公共 API 兼容性破坏）：** 本步修改了已完成步骤产出的配置、LLM 客户端、WorldEngine、World/Arena API 装配和 ThoughtStream。相关后端、前端测试已全量重跑；无调用方迁移、数据库迁移或共享类型迁移。

## 测试结果

- [x] Layer 1：Step 47 后端专项 10 项，覆盖 profile、DeepSeek 参数、上下文预算、路由与缓存前缀 — ✅
- [x] Layer 1：ThoughtStream 专项 5 项，覆盖 200/201/500 条边界和关键交互 — ✅
- [x] Layer 2：真 SQLite + Mock LLM 的 World、目标、GroupChat、Arena 与 API 回归 — ✅
- [x] 后端全量测试：281 passed，1 个既有 Starlette/httpx 弃用 warning — ✅
- [x] 前端全量测试：21 个测试文件、232 passed — ✅
- [x] TypeScript + Vite 生产构建：2498 modules transformed — ✅
- [x] 最大 JS chunk：Vite 报告 376.23 kB；磁盘实际 380,416 bytes，均小于 400 kB — ✅
- [x] `git diff --check`：无空白错误，仅 Windows LF/CRLF 提示 — ✅
- [x] 浏览器走查：页面无控制台 error、无明显布局遮挡或溢出 — ✅
- [x] CHECK-2：用户完成本地真实页面手动验收 — ✅
- [x] Layer 3：未执行输出质量测试；本步未修改 Persona/叙事质量，避免额外真实 API 消耗 — 按规则跳过

## 视觉走查

- [x] 群体沙盒设置页暗色主题和布局保持正常 — ✅
- [x] 普通思维流消息样式与点击交互保持兼容 — ✅
- [x] 浏览旧记录时不强制滚底，返回最新后恢复跟随 — ✅
- [x] 201/500 条窗口边界由组件自动化测试覆盖，无需为人工验收额外消耗 LLM — ✅

## 已知问题

- 项目根目录存在 `.env`，但当前 `Settings` 的 `env_file` 指向 `backend/.env`。新 PowerShell 未显式导入 `LLM_API_KEY` 时，启动 World 会返回 500 `Missing credentials`。本次人工验收已通过在后端进程中加载 Key 恢复；后续应统一 `.env` 读取位置，避免重启后复现。
- 后端全量测试仍有 1 个既有 Starlette/httpx 弃用 warning；前端仍有 React Router v7 future-flag 提示，均不影响本步功能。
- 上下文摘要采用当前架构适用的确定性限长，而非 plan 字面描述的额外 LLM 摘要；若未来恢复跨 tick 完整历史，应重新设计可持久化的增量摘要，而不是在每次构建 prompt 时重复调用 LLM。

## 对下一步的提示

- Step 48 已解锁，可直接编写 5 条端到端全链路测试。
- Step 48 启动真实后端前，应先统一根目录 `.env` 与 `Settings.env_file`，或确保启动进程已加载 `LLM_API_KEY`；否则会在 Agent/World 引擎首次构造时返回 500。
- 测试或新调用点应显式判断用途：生成内容使用 `create_model_client("think")`，选择、判断和评分使用 `create_model_client("act")`。
- 不要为 DeepSeek 增加整段响应缓存；官方前缀缓存自动生效，整段响应缓存可能让模拟重复旧回复。
- `ThoughtStream` store 仍最多保留 500 条，组件一次最多挂载 200 条；后续改动应同时保护这两个边界。
