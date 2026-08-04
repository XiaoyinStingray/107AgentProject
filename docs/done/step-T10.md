# Step T10 — Phase 23 测试

| 字段 | 值 |
|------|-----|
| 日期 | 2026-08-04 |
| Phase | Phase 23: Worker 核心 |
| Plan 章节 | [plan-state5.md](../plan-state5.md) §Step T10 |
| 状态 | ✅ done |

## 产出

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/tests/worker/test_sandbox.py` | 修改 | asyncio 兼容性修复：`get_event_loop().run_until_complete()` → `asyncio.run()`（Python 3.14） |
| `backend/tests/worker/test_workspace.py` | 修改 | 同上 asyncio 兼容性修复 |
| `backend/tests/worker/test_tools.py` | 修改 | asyncio 修复 + TOOL_REGISTRY 断言 5→6（install_package）+ MockWorkspace 补充 `list_snapshots` |
| `backend/tests/worker/test_state_machine.py` | 修改 | `_safe_json_parse` 从复制副本改为直接 `from engines.worker.engine import _safe_json_parse` |
| `backend/tests/worker/test_engine.py` | **新建** | AgentWorker 引擎测试 16 个：状态机全路径（4）、LLM 调用（3）、决策解析（3）、文件锁（2）、SSE 事件（2）、MAX_STEPS 终止（2） |
| `backend/tests/worker/test_e2e_worker.py` | **新建** | E2E 全链路测试 6 个：完整决策循环（2）、SSE 事件完整性（2）、工具错误恢复（1）、状态机路径验证（1） |

## 决策记录

- **决策 1：** Python 3.14 中 `asyncio.get_event_loop()` 不再自动创建事件循环，统一使用 `_run(coro)` 辅助函数封装 `asyncio.run()`，替代所有 `get_event_loop().run_until_complete()` 调用。
- **决策 2：** `test_state_machine.py` 中 `_safe_json_parse` 原先是复制副本，改为直接从 `engines.worker.engine` 导入，确保测试的是真实实现。
- **决策 3：** `TOOL_REGISTRY` 断言从 5 个工具更新为 6 个（Step 100 新增 `install_package`），MockWorkspace 补充 `list_snapshots` 方法以匹配 `write_file_handler` 的调用。
- **决策 4：** E2E 测试使用 Mock LLM（非真实网络），通过预设响应序列验证完整决策链路。真实 LLM 测试标记为 `@pytest.mark.e2e_worker`，需手动运行。
- **决策 5：** `test_engine.py` 不依赖 AutoGen 真实实例，通过 `unittest.mock.patch` mock `LifeAgent` 和 `WorkspaceProvider`，实现纯单元测试。

## 接口变更

- 无。本步只修改/新增测试文件，不修改任何源代码。

## 测试结果

### T10 Worker 测试文件（105 passed）

| 测试文件 | 测试数 | 状态 |
|---|---|---|
| `test_sandbox.py` | 15 | ✅ 全通过（修复 asyncio） |
| `test_state_machine.py` | 35 | ✅ 全通过（导入替代复制） |
| `test_tools.py` | 19 | ✅ 全通过（asyncio + 工具数 + MockWorkspace） |
| `test_workspace.py` | 14 | ✅ 全通过（修复 asyncio） |
| `test_engine.py` | **16 新增** | ✅ 全通过（引擎状态机 + JSON 解析 + 文件锁） |
| `test_e2e_worker.py` | **6 新增** | ✅ 全通过（E2E 全链路 + SSE 完整性） |

### 全量回归

| 范围 | 结果 |
|---|---|
| Worker 测试 | 105 passed, 0 failed |
| Worker + Fingerprint + Memory | 146 passed, 0 failed |

### Plan 验收标准

- [x] AgentWorker 状态机 6 状态全路径覆盖 — ✅ `test_engine.py` 覆盖 IDLE→PLANNING→DECIDING→EXECUTING→REFLECTING→DONE 全路径
- [x] JSON 解析容错 — ✅ 5 个 JSON 解析测试（干净 JSON / Markdown 包裹 / 前后文字 / 空输入 / 多对象）
- [x] MAX_STEPS 强制终止 — ✅ 测试验证超过 MAX_STEPS 后自动终止并进入 DONE 状态
- [x] 5+ 个工具正常/异常输入 — ✅ `test_tools.py` 覆盖 6 个工具的正常路径 + 异常路径（空路径、不存在文件等）
- [x] WorkspaceProvider mock — ✅ MockWorkspace 实现 WorkspaceProvider 全部抽象方法
- [x] E2E 全链路 — ✅ `test_e2e_worker.py` 覆盖 任务→计划→工具调用→写文件→反思→完成

## 已知问题

- 无。T10 修复了 T9 遗留的 26 个 worker 测试失败，全部清零。

## 对下一步的提示

- Phase 23 测试完全通过，Phase 23（Step 88-90 + T10）可标记为完全完成。
- State 5 的 Phase 22-26 开发线均已完成，T10 是 State 5 首个通过的测试步骤。
- T11（Phase 24 测试）和 T12（Phase 25 测试）可参照 T10 的模式继续。
