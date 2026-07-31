# Step T5 — Phase 16 性能 + E2E

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-31 |
| Phase | Phase 16（Step 62–66、66-S、66-A） |
| Plan 章节 | [plan-state3.md](../plan-state3.md) §附录 B / Step T5 |
| 状态 | ✅ done（测试完成，缺陷转交 T6） |

## 产出

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/game/scene-data.test.ts` | 新建 | 校验六个场景 JSON 的尺寸、坐标边界及物品 ID 唯一性 |
| `frontend/src/components/scene/scene-components.test.tsx` | 新建 | 覆盖 Checkpoint 面板和音频控制组件的关键交互与清理 |
| `frontend/src/game/audio/voiceProfiles.test.ts` | 新建 | 覆盖稳定声线与情绪参数映射 |
| `frontend/src/game/audio/AgentVoiceEngine.test.ts` | 新建 | 覆盖静音播放、暂停恢复和资源释放 |
| `frontend/src/game/audio/DialoguePlaybackQueue.test.ts` | 新建 | 覆盖分页、严格串行、暂停恢复和队列清理 |
| `backend/tests/test_scene_engine.py` | 新建 | 覆盖场景状态、Checkpoint 数量限制和数据隔离 |
| `backend/tests/test_scenes_api.py` | 新建 | 覆盖场景状态与 Checkpoint API 全链路及错误路径 |
| `docs/bugs.md` | 修改 | 登记 BUG-032～BUG-038，交由 T6 修复 |
| `docs/done/README.md` | 修改 | 将 T5 标记完成并链接本文档 |

## 决策记录

1. **T5 只测试和登记缺陷**：本步不修改 Phase 16 生产代码，所有确认缺陷集中交给 T6，避免测试阶段夹带实现。
2. **Checkpoint 替代时间轴回溯验收**：Step 65 已将原计划的逐 tick 时间轴调整为手动存档/加载；T5 按当前已批准产品边界验证 Checkpoint。
3. **不新增浏览器测试依赖**：复用 Vitest、Testing Library、pytest 和浏览器手测，不修改 `package.json` 或锁文件。
4. **真实 LLM 仅用于人工场景观察**：自动化测试使用 Mock；浏览器 E2E 使用当前本地 DeepSeek 配置产生少量真实调用。
5. **帧率采用定性走查补充**：当前应用内浏览器环境无法取得 `requestAnimationFrame` 精确采样，六场景 5 Agent 完成可用性走查；精确 ≥30fps 仍需后续性能工具复核。

## 接口变更

- 无。
- 未修改 Phase 0 Pydantic/TS 共享类型。
- 未修改生产 API、数据库结构或已完成步骤的生产文件。

## 自动化测试结果

### 前端定向测试

```text
35 tests：32 passed，3 failed
```

失败项均已登记：

- BUG-032：静音拟声 Promise 提前完成。
- BUG-033：暂停恢复可能启动下一条消息。
- BUG-034：`visibilitychange` 监听器未清理。

### 前端全量回归

```text
322 tests：319 passed，3 failed
npm run build：通过
```

生产构建存在既有大分块提示：`GameScene` 懒加载分块约 1.54 MB；不阻断构建，但仍是性能优化项。

### 后端定向测试

```text
12 tests：11 passed，1 failed
```

失败项为 BUG-035：Checkpoint 删除缺少场景归属校验。

### 后端全量回归

```text
排除 test_e2e_bench.py：
462 passed，2 failed，14 warnings
```

- 1 项为本步 BUG-035。
- 1 项为既有真实 LLM Team E2E 输出数量不稳定，与 Phase 16 无关。
- 未排除的 `test_e2e_bench.py` 会调用真实 DeepSeek，耗时较长，不属于 Mock 独立回归。

## 浏览器 E2E 与人工验收

- [x] `library / dorm / classroom / art / lab / sakura` 六个场景均可加载
- [x] 每个场景可投放 5 个 Agent
- [x] 1280px 视口无横向溢出
- [x] 删除 Agent 后加载 Checkpoint 可恢复人物
- [x] 六场景切换过程无浏览器错误日志
- [ ] 切换场景后自动对话继续工作 — BUG-036
- [ ] 耳语能够影响目标 Agent 并给出反馈 — BUG-037
- [ ] Checkpoint 恢复已有 Agent 坐标 — BUG-038
- [ ] 对话拟声暂停/恢复严格串行 — BUG-032、BUG-033
- [ ] 音频组件卸载无监听器残留 — BUG-034
- [ ] 精确测得 5 Agent Canvas ≥30fps — 当前仅完成定性走查

## 已知问题

- BUG-032～BUG-038 均未在 T5 修复，详见 `docs/bugs.md`。
- `GameScene` 懒加载分块较大，Vite 仍提示超过 500 kB。
- 后端存在 Pydantic/Starlette 弃用警告；不影响本步场景功能。

## 对下一步的提示

- T6 应逐个修复 BUG-032～BUG-038，并在每个修复后先跑定向测试。
- Checkpoint 坐标恢复必须使用显式“读档”通道，不能取消普通状态同步对实时坐标的保护。
- 耳语需要明确产品边界：至少提供接收反馈并进入 Agent 临时指令上下文；行动指令还需要目标解析、执行状态和超时反馈。
- 切换场景后应重启对话扫描器，同时清理旧会话、计时器和音频资源。
- T6 完成后重跑前后端全量非真实 LLM 回归、生产构建及六场景人工验收。
