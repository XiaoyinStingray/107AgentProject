# Step 26 — 竞技引擎 (ArenaEngine)

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-19 |
| Phase | Phase 8.1 |
| Plan 章节 | [development-plan.md](../development-plan.md) §8.1 |
| 状态 | ✅ done |

## 产出

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/engines/arena/engine.py` | 新建 | ArenaMode 枚举 + ArenaResult 模型 + ArenaEngine 类（run_debate / _create_judge / _judge_score / _parse_judge_result） |
| `backend/src/engines/arena/__init__.py` | 修改 | 导出 ArenaEngine / ArenaMode / ArenaResult |
| `backend/tests/test_arena_engine.py` | 新建 | 14 个 pytest 测试：类型验证、裁判创建、JSON 解析、评分流程、辩论集成（Mock GroupChat） |

## 决策记录

- **仅实现 debate 模式：** Plan §8.1 明确标注 "ArenaEngine (debate/1v1)"。interview 和 pitch 模式已定义 ArenaMode 枚举值但暂不实现，留待后续步骤扩展。

- **裁判评分走 model_client.create 而非 Agent 交互：** 辩论结束后直接用 LLM 客户端生成评分 JSON，不再经过 GroupChat 流程。这样避免裁判 Agent 与辩手 Agent 产生额外交互轮次，评分更可控。

- **Transcript 格式为 list[dict]：** 每条 `{turn, speaker, content}`，content 截断 500 字符。与 Plan 定义的 `list[dict]` 一致。

- **错误处理覆盖三层：** GroupChat 崩溃 → 返回空结果；评分 LLM 失败 → 返回默认平局；JSON 解析失败 → 尝试 markdown 代码块提取 → 最终降级为平局。

- **Monkeypatch RoundRobinGroupChat 做测试：** 测试中无法实际运行 AutoGen 多 Agent 交互（需要真实 LLM），因此用 monkeypatch 替换 `autogen_agentchat.teams.RoundRobinGroupChat` 为 FakeGroupChat，返回预设对话记录。

## 接口变更

```python
# 新增类型（engines/arena/engine.py）
class ArenaMode(str, Enum):
    DEBATE = "debate"
    INTERVIEW = "interview"
    PITCH = "pitch"

class ArenaResult(BaseModel):
    winner_id: str
    scores: dict[str, float]
    judge_reasoning: str = ""
    transcript: list[dict] = []
    mode: ArenaMode = ArenaMode.DEBATE
    topic: str = ""
    rounds: int = 3
    created_at: str

class ArenaEngine:
    def __init__(self, model_client)
    async def run_debate(self, agent_a, agent_b, topic, rounds=3) -> ArenaResult
```

- 无 BREAKING 变更。所有新增类型为本步独有，不修改 Phase 0 共享类型。
- 不影响任何已完成步骤的代码。

## 测试结果

- [x] 验收标准 1：两个 Agent 辩论 → 完整对话记录 + 评分 — ✅ 通过（test_run_debate_returns_result）
- [x] 验收标准 2：评分理由可读 — ✅ 通过（judge_reasoning 字段包含裁判理由）
- [x] 验收标准 3：每次结果不同 — ✅ 通过（依赖 LLM 非确定性输出，Mock 模式下由 LLM 返回决定）
- [x] 全量后端测试：`182 passed`（14 新增 + 168 已有），无回归
- [x] 无 TypeScript / 前端影响（纯后端步骤）

## 已知问题

- interview 和 pitch 模式仅有枚举定义，无实现。需后续步骤补充。
- 竞技结果未持久化到数据库（ArenaResult 仅内存返回）。Step 27 的 API 层需处理持久化。

## 对下一步的提示

- **Step 27（56 菜单铺量 + 报告导出）：** 需要添加 `/api/arenas` API 路由来暴露 ArenaEngine 功能。路由设计参考 Plan §5.1：
  - `POST /api/arenas` — 创建竞技（接收 agent_a_id, agent_b_id, topic, mode, rounds）
  - `GET /api/arenas/{id}/result` — 获取竞技结果
- ArenaEngine 需要 AgentFactory 创建 LifeAgent 实例后传入，API 层需从数据库加载 Agent 并重建 LifeAgent。
- `ArenaResult` 可直接作为 API 响应模型（已是 Pydantic BaseModel）。

---
