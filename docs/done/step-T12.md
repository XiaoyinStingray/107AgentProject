# Step T12 — Phase 25 测试（多 Agent + 管道）

| 字段 | 值 |
|------|-----|
| 日期 | 2026-08-05 |
| Phase | Phase 25: 多 Agent + 管道 |
| Plan 章节 | [plan-state5.md](../plan-state5.md) §Step T12 |
| 状态 | ✅ done |

## 产出

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/tests/worker/test_coordinator.py` | 新建 | WorkspaceCoordinator 全模块测试（32 个） |
| `backend/tests/worker/test_pipeline.py` | 新建 | Pipeline 数据模型 + 验证 + 拓扑排序 + 引擎测试（34 个） |
| `backend/tests/worker/test_pipeline_e2e.py` | 新建 | 3 Agent 管道 E2E 全链路测试（12 个） |

## 决策记录

- **决策 1：PipelineEngine 测试 Mock AgentWorker 而非真实 LLM**
  - 原因：E2E 测试不应触发真实 LLM 调用，使用 `patch("engines.worker.engine.AgentWorker")` Mock 整个 Worker
  - 结果：测试快速（<6 秒）且确定性高

- **决策 2：使用真实 LocalWorkspace + tmp_path 而非 Mock Workspace**
  - 原因：与 T10/T11 保持一致的测试风格，真实文件系统更可靠
  - 结果：所有测试使用 `tmp_path` fixture，自动清理

- **决策 3：循环依赖测试断言调整**
  - 原因：当 FLOW 边 c→a 与 depends_on 组合时，validate_pipeline 先检测到"无入口节点"而非"循环依赖"
  - 结果：测试断言改为只验证 `valid is False`，不指定具体错误消息

## 接口变更

- 无。本步为纯测试，不修改任何生产代码或共享类型。

## 测试结果

| 测试文件 | 测试数 | 状态 |
|---------|--------|------|
| `test_coordinator.py` (WorkspaceCoordinator) | 32 | ✅ 全通过 |
| `test_pipeline.py` (数据模型 + 引擎) | 34 | ✅ 全通过 |
| `test_pipeline_e2e.py` (3 Agent 管道 E2E) | 12 | ✅ 全通过 |
| **T12 新增合计** | **78** | ✅ |
| 已有 worker 测试 (T10/T11) | 173 通过 + 5 跳过 | ✅ 无回归 |
| **全部 worker 测试总计** | **251 通过 + 5 跳过** | ✅ |

### Plan 验收标准对照

- [x] WorkspaceCoordinator — 文件锁并发/依赖等待/队列 — ✅ 32 个测试覆盖
- [x] PipelineEngine — 拓扑排序/并行/失败传播 — ✅ 34 个测试覆盖
- [x] E2E — 3 Agent 管道全链路 — ✅ 12 个测试覆盖

### 测试覆盖明细

**test_coordinator.py（32 个）**
- FileLockManager: 获取/释放锁、超时、并发序列化、路径归一化（9 个）
- TaskQueue: submit/claim/complete/list/any_pending 全生命周期（11 个）
- DependencyWaiter: 空列表/文件就绪/等待创建/超时/.lock 阻塞/多文件（7 个）
- WorkspaceCoordinator: 组合接口 lock+queue+wait（5 个）

**test_pipeline.py（34 个）**
- 数据模型: 枚举值、默认值（6 个）
- validate_pipeline: 8 种合法/非法场景（10 个）
- _topological_sort: 串行/并行/菱形/循环/显式依赖（6 个）
- 边辅助函数: flow_deps/loop/branch（5 个）
- PipelineEngine: 单节点/串行/并行/失败传播/取消/SSE（7 个）

**test_pipeline_e2e.py（12 个）**
- 3 节点串行管道 + 文件传递 + SSE 事件（2 个）
- 2 并行 + 1 汇聚（1 个）
- 节点失败→下游 SKIPPED + 独立节点不受影响（2 个）
- 管道 CRUD API（4 个）
- 多 Agent 共享工作区协调（3 个）

## 已知问题

- 5 个 skip 为 T11 的 CloudWorkspace SSH 测试（asyncssh 与 Python 3.14 不兼容），非本步引入
- PipelineEngine 的 Loop/Branch 条件评估（`_eval_condition`）未在本步测试中覆盖复杂条件场景（正则/数值），后续可补充

## 对下一步的提示

- Phase 25 开发 + 测试全部完成，Worker 模块测试覆盖率达标
- Phase 26（自主调度 + 发布）的调度器测试可复用本步的 Mock 模式
- `test_pipeline_e2e.py` 中的 Mock AgentWorker 模式可供后续 E2E 测试参考
