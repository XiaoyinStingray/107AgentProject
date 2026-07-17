# Step 10 — 关系演化

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-17 |
| Phase | Phase 3.3 |
| Plan 章节 | [development-plan.md](../development-plan.md) §3.3 |
| 状态 | ✅ done |

## 产出

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/engines/world/relationships.py` | 新建 | 关系分数计算 + 关键词交互检测 + 关系变化应用 |
| `backend/src/engines/world/engine.py` | 修改 | 填实 `_apply_action()` 和 `_update_relationships()` 两个 stub |
| `backend/tests/test_relationships.py` | 新建 | 23 个测试：分数计算、交互检测、变化提取、变化应用 |

## 决策记录

- **交互类型检测：P0 关键词匹配。** 四种类型各有独立关键词列表（中英文）。统计文本中匹配数，取最多的类型。平局→neutral。P2 可升级为 LLM 分类。

- **双向量化关系：** A→B 和 B→A 独立计算。正值=正面，负值=负面，范围 [-1.0, 1.0]。存储在 WorldEngine 的内存字典 `self.relationships: dict[tuple[str,str], float]` 中，暂不持久化到 DB（P0 简化）。

- **`_apply_action` 处理三种 tool：**
  - `send_message` → 路由生成 `agent_message` 事件，经 `_resolve_agent_id()` 按名称或 ID 匹配目标
  - `set_goal` → 追加 Goal 到对应 LifeAgent
  - `observe` → 生成 `thought_stream` 观察事件

- **`_resolve_agent_id`：** 先精确 ID 匹配，再按 persona.name 查找。找不到时原样返回——下游用 event.target_agent_ids 时处理不存在的情况。

- **事件数量增多：** `tick()` 现在会产生额外的 `relationship_change` 事件和 `agent_message` 事件（从 tool call 路由），总事件数 > 原始交互消息数。这是预期行为——世界状态的多维度记录。

## 接口变更

```python
# 新增（engines/world/relationships.py）
def update_relationship_score(current_score, interaction_type, intensity=1.0) -> float
def detect_interaction_type(text: str) -> str
def extract_relationship_changes(events: list[SimEvent]) -> list[tuple[str,str,str,float]]
def apply_relationship_changes(relationships, changes) -> list[SimEvent]
INTERACTION_DELTAS: dict[str, float]
```

无破坏性变更。API 和 Plan §3.3 完全一致。

## 测试结果

- [x] 关系分数增减、clamp、intensity 缩放 — ✅
- [x] 四种交互类型关键词检测 + neutral + 多类型优先 — ✅
- [x] agent_message 提取关系变化（含/缺 target、非消息事件过滤） — ✅
- [x] 双向独立分数、累积变化、事件数据完整性 — ✅
- [x] WorldEngine 现有测试全部通过 — ✅

```
131 passed in 1.15s (23 new + 108 existing, 0 regressions)
```

## 补充记录（2026-07-17 — code-review 后修复）

| 问题 | 修复 |
|------|------|
| `__init__` 未初始化 `self.relationships` → AttributeError | 加入 `self.relationships: dict[tuple[str,str],float] = {}` |
| `_convert_message_to_event` 用 AutoGen name 作 source_agent_id，而非 UUID → 身份分裂 | 新增 `_name_to_id` 反向映射；`_convert_message_to_event` 和 `_tool_call_to_event` 中用 `_name_to_id` 解析 |
| `_apply_action` 完全不执行——从不创建 type='agent_action' 事件，data 恒为空 | 新增 `_tool_call_to_event()` 处理 `ToolCallRequestEvent` → `SimEvent(type='agent_action', data={...})`；solo/group 消息转换均识别 tool call |
| `extract_relationship_changes` 跳过所有群聊消息（target_agent_ids 为空） | 接受 `all_agent_ids` 参数，无明确目标时 broadcast 到在场全体 Agent |
| `apply_relationship_changes` 事件 ID 跨 tick 碰撞 | `f"rel-{from}-{to}-{len}"` → `str(uuid.uuid4())` |
| `_apply_action`/`_update_relationships` 产生的事件未纳入持久化和关系分析 | 改为返回事件列表；`tick()` 合并到 `tick_events` 并统一持久化 |
| `build_group_chat()` 公开方法缺失 | 从 `_run_group_tick` 中提取为独立方法 |
| 天气在无定义场景中伪造默认值"晴" | `_build_world_context` 改为只在有 weather 时显示 |
| 群聊 prompt 未使用 scenario.initial_events | prompt 中加入 `初始事件` 行 |

## 已知问题

- **关键词检测精度有限：** 中文"谢谢"和"感谢"够覆盖常见友好场景，"讨厌"和"滚"覆盖常见敌对场景。但复杂语境（如反讽、威胁）会漏检。P2 升级 LLM 分类可解决。
- **关系未持久化：** 当前仅存内存，重启丢失。若需跨 session 保留，需要加 Relationship ORM 模型。
- **`_apply_action` 依赖 `event.data` 中包含 tool call 参数：** 当前 AutoGen 的 tool call 拦截未完全实现在 `_convert_message_to_event` 中。真 LLM 联调时需验证 tool call 消息是否正确转换为 SimEvent。

## 对下一步的提示

- **Phase 3 完成。** Step 11 进入 Phase 4（SSE 桥接），依赖 WorldEngine.tick() 产生的事件流。
- 关系分数通过 `self.events` 中的 `relationship_change` 事件暴露，SSE 可直接序列化推送。
- 真 LLM 联调时需要关注 `_apply_action` 的 tool call 拦截是否正确解析 AutoGen 的 `ToolCallMessage`。
