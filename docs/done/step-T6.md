# Step T6 — Phase 16 Bug 修补

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-31 |
| Phase | Phase 16（Step 62–66、66-S、66-A） |
| Plan 章节 | [plan-state3.md](../plan-state3.md) §附录 B / Step T6 |
| 状态 | 🚧 in-progress（代码已提交，BUG-042/043 待人工复测） |

## 产出

### 音频、Checkpoint 与场景生命周期

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/game/audio/AgentVoiceEngine.ts` | 修改 | 静音拟声等待完整播放周期 |
| `frontend/src/game/audio/DialoguePlaybackQueue.ts` | 修改 | 暂停恢复保持单消费者，切图/卸载时清理队列 |
| `frontend/src/components/scene/AudioControls.tsx` | 修改 | 正确注册并移除页面可见性监听器 |
| `frontend/src/components/scene/CheckpointPanel.tsx` | 修改 | 仅暂停状态开放存档操作 |
| `frontend/src/game/scenePause.ts` | 新建 | 统一前端、后端和播放队列的暂停/继续顺序 |
| `backend/src/api/scenes.py` | 修改 | Checkpoint 按 `id + scene_id` 隔离；场景启动兼容 WorldRow 结构 |
| `backend/src/models/checkpoint_orm.py` | 修改 | 补齐 Checkpoint 场景归属约束 |
| `backend/src/engines/scene/engine.py` | 修改 | 场景状态、身份和对话行为修正 |

### 耳语、Brain 与移动可靠性

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/engines/world/instructions.py` | 新建 | 一次性私密指令及明确目标路由 |
| `backend/src/engines/world/engine.py` | 修改 | 在 tick 边界注入耳语上下文和优先 speaker 路由 |
| `backend/src/engines/world/state.py` | 修改 | 接收定向 `agent_action` 并触发高优先级执行 |
| `backend/src/engines/world/streaming.py` | 修改 | 普通 tick 可被优先耳语安全抢占 |
| `backend/src/engines/world/messages.py` | 修改 | 身份约束、工具事件和可见消息转换 |
| `frontend/src/game/sceneBrain.ts` | 新建 | Brain 连接监测及耳语排队/执行/回应/超时反馈 |
| `frontend/src/game/whisper.ts` | 新建后扩展 | 目标解析、靠近格选择、移动意图和私密上下文 |
| `frontend/src/game/AutonomousMover.ts` | 修改 | 本地与 SSE 移动统一使用场景级目的地预占 |
| `frontend/src/game/scenes/MapScene.ts` | 修改 | 恢复坐标、耳语执行、移动预占、重复坐标纠正及会话清理 |
| `frontend/src/pages/GameScene.tsx` | 修改 | Brain/本地耳语统一分流；纯移动指令不再误入对话链路 |

