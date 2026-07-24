# Step 42 — 叙事工厂完善 (#29–#32)

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-24 |
| Phase | Phase 12.4 |
| Plan 章节 | [plan-state2.md](../plan-state2.md) §Step 42 |
| 状态 | ✅ done |

## 产出

### 后端

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/engines/narrative/templates.py` | 修改 | 新增 `PARALLEL_PROMPT`（平行对话模板）；`PODCAST_PROMPT` 增加嘉宾互动要求 |
| `backend/src/engines/narrative/engine.py` | 修改 | `NarrativeStyle` 枚举加 `PARALLEL = "parallel"`；`_TEMPLATES` 加映射 |
| `backend/src/api/narratives.py` | 修改 | 新增 `POST /api/narratives/parallel` 端点 |
| `backend/tests/test_narrative_engine.py` | 修改 | 新增 `test_generate_parallel` 测试用例 |

### 前端

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/api/narratives.ts` | 修改 | 新增 `useGenerateParallel()` hook |
| `frontend/src/mocks/narratives.ts` | 修改 | `NarrativeStyle` 类型加 `"parallel"`；`NARRATIVE_STYLES` 新增平行对话项（`available: true`） |
| `frontend/src/pages/NarrativeFactory.tsx` | 修改 | ① letter 时间跨度选择器 ② podcast 嘉宾多选 UI ③ parallel 对话对象选择 ④ 风格切换清空输入 ⑤ URL hash 同步"当前功能" ⑥ 移除 prose 类避免特殊字符渲染 |
| `frontend/src/components/narrative/narrative-components.test.tsx` | 修改 | mock 加 `useGenerateParallel`；断言 available 数量 4→5 |

## 决策记录

- **#29 小说化叙事：** "重新生成"、"复制"、"下载"功能已在 Step 34 实现，本步仅验收确认。
- **平行对话风格：** 新增 `NarrativeStyle.PARALLEL`，复用现有 `_generate_narrative` 通用逻辑，无额外后端复杂度。
- **Letter 时间跨度：** 通过拼接 `target`（如"5年后的小明"）传入后端，利用现有 `{target}` 模板变量，无需新增 API 字段。
- **Podcast 嘉宾：** 改为多选（`guestAgentIds: string[]`），嘉宾名字拼入 `target` 传给后端，prompt 要求 LLM 在脚本中体现嘉宾互动。
- **Parallel 对话对象：** 点击已选中 Agent 可取消选择（单选模式）。
- **URL hash 同步：** 风格切换时通过 `window.history.replaceState` 静默更新 hash，让 `FeatureRouteBoundary` 顶部"当前功能"显示正确。
- **LaTeX 渲染问题：** 移除 `prose prose-invert` 类，改为纯 `div` 渲染，避免 Tailwind Typography 插件对特殊字符的解释。

## 接口变更

- **后端新增枚举值：** `NarrativeStyle.PARALLEL = "parallel"` — 非 BREAKING，纯增量
- **后端新增端点：** `POST /api/narratives/parallel` — 纯增量
- **前端新增类型：** `NarrativeStyle` 联合类型加 `"parallel"` — 非 BREAKING
- **前端新增 hook：** `useGenerateParallel()` — 纯增量

## 测试结果

- [x] 后端叙事引擎测试 10/10 通过（含新增 PARALLEL） — ✅
- [x] 前端叙事组件测试 13/13 通过 — ✅
- [x] 前端全量测试 202/203 通过（1 个 Arena.test.tsx 预先存在失败，与 Step 42 无关） — ✅
- [x] 人工验收 — ✅

## 验收修复记录

验收过程中发现 5 个问题，均已修复：

1. **Letter 时间跨度不明显：** 不同时间跨度生成内容相似 → 将时间跨度拼入 target（如"5年后的小明"），LLM 生成差异化内容
2. **Parallel 对话人名字不对：** target 未正确传入 Agent 名字 → `buildRequest` 从 `guestAgentIds` 查找真实名字
3. **Parallel 无法取消选择：** 点击已选 Agent 无反应 → 改为 toggle 逻辑
4. **Podcast 嘉宾未体现：** prompt 未要求 → 更新 `PODCAST_PROMPT` 增加嘉宾互动要求
5. **LaTeX 渲染异常：** `prose` 类导致特殊字符被解释 → 移除 `prose` 类
6. **风格切换输入残留：** 切换风格后上一风格的输入未清空 → 添加 `useEffect` 监听 `styleKey` 变化自动清空
7. **"当前功能"显示错误：** URL hash 未同步 → 添加 `useEffect` 通过 `replaceState` 同步 hash

## 已知问题

- `Arena.test.tsx` 有 1 个预先存在的测试失败（heading 查找问题），与 Step 42 无关
- `NarrativeFactory.tsx` 超过 300 行限制（Step 38 已决定暂不拆分）

## 对下一步的提示

- Phase 12 功能补全进行中。Step 42 完成后可继续 Step 43（控制台全功能）。
- 叙事工厂现已支持 5 种风格（story/diary/letter/podcast/parallel），后续新增风格需同步更新：后端模板+枚举+API、前端类型+hook+mocks+UI。
