# Step T1 — Phase 14 单元测试 + 集成测试 + E2E

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-28 |
| Phase | Phase 14（Step 51–55） |
| Plan 章节 | [plan-state3.md](../plan-state3.md) §Step T1 |
| 状态 | ✅ done |

## 产出

### 补建缺失模块（Step 54 / 55 应建未建）

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/engines/team/diagnostics.py` | **新建** | DiagnosticsEngine：沉默告警（≥5 tick）、参与度评分、冲突检测、summary 汇总 |
| `backend/src/engines/team/report.py` | **新建** | generate_report()：LLM 优先 + `_rule_based_report()` 兜底，返回结构化 JSON 报告 |

### Layer 1：后端单元 / 集成测试

| 文件 | 操作 | 用例数 | 覆盖内容 |
|------|------|--------|---------|
| `backend/tests/test_team_orm.py` | **新建** | 8 | TeamRow/PlanRow CRUD、JSON 序列化、状态转换 |
| `backend/tests/test_team_decomposer.py` | **新建** | 6 | Mock LLM 分解、规则兜底、空 Agent、无效响应、标题截断 |
| `backend/tests/test_team_planner.py` | **新建** | 9 | Plan 生命周期、依赖检查、LLM YES/DRIFT 判定、事件回调 |
| `backend/tests/test_team_diagnostics.py` | **新建** | 9 | 沉默告警阈值、参与度分布、冲突检测、summary 结构 |
| `backend/tests/test_team_report.py` | **新建** | 12 | LLM 报告、规则兜底、Markdown 验证、空事件、决策提取 |

### Layer 2：前端组件测试

| 文件 | 操作 | 用例数 | 覆盖内容 |
|------|------|--------|---------|
| `frontend/src/pages/team/__tests__/TeamComponents.test.tsx` | **新建** | 17 | TaskKanban 三列/进度/协调器、LiveChat 连接/消息/过滤、HealthPanel 进度/步骤/报告 |
| `frontend/src/pages/team/__tests__/TeamDashboard.test.tsx` | **新建** | 7 | 页面标题、Team 列表、成员名、创建/模板按钮、状态 Badge、执行按钮 |

### Layer 3：E2E 全链路

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/tests/test_e2e_team.py` | **新建** | 创建 3 Agent → 组队 → 角色推荐 → 真实 LLM 执行 → 验证 Plan ≥3 子任务 → 状态流转 |

## 技术决策

1. **E2E 使用真实 LLM API**：用户明确要求不使用 Mock 数据，`.env` 中配置 API Key，无 Key 时自动 skip。
2. **pytest-asyncio strict mode**：所有 async 测试文件添加 `pytestmark = pytest.mark.asyncio`，async fixture 使用 `@pytest_asyncio.fixture`。
3. **jsdom scrollIntoView mock**：LiveChat 测试在 `beforeAll` 中 mock `Element.prototype.scrollIntoView`，因 jsdom 不支持此 API。
4. **报告引擎双路径**：LLM 可用时生成结构化 JSON 报告，不可用时 `_rule_based_report()` 从事件流提取统计信息兜底。
5. **DiagnosticsEngine 纯规则**：不依赖 LLM，基于事件流做沉默检测（≥5 tick 阈值）、参与度计算、冲突检测。

## 测试结果

### 后端

```
PYTHONPATH=src python -m pytest tests/ -v
======================== 360 passed ========================
```

### E2E（真实 LLM）

```
PYTHONPATH=src python -m pytest tests/test_e2e_team.py -v
======================== 1 passed (33.92s) ========================
# 任务分解出 6 个子任务，Plan 状态 executing → finished
```

### 前端

```
npx vitest run
Test Files  26 passed (26)
     Tests  263 passed (263)
```

## 验收标准核对

- [x] 每个 `backend/src/engines/team/*.py` 有对应的 `tests/test_team_*.py`
- [x] 每个新建前端组件有 ≥2 个 happy-path 测试（TaskKanban 6 + LiveChat 6 + HealthPanel 5 + TeamDashboard 7）
- [x] E2E 全链路通过（真实 LLM API）
- [x] 回归测试：后端 360/360 全量通过、前端 263/263 全量通过
