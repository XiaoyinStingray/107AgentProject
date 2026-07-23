# Step 34-S — 场景自定义

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-23 |
| Phase | Phase 10.6.6 |
| Plan 章节 | [plan-state2.md](../plan-state2.md) §Step 34-S |
| 状态 | ✅ done |

## 产出

### 后端

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/api/scenarios.py` | **新建** | `GET /api/scenarios`（内置+自定义）、`POST /api/scenarios`（创建）、`DELETE /api/scenarios/{id}`（仅自定义） |
| `backend/src/models/world.py` | 修改 | `Scenario` 模型新增可选 `id` 字段（内置无 id，自定义有） |
| `backend/src/main.py` | 修改 | 注册 `scenarios_router` |

### 前端

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/api/scenarios.ts` | **新建** | `useScenarios()`、`useCreateScenario()`、`useDeleteScenario()` |
| `frontend/src/api/queryKeys.ts` | 修改 | +`scenarioKeys` |
| `frontend/src/types/world.ts` | 修改 | `Scenario` 类型 +`id` 可选字段 |
| `frontend/src/components/world/ScenarioEditor.tsx` | **新建** | 内联弹窗表单——名称、描述、时间范围、初始事件（动态增删）、环境参数（动态 key:value） |
| `frontend/src/components/world/SandboxSetup.tsx` | 修改 | 场景列表改为内部 `useScenarios()`；自定义场景显示 ✕ 删除按钮；＋「新建场景」入口 |
| `frontend/src/pages/SoloTheater.tsx` | 修改 | 硬编码 3 场景 → `useScenarios()`；＋「新建场景」入口 |
| `frontend/src/pages/GroupSandbox.tsx` | 修改 | 去掉 `SANDBOX_SCENARIOS` prop（SandboxSetup 自行拉取） |

### 测试

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/components/world/world-components.test.tsx` | 修改 | mock `useScenarios`/`useDeleteScenario`；适配新 props |

## 决策记录

- **自定义场景存内存 dict：** Step 35 迁 SQLite，当前与内置场景同接口，外部无感知。
- **内置场景不可删：** 通过 `id` 字段区分——内置无 `id`，自定义有。DELETE 只接受自定义场景 ID。
- **场景表单兼容 Scenario 全部字段：** 名称 + 描述 + 时间范围 + 初始事件（动态行） + 环境参数（动态 key:value）。保存时过滤空值。
- **SandboxSetup 内部拉取场景：** 不再通过 prop 传入，组件自己调 `useScenarios()`。SoloTheater 同理。减少父组件传参。

## 接口与兼容性

- 新增 `GET/POST /api/scenarios`、`DELETE /api/scenarios/{id}` 端点。
- `Scenario` 模型新增可选 `id` 字段，内置场景不受影响。
- `SandboxSetup` props 移除 `scenarios`（非 BREAKING——仅 GroupSandbox 调用，已同步更新）。
- `SoloTheater` 移除 `BUILTIN_SCENARIOS` 常量，改用 API。

## 测试结果

- [x] 后端全量测试 — ✅ 214 passed
- [x] 前端全量测试 — ✅ 203 passed（13 files）

## 验收记录

- [x] SandboxSetup 场景列表 = 3 内置 + 自定义 — ✅
- [x] 「＋ 新建场景」→ 弹窗表单 → 填写 → 保存 → 列表刷新 — ✅
- [x] 自定义场景右上角 ✕ 可删、内置不可删 — ✅
- [x] 自定义场景可选中并启动模拟 — ✅
- [x] SoloTheater 同样支持自定义场景 — ✅
- [x] 人工 CHECK-2 — ✅ 2026-07-23 用户确认通过

## 对下一步的提示

- Step 35 需将自定义场景从内存 dict 迁入 SQLite `scenarios` 表。
- 自定义场景的 `environment_params` 目前仅简单 key:value，未来可扩展为结构化参数。
