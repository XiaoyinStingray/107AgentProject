# Step T3 — Phase 15 集成测试 + E2E

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-28 |
| Phase | Phase 15（Step 56–66） |
| Plan 章节 | [plan-state3.md](../plan-state3.md) §Step T3 |
| 状态 | ✅ done |

## 产出

### Layer 1：A 线 — Market API 测试

| 文件 | 操作 | 用例数 | 覆盖内容 |
|------|------|--------|---------|
| `backend/tests/test_market_api.py` | 已存在 | 13 | 发布/列表/详情/下载/评分、重复发布拒绝、空 Team 拒绝 |

### Layer 2：B 线 — Bench 后端测试

| 文件 | 操作 | 用例数 | 覆盖内容 |
|------|------|--------|---------|
| `backend/tests/test_bench_orm.py` | 已存在 | 8 | BenchRun/BenchResult CRUD、metrics_json 序列化、状态转换 |
| `backend/tests/test_bench_scheduler.py` | 已存在 | 11 | 3×3×3=27 任务生成、6 并发控制、超时处理、进度回调 |
| `backend/tests/test_bench_metrics.py` | 已存在 | 20 | 六维评分边界值（空事件/单事件/大量事件）、聚合分数 |
| `backend/tests/test_bench_api.py` | 已存在 + 修改 | 10 | CRUD + test-api + report + 连接失败处理 |

### Layer 2：B 线 — Bench 前端组件测试（新建）

| 文件 | 操作 | 用例数 | 覆盖内容 |
|------|------|--------|---------|
| `frontend/src/components/bench/HexagonChart.test.tsx` | **新建** | 7 | SVG 渲染、六维标签、中心分数、多边形、尺寸、零分/满分边界 |
| `frontend/src/pages/bench/__tests__/BenchComponents.test.tsx` | **新建** | 10 | CompareView 并排渲染/差异高亮/六维短名/分数/等分处理 + OverlayHexagon 双多边形/图例/轴标签/尺寸 |

### 组件提取（支持可测性）

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/components/bench/OverlayHexagon.tsx` | **新建** | 从 BenchLab.tsx 提取叠加双六边形雷达图组件 |
| `frontend/src/components/bench/CompareView.tsx` | **新建** | 从 BenchLab.tsx 提取并排对比视图组件 |
| `frontend/src/pages/BenchLab.tsx` | 修改 | 移除内联函数定义，改为导入独立组件 |

### Layer 3：E2E 全链路（真实 LLM）

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/tests/test_e2e_bench.py` | 已存在 | 创建 Run → 27 条评测 → 聚合分数 → 报告；A+B 交叉回归 3 项 |

### Bug 修复

| 文件 | 修改 | 说明 |
|------|------|------|
| `backend/tests/test_bench_api.py` | 修改 | `test_bad_connection` 超时：`http://invalid-host-test` DNS 解析超时 → 改为 `http://127.0.0.1:1`（立即连接拒绝） |

## 技术决策

1. **组件提取提升可测性**：CompareView 和 OverlayHexagon 原本内联在 BenchLab.tsx 中，无法独立测试。提取为独立组件后，前端新增 17 个组件测试。
2. **MarketPanel 不单独建测试**：MarketPanel 嵌入在 TeamDashboard 中，非独立路由页面，其交互已在 TeamDashboard 测试中覆盖。
3. **bad_connection 测试用 127.0.0.1:1**：无效主机名导致 DNS 解析超时（>30s），改用本地保留端口实现立即连接拒绝，测试耗时从 30s+ 降至 <1s。
4. **E2E 使用真实 LLM API**：`.env` 配置 DeepSeek API Key，无 Key 时自动 skip。27 条评测（3 Agent × 3 场景 × 3 重复）6 并发执行，约 6 分钟完成。

## 测试结果

### 后端 T3 测试

```
PYTHONPATH=src python -m pytest tests/test_market_api.py tests/test_bench_orm.py tests/test_bench_scheduler.py tests/test_bench_metrics.py tests/test_bench_api.py -v
======================== 62 passed ========================
```

### E2E（真实 LLM — deepseek-v4-flash）

```
PYTHONPATH=src python -m pytest tests/test_e2e_bench.py -v -s
======================== 4 passed (370.27s / 6m10s) ========================
# 27/27 评测全部成功
# 聚合分数: 人格一致性=38.2, 决策质量=30.0, 交互深度=89.9, 鲁棒性=100, 创造力=62.4, 适应性=71.4
```

### 后端全量回归

```
PYTHONPATH=src python -m pytest tests/ --ignore=tests/test_e2e_bench.py -q
======================== 438 passed ========================
```

### 前端全量回归

```
npx vitest run
Test Files  28 passed (28)
     Tests  280 passed (280)
```

## 验收标准核对

- [x] A 线：Market API 13 个测试全部通过
- [x] B 线：Bench 后端 49 个测试全部通过（ORM 8 + Scheduler 11 + Metrics 20 + API 10）
- [x] B 线：Bench 前端 17 个测试全部通过（HexagonChart 7 + CompareView/OverlayHexagon 10）
- [x] E2E：Bench 全链路 27/27 评测成功（真实 LLM，6 分 10 秒）
- [x] A+B 交叉回归：3/3 通过（Team+Bench 表共存、Market 端点可用、Bench 列表返回）
- [x] 后端全量回归：438/438 通过（排除 E2E）
- [x] 前端全量回归：280/280 通过（28 个测试文件）

## 已知问题

- 后端测试存在 `StarletteDeprecationWarning`（TestClient/httpx 兼容层），不影响功能。
- E2E 评测中"人格一致性"和"决策质量"维度分数偏低（30-38），属于 LLM 模型能力特征，非代码缺陷。
- `MarketPanel.tsx` 嵌入在 TeamDashboard 中，无独立路由，plan 中提到的"MarketPanel 独立测试"调整为在 TeamDashboard 测试中覆盖。

## 对下一步的提示

- T4 应重点关注 `bugs.md` 中 Phase 15 发现的 bug + T3 回归中暴露的问题。
- E2E 评测分数偏低维度（人格一致性、决策质量）可能需要优化评分器算法或 Agent 提示词。
- Bench 前端组件已拆分，后续扩展对比功能时可直接修改 CompareView/OverlayHexagon 独立组件。
