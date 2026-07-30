# Step T4 — Phase 15 Bug 修补

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-29 |
| Phase | Phase 15（Step 56–61） |
| Plan 章节 | [plan-state3.md](../plan-state3.md) §Step T4 |
| 状态 | ✅ done |

## 产出

### Bench 调度、指标与生命周期

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/engines/bench/scheduler.py` | 修改 | 全 tick 失败按失败落库并计入零分聚合；全任务失败时 Run 标记失败；修复期末周上下文插值 |
| `backend/src/engines/bench/metrics.py` | 修改 | 鲁棒性改为比较各任务其余五维综合分的跨任务变异 |
| `backend/src/engines/bench/recovery.py` | **新建** | 后端启动时将遗留 `running` 评测转为失败、清除 API Key并保留进度 |
| `backend/src/main.py` | 修改 | 数据库初始化后执行 Bench 中断恢复，再将应用标记为 ready |
| `backend/src/api/bench.py` | 修改 | 运行中评测拒绝删除并返回 HTTP 409 |

### Market 与前端体验

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/api/market.py` | 修改 | 下载前先验证原始 Team，失败下载不再增加计数 |
| `frontend/src/api/bench.ts` | 修改 | 仅存在运行中评测时每 3 秒轮询，空闲时停止轮询 |
| `frontend/src/pages/BenchLab.tsx` | 修改 | 运行中删除按钮禁用；启动成功后清空 API Key 输入框 |
| `requirements.txt` | 修改 | 显式登记 `pytest-timeout>=2.3` 测试依赖 |

### 测试与记录

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/tests/test_bench_recovery.py` | **新建** | 覆盖中断恢复、进度/子结果保留、Key 清除及应用启动接入 |
| `backend/tests/test_bench_scheduler.py` | 修改 | 覆盖全 tick 失败、Run 失败聚合、上下文插值；更新 AutoGen 标准 Mock |
| `backend/tests/test_bench_metrics.py` | 修改 | 覆盖鲁棒性稳定、高波动、全零和占位值隔离 |
| `backend/tests/test_bench_api.py` | 修改 | 覆盖运行中删除 409 与结束后删除 |
| `backend/tests/test_market_api.py` | 修改 | 覆盖失效 Team 下载失败不计数 |
| `backend/tests/test_sse.py` | 修改 | 覆盖不同 World 的 SSE 连接隔离 |
| `frontend/src/api/bench.test.tsx` | **新建** | 覆盖空闲停止轮询与运行中轮询 |
| `frontend/src/pages/bench/__tests__/BenchLab.test.tsx` | **新建** | 覆盖启动、错误反馈、Key 清除、删除状态、盲测和排行榜交互 |
| `docs/bugs.md` | 修改 | 登记并关闭 BUG-025～BUG-031 |
| `docs/plan-state3.md` | 修改 | 将 Bench 暂停、继续和断点续跑延期并写入 Step 69 |

## 决策记录

1. **全 tick 失败不能产生成功分数**：单条任务 8 个 tick 全部异常时保存六维零分和错误摘要；失败样本仍进入聚合，避免只统计成功样本造成虚高。
2. **鲁棒性使用跨任务实际表现**：不再聚合每条任务固定的鲁棒性占位值，改为比较其余五维综合分的变异系数；全零返回 0，单样本保留 85。
3. **运行中删除先拒绝而非伪取消**：当前 `BackgroundTasks` 没有可靠取消句柄。删除数据库记录会让后台任务继续调用 LLM，因此后端返回 409，前端同步禁用按钮。
4. **进程重启采用“明确失败”而非伪断点续跑**：现有任务列表和执行游标未持久化，自动续跑可能重复计分。应用启动时将遗留运行记录转为失败、保留进度和子结果并清除 API Key。
5. **暂停/继续延期至 Step 69**：真正的暂停恢复需要持久化队列、执行游标、幂等控制和安全的 Key 策略，不能在 T4 只增加前端按钮。
6. **空闲轮询由服务端状态驱动**：仅当列表中存在 `running` 记录时轮询，所有任务结束后自动停止。
7. **真实 LLM E2E 不重复消耗**：T3 已完成真实 DeepSeek 27/27 全链路；T4 使用 Mock LLM、真 SQLite、全量回归和人工验收验证修补行为。

## 接口变更

- 未修改 Phase 0 Pydantic/TS 共享类型，也没有数据库迁移。
- ⚠️ **BREAKING（Step 58 行为语义）**：`DELETE /api/bench/runs/{run_id}` 对 `running` 记录从允许删除改为 HTTP 409；`done` 和 `failed` 仍可删除。
- ⚠️ **BREAKING（Step 58 结果语义）**：全 tick 失败的 BenchResult 从可能成功计分改为 `failed + 六维零分`；27 条全部失败时 BenchRun 改为 `failed`。
- ⚠️ **BREAKING（Step 58 指标语义）**：聚合鲁棒性计算方式改变，历史和新评测的该维分数不可直接按旧算法横向比较。
- ⚠️ **BREAKING（Step 58 生命周期语义）**：应用启动时，旧进程遗留的 `running` BenchRun 会转为 `failed`，不会继续永久显示运行中。
- Step 56：修正 Market 下载计数提交顺序；响应结构不变。
- Step 60、61：Bench 页面交互与展示接口不变，仅增加安全清理和运行态保护。
- Step T3：修正 Bench scheduler 的成功 Mock，使其返回 AutoGen 标准 `CreateResult`；不改变生产接口。

## 测试结果

### T4 后端定向测试

```text
pytest test_bench_recovery.py test_bench_metrics.py test_bench_scheduler.py
       test_bench_api.py test_market_api.py test_sse.py --timeout=30
