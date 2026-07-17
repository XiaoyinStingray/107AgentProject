# Step 08 — 场景模板

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-17 |
| Phase | Phase 3.1 |
| Plan 章节 | [development-plan.md](../development-plan.md) §3.1 |
| 状态 | ✅ done |

## 产出

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/engines/world/scenarios.py` | 新建 | 3 个 `Scenario` 常量 + `BUILTIN_SCENARIOS` 列表 + `get_scenario_by_name()` |
| `backend/src/engines/world/__init__.py` | 修改 | 导出场景常量和辅助函数 |
| `backend/tests/test_scenarios.py` | 新建 | 28 个测试：常量完整性、列表验证、名称查找 |

## 决策记录

- **`get_scenario_by_name()` 辅助函数：** Plan 中未定义，但下游 World API（Step 13）需要通过名称查找内置场景。提前加入此工具函数，避免下游重复实现。查找逻辑为精确匹配，不做模糊搜索（模糊搜索留给用户自定义场景场景）。

- **`description` 使用多行字符串拼接：** 场景描述较长，使用 Python 隐式字符串连接（括号内多行）而非 `\` 续行符，可读性更好。

- **`time_range` 格式 `"N-M"`：** 直接沿用 Plan 定义。测试中验证了格式正确性（`split("-")` 后两端均为整数且 `start < end`）。

## 接口变更

```python
# 新增（engines/world/scenarios.py）
FRESHMAN_ORIENTATION: Scenario    # 新生报到，tick 1-20
FINAL_EXAM_WEEK: Scenario         # 期末周，tick 1-30
GRADUATION_CHOICE: Scenario       # 毕业选择，tick 1-25
BUILTIN_SCENARIOS: list[Scenario] # [FRESHMAN_ORIENTATION, FINAL_EXAM_WEEK, GRADUATION_CHOICE]

def get_scenario_by_name(name: str) -> Scenario | None
```

无破坏性变更，未修改任何共享类型。

## 测试结果

- [x] 3 个常量均为 `Scenario` 实例 — ✅ 通过
- [x] 所有场景 name/description 非空 — ✅ 通过
- [x] 所有场景至少有 1 个 initial_event — ✅ 通过
- [x] 所有场景 environment_params 含 location — ✅ 通过
- [x] time_range 格式为 `"N-M"` 且 N < M — ✅ 通过
- [x] BUILTIN_SCENARIOS 长度为 3，名称唯一 — ✅ 通过
- [x] 所有场景可 `model_dump()` 序列化 — ✅ 通过
- [x] `get_scenario_by_name` 精确查找命中 — ✅ 通过
- [x] `get_scenario_by_name` 不存在/空名/部分名返回 None — ✅ 通过

```
28 passed in 1.51s (0 regressions in test_scenarios.py)
```

注：其余已有测试（test_persona_builder、test_prompt_templates、test_memory_retriever）因 `autogen_core` 未安装而失败，属环境问题，与本步无关。

## 已知问题

- 无

## 对下一步的提示

- **Step 09 (Tick 调度器) 进入 Phase 3.2。** WorldEngine.tick() 中可通过 `BUILTIN_SCENARIOS` 或 `get_scenario_by_name()` 获取场景配置，用于初始化世界状态。
- `Scenario.environment_params` 中的 `location`/`weather`/`stress_level` 等字段将作为 WorldEngine._build_world_context() 的数据源。
- Step 09 依赖 Step 05（LifeAgent）+ Step 08（场景模板），两者均已完成。