### 测试与记录

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/tests/test_scene_engine.py` | 修改 | 场景状态与身份回归 |
| `backend/tests/test_scenes_api.py` | 修改 | Checkpoint 场景隔离和启动 API 回归 |
| `backend/tests/test_world_engine_runtime.py` | 修改 | 私密指令注入、优先路由和抢占回归 |
| `frontend/src/game/AutonomousMover.test.ts` | 新建 | 目标格授权、拒绝及释放测试 |
| `frontend/src/game/scenes/MapScene.test.ts` | 新建后扩展 | 生命周期、读档、耳语、移动和碰撞边界 |
| `frontend/src/game/whisper.test.ts` | 新建后扩展 | 社交目标与移动意图区分 |
| `frontend/src/game/sceneBrain.test.ts` | 新建后扩展 | Brain 连接和耳语状态反馈 |
| `frontend/src/game/scenePause.test.ts` | 新建 | 暂停/继续时序测试 |
| `frontend/src/game/audio/DialoguePlaybackQueue.test.ts` | 修改 | 串行、暂停恢复和资源清理回归 |
| `frontend/src/components/scene/scene-components.test.tsx` | 修改 | 音频监听器与 Checkpoint 交互回归 |
| `docs/bugs.md` | 修改 | 关闭 BUG-032～038，登记 BUG-042/043 的待人工复测状态 |

## 决策记录

1. **耳语分为社交、移动和自由行动**：明确的 A→B 对话由 Brain 注入身份和目标；“移动到 B 旁边”由场景确定坐标，不让 LLM 猜格子。
2. **高优先级耳语可抢占普通 tick**：只终止当前普通生成，下一 tick 在私密上下文生效；避免耳语等待完整群聊结束。
3. **移动冲突使用目标格预占**：占用检测只能看到已落地坐标，无法阻止同帧竞争；预占覆盖本地移动、SSE 和对话退场。
4. **Checkpoint 使用显式恢复通道**：普通 React 同步仍不覆盖实时坐标，只有用户加载存档时强制还原。
5. **不进行完整 M11 文件拆分**：本步只做可靠性修补，避免扩大为计划外重构；超长 `MapScene.ts` 留给后续专门重构。
6. **不增加前端依赖**：没有修改 `package.json` 或锁文件。

## 接口变更

- 未修改 Phase 0 Pydantic/TS 共享类型，也没有新增依赖。
- `POST /api/worlds/{id}/inject` 的请求结构不变；定向 `agent_action` 增加一次性私密指令语义。
- ⚠️ **BREAKING（Step 63b 行为语义）**：错误场景路径删除 Checkpoint 现在返回 404，不再误删其他场景数据。
- ⚠️ **BREAKING（Step 64b 行为语义）**：耳语由视觉提示升级为真实一次性指令；社交耳语和移动耳语会产生可观察行为。
- ⚠️ **BREAKING（Step 65 恢复语义）**：加载 Checkpoint 会强制覆盖已有 Agent 的实时坐标和动作，这是读档入口的预期行为。
- ⚠️ **BREAKING（Step 66-A 播放语义）**：暂停恢复和静音拟声严格等待当前任务完成，不再允许下一条提前消费。

## 测试结果

### 本轮定向回归

```text
M11 前端相关：45 passed
碰撞核心：24 passed
后端 Scene/World 定向：36 passed，2 warnings
git diff --check：passed
```

### 前端全量与构建

```text
前端全量：351 passed，7 failed
npm run build：failed（6 个既有 State 5 Worker/Pipeline TypeScript 错误）
```

失败基线与本步无关：

- `narrative-components.test.tsx` 的 7 项测试缺少 Router，`useLocation()` 报错。
- `WorkerTerminal.tsx` 有 2 个 `unknown → ReactNode` 错误。
- `PipelinePage.tsx` 有 4 个 `PipelineDef.filter / implicit any` 错误。

### 验收标准

- [x] BUG-032：静音拟声等待完整周期
- [x] BUG-033：暂停恢复不会启动第二个队列消费者
- [x] BUG-034：音频组件卸载清理监听器
- [x] BUG-035：Checkpoint 删除校验场景归属
- [x] BUG-036：切换场景后重新启动自动对话扫描
- [x] BUG-037：耳语有接收、执行、回应或超时反馈 — 人工验收通过
- [x] BUG-038：Checkpoint 恢复已有 Agent 坐标 — 人工验收通过
- [ ] BUG-042：6 Agent 长时间移动无同格重叠 — 自动化及浏览器观察通过，待用户最终复测
- [ ] BUG-043：“移动到某人旁边”产生可见移动 — 自动化通过，待用户最终复测

## 组件树

```text
GameScenePage
├── GameCanvas
│   └── MapScene
│       ├── AgentSprite × N
│       ├── AutonomousMover × N
│       ├── MovementReservation
│       └── DialoguePlaybackQueue
├── AgentPanel
│   └── Whisper input
├── AudioControls
├── CheckpointPanel
└── BrainWhisperTracker
    └── WorldEngine instruction route
```

## 视觉走查

- [x] 暗色主题一致 — 本步未改变视觉 Token
- [x] 动画流畅 — 6 Agent 浏览器观察未见同格重叠或控制台错误
- [x] Mock 模式可独立运行 — Brain OFF 的说话/移动耳语均有本地路径
- [ ] BUG-042/043 最终人工复测 — 明日继续

## 已知问题

- BUG-042/043 尚缺用户最终手测，因此 T6 不能标记 `done`。
- 前端全量测试和生产构建受 State 5 新合入的 Narrative/Worker/Pipeline 基线问题阻断；本步未越权修改对应模块。
- `MapScene.ts` 仍超过 300 行；这是既有 Phase 16 聚合文件，后续应在独立重构步骤拆分移动、耳语和会话协调器。
- 轻量拟声不朗读真实文字；全模态与 TTS 仍不在本步范围。

## 对下一步的提示

- 明日先复测 BUG-042/043：分别验证 Brain OFF/ON、暂停排队、已相邻和目标旁无空位。
- 人工通过后将本文状态改为 `✅ done`，更新索引和 Phase 16 状态，再提交最终 T6 收口记录。
- 后续优化应先新增 bugs/设计记录，不要继续向 `MapScene.ts` 堆叠大段逻辑。
