# Step 58 — LLM Bench 批量评测调度 + 指标

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-27 |
| Phase | Phase 15.1 |
| Plan 章节 | [plan-state3.md](../plan-state3.md) §Step 58 |
| 状态 | ✅ done |

## 产出

### 后端

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/models/bench_orm.py` | **新建** | `BenchRun`（评测会话）+ `BenchResult`（单条记录）ORM |
| `backend/src/engines/bench/__init__.py` | **新建** | 包初始化 |
| `backend/src/engines/bench/metrics.py` | **新建** | 六维评分器（一致性/决策/交互/鲁棒/创造/适应）+ 聚合 + 归一化 |
| `backend/src/engines/bench/scheduler.py` | **新建** | 标准化套件（3 Agent × 3 场景 × 3 重复=27条）+ 6 并发 + BigFive 0-1 修正 |
| `backend/src/engines/bench/reporter.py` | **新建** | LLM 分析报告 + 规则兜底模板 |
| `backend/src/api/bench.py` | **新建** | CRUD + `test-api` 连通性检测 + `DELETE` |
| `backend/src/db.py` | 修改 | 注册 bench_orm |
| `backend/src/main.py` | 修改 | 注册 bench router |

### 前端

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/types/bench.ts` | **新建** | BenchRunSummary / BenchResultItem / BenchRunDetail |
| `frontend/src/api/bench.ts` | **新建** | useBenchRuns / useBenchRun / useCreateBenchRun / useDeleteBenchRun |
| `frontend/src/components/bench/HexagonChart.tsx` | **新建** | SVG 六边形雷达图 |
| `frontend/src/pages/BenchLab.tsx` | **新建** | `/bench` 页：配置→测连通→评测→六边形图+报告+详细表+删除 |
| `frontend/src/App.tsx` | 修改 | +`/bench` 路由 |
| `frontend/src/data/menuData.ts` | 修改 | +M10 section |
| `frontend/src/components/layout/Sidebar.tsx` | 修改 | +M10 图标 |
| `frontend/src/pages/Home.tsx` | 修改 | +M9/M10 快捷入口，5 列布局 |

## 关键决策

- **标准化套件**（非用户自由组合）：3 标准 Agent × 3 标准场景 × 3 重复 = 27 条，学术可复现
- **六维评测**：人格一致性 / 决策质量 / 交互深度 / 鲁棒性 / 创造力 / 适应性
- **API Key 安全**：评测完成/失败后立即清空 `bench_run.llm_api_key`
- **并发控制**：Semaphore(6) + asyncio.as_completed，每完成一条立即 commit（前端实时轮询）
- **分数格式**：`round(v, 1)`，整数不显示 `.0`

## Bug 修复记录

| Bug | 修复 |
|-----|------|
| BigFive 校验失败（0-100 → 需 0-1） | 模板值除以 100 |
| 评分全 "-" | AutoGen 事件提取兼容 v0.4/v0.7 |
| gather 导致进度不实时 | 改为 as_completed + 每 task commit |
| 浮点小数过长 | `_round_score` 取 1 位小数 + 整数去 `.0` |
| 默认 Base URL 含 `/v1` | 改为 `https://api.deepseek.com` |
| 无连通性检测 | `POST /api/bench/test-api` 前置检测 |
| M10 侧边栏不显示 | menuData 插入修复 |
| 首页无 M9/M10 入口 | Home.tsx 加卡片 + 5 列 |

## 测试结果

- [x] 后端 302/302 — ✅
- [x] 前端 232/232 — ✅
- [x] TypeScript 零错误 — ✅

## 已知问题

- 单次评测 ~3 分钟，无法进一步缩短（LLM 调用瓶颈）
- 聊天记录不存储（events_json 列预留但未写入）
