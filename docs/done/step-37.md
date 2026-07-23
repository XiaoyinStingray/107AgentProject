# Step 37 — LoadingSpinner + 标签常量抽取

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-23 |
| Phase | Phase 11.2 |
| Plan 章节 | [plan-state2.md](../plan-state2.md) §Step 37 |
| 状态 | ✅ done |

## 产出

### 37a. `<LoadingSpinner>` 共享组件

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/components/shared/LoadingSpinner.tsx` | **新建** | 统一加载指示器：`icon?`（默认 spinner）+ `title` + `detail?` + `fullscreen?` |
| `frontend/src/pages/AgentFoundry.tsx` | 修改 | 内联 loading div → `<LoadingSpinner title="正在构建人格…" detail="LLM 正在推理…" />` |
| `frontend/src/pages/NarrativeFactory.tsx` | 修改 | 全屏 generating 画面 → `<LoadingSpinner icon={emoji} title="正在生成…" fullscreen />` |

### 37b. 标签常量抽取

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/constants/labels.ts` | **新建** | `EMOTION_LABELS` + `DECISION_LABELS` + `DECISION_VALUE_LABELS` |
| `frontend/src/components/agent/AgentCard.tsx` | 修改 | 内联 `EMOTION_LABELS`（76-83行）→ import |
| `frontend/src/components/world/AgentStatusPanel.tsx` | 修改 | 内联 `EMOTION_LABELS`（179-186行）→ import |
| `frontend/src/pages/AgentFoundry.tsx` | 修改 | 内联 `DECISION_LABELS` + `DECISION_VALUE_LABELS`（288-309行）→ import |

### 消除的重复

- ❌ `EMOTION_LABELS` 完全相同的两份内联定义（AgentCard + AgentStatusPanel）
- ❌ `DECISION_LABELS` / `DECISION_VALUE_LABELS` 内联在 AgentFoundry 底部

## 决策记录

- **放弃 `<SelectableCard>`：** 原 plan 预计 ~15 处替换，实际侦查发现 7 个文件 20+ 处，accent 颜色/结构不统一。抽象后参数爆炸或功能受限。不在此步做。
- **放弃场景数据合并：** SoloTheater 在 Step 34-S 已切 `useScenarios()` API，本地常量已消失。问题自然消解。
- **LoadingSpinner 双模式：** `fullscreen=false`（内联，AgentFoundry 创建中）vs `fullscreen=true`（全屏居中，NarrativeFactory 生成中）。两种使用场景用一个组件覆盖，避免过度抽象。

## 接口变更

- 无 BREAKING。所有新增 import 为内部常量/组件，不影响外部 API。

## 测试结果

- [x] TypeScript — ✅ 零错误
- [x] 前端 13/13 测试文件通过，203/203 测试通过 — ✅
- [x] 视觉走查：Agent 创建 loading — ✅
- [x] 视觉走查：叙事生成 loading — ✅

## 已知问题

- 无

## 对下一步的提示

- Step 38（死代码清理 + 路由懒加载）继续 Phase 11 收尾
- Step 38-S（文件拆分）标记为可选跳过，Phase 12 后如有需要再做
