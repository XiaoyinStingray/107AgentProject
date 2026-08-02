# Step 76 — 科大主题

> **Phase 17.7 · 2026-08-02 · 依赖 Step 34-S（场景自定义）**

## 概述

为项目注入科大（USTC）校园文化元素，包括 8 个科大 Agent 模板、5 个科大内置场景、科大地标对话梗、首页/顶栏 USTC 品牌标识，以及底部彩蛋。所有修改均为纯数据新增，无破坏性变更。

## 变更文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/engines/persona/data/agent_templates.json` | 修改 | 新增 8 个科大校园 Agent 模板（category: "科大校园"） |
| `backend/src/engines/world/scenarios.py` | 修改 | 新增 5 个科大内置场景（USTC_LIBRARY/SAKURA/LAB_MEETING/COURSE_WAR/GYM） |
| `backend/src/engines/world/__init__.py` | 修改 | 导出新增 5 个场景常量 |
| `backend/tests/test_scenarios.py` | 修改 | `test_length` 断言从 `== 3` 改为 `>= 8` |
| `frontend/src/pages/GameScene.tsx` | 修改 | 6 个场景名称增加科大地标后缀（西区/西区六栋/三教/中区/科研楼/老北门） |
| `frontend/src/game/dialogue.ts` | 修改 | 6 个场景 FALLBACK 对话池各追加 2-3 条科大梗台词 |
| `frontend/src/pages/Home.tsx` | 修改 | 副标题加 "USTC ×"、M11 描述改为"科大校园 RPG"、底部加彩蛋 |
| `frontend/src/components/layout/TopBar.tsx` | 修改 | 产品名右侧加 "USTC" 小标签 |

## 决策记录

- **健身房选址修正：** 原设计为"东区健身房"，用户反馈东区器材充足，改为"中区健身房"以体现竞争感
- **地标命名修正：** "樱花大道·北门" → "樱花大道·老北门"；"艺术中心·东区" → "艺术中心·中区"
- **测试断言放宽：** `test_length` 从 `== 3` 改为 `>= 8`，避免后续新增场景时再次需要修改断言值

## 接口变更

- 无 BREAKING 变更
- `BUILTIN_SCENARIOS` 列表从 3 个扩展为 8 个，下游 `get_scenario_by_name()` 自动支持新场景
- `agent_templates.json` 模板数从 36 个扩展为 44 个，`template_library.py` 的 `≥30` 校验不受影响

## 测试结果

- [x] 后端关键模块测试 95/95 通过（scenarios + templates + world_engine + scenes_api + prompt_templates + worlds_api + agents_api）
- [x] 前端全量测试 358/358 通过（40 个测试文件）
- [x] 手动验收 — ✅ 通过

## 已知问题

- 无

## 对下一步的提示

- Step 75（演示排练）可直接使用科大场景作为演示内容，8 个 Agent 模板覆盖丰富的校园角色
- 科大内置场景（图书馆/樱花/组会/选课/健身房）均可通过 World 创建页面的场景下拉选择
- 对话梗在 Mock 模式（Brain 未启用）下生效，Brain 模式下由 LLM 生成