87 passed, 3 warnings
```

### 后端全量回归（排除真实 LLM E2E）

```text
pytest tests -q --timeout=30
       --ignore=tests/test_e2e_bench.py
       --ignore=tests/test_e2e_team.py
450 passed, 14 warnings
```

### 前端全量回归

```text
npm test
Test Files  30 passed (30)
Tests       292 passed (292)
```

### 静态检查与生产构建

```text
ruff check ...       All checks passed
npm run build        tsc + vite build passed
git diff --check     passed
```

## 验收标准

- [x] BUG-025：全 tick 失败不会伪装为成功
- [x] BUG-026：鲁棒性反映跨任务波动，不再近似恒为 100
- [x] BUG-027：运行中评测不能删除，结束记录仍可删除
- [x] BUG-028：Market 失败下载不增加计数
- [x] BUG-029：Bench 空闲时停止轮询
- [x] BUG-030：期末周上下文输出实际剩余座位
- [x] BUG-031：后端重启后的遗留评测可失败收口并清除 Key
- [x] 后端定向及全量非真实 LLM 回归通过
- [x] 前端全量测试、TypeScript 和生产构建通过
- [x] 人工验证：Bench 历史记录、删除入口、跨页面返回均正常

## 已知问题

- Bench 尚不支持暂停、继续或真正的断点续跑，已纳入 Step 69 的持久化任务控制。
- 当前启动恢复策略面向项目既定的单机单进程部署；未来采用多 Worker 时，需要增加任务租约或 Worker 所有权，不能由每个 Worker 将所有 `running` 记录直接判失败。
- 后端仍有既有的 Starlette/Pydantic 弃用警告和同步测试误用 `pytest.mark.asyncio` 的警告，不影响本步功能。
- `GameScene` 生产分块约 1.51 MB，仍有 Vite 大分块警告，属于 Phase 16/后续性能打磨范围。

## 对下一步的提示

- Step 69 实现持久化任务控制时，应复用本步中断语义，并补齐 `running / paused / failed / done` 状态机、执行游标、幂等恢复和 API Key 安全策略。
- Step T5/T6 主要验证 Phase 16 游戏场景，不应回退本步 Bench 与 World SSE 隔离行为。
- Step 73 全项目 Bug 清零时，应复查 BUG-025～BUG-031，并确认没有新的僵尸 BenchRun。
