"""
BatchScheduler — 标准化套件批量评测。
Step 58: 3 Agent × 3 场景 × 3 重复 = 27 条评测记录。
"""

import asyncio
import json
import uuid

from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.bench_orm import BenchRun, BenchResult
from models.world import Scenario
from models.agent import Persona, Background
from engines.bench.metrics import calculate_metrics, aggregate_scores


# 标准 Agent 模板
STD_AGENTS = [
    {
        "id": "intj-scholar",
        "name": "学霸小明",
        "mbti": "INTJ-T",
        "big_five": {"openness": 0.75, "conscientiousness": 0.90, "extraversion": 0.25, "agreeableness": 0.40, "neuroticism": 0.45},
        "narrative": "物院大三学生，GPA 4.0，每天泡图书馆，社恐但学术极强。",
        "decision_style": "理性分析型",
    },
    {
        "id": "enfp-social",
        "name": "社交小红",
        "mbti": "ENFP-A",
        "big_five": {"openness": 0.85, "conscientiousness": 0.40, "extraversion": 0.90, "agreeableness": 0.80, "neuroticism": 0.35},
        "narrative": "人文学院大二学生，外向热情，喜欢组织和社交，但对学术不太上心。",
        "decision_style": "直觉感性型",
    },
    {
        "id": "estj-leader",
        "name": "领导者小刚",
        "mbti": "ESTJ-A",
        "big_five": {"openness": 0.50, "conscientiousness": 0.85, "extraversion": 0.70, "agreeableness": 0.45, "neuroticism": 0.25},
        "narrative": "管院大三学生会主席，果断务实，组织力强但有时独断。",
        "decision_style": "目标导向型",
    },
]

# 标准场景
STD_SCENARIOS = [
    Scenario(name="期末周", description="期末考试周，图书馆座位紧张，压力山大",
             time_range="1-7", initial_events=["图书馆7点开门"], environment_params={"stress_level": "high"}),
    Scenario(name="新生报到", description="开学第一天，新生涌入校园，机会与混乱并存",
             time_range="1-3", initial_events=["校车到达"], environment_params={"social_chance": "high"}),
    Scenario(name="毕业选择", description="大四下学期，每个人都面临人生关键决策",
             time_range="1-30", initial_events=["招聘会开始"], environment_params={"decision_pressure": "high"}),
]

REPEAT_COUNT = 3


def _build_tick_context(scenario: Scenario, tick: int) -> str:
    """构建单个评测 tick 注入 Agent 的场景上下文。"""
    if scenario.name == "期末周":
        environment = f"📊 资源状态: 图书馆剩余座位 {max(0, 80 - tick * 10)} 个\n"
    else:
        environment = "🌤️ 天气: 晴\n"
    return (
        f"⏰ 第 {tick} 个时间段\n"
        f"📍 地点: {scenario.name}\n"
        f"{environment}"
    )


async def run_bench_suite(
    run_id: str, db: AsyncSession, model_client_factory,
    custom_agents=None, custom_scenarios=None, repeats=None,
) -> dict:
    """执行完整评测套件。

    model_client_factory: callable(api_key, base_url, model) → model_client

    返回: 聚合后的 scores dict
    """
    result = await db.execute(select(BenchRun).where(BenchRun.id == run_id))
    bench_run = result.scalar_one_or_none()
    if not bench_run:
        raise ValueError(f"BenchRun {run_id} not found")

    all_scores = []
    successful_tasks = 0
    # 69: 自定义套件 or 标准
    agents = custom_agents or STD_AGENTS
    scenarios_raw = custom_scenarios or STD_SCENARIOS
    rep_count = repeats if repeats is not None else REPEAT_COUNT

    def _to_scenario(s):
        if isinstance(s, Scenario): return s
        return Scenario(name=s.get("name", ""), description=s.get("description", ""),
                        time_range=s.get("time_range", "1-8"),
                        initial_events=s.get("initial_events", []),
                        environment_params=s.get("environment_params", {}))

    scenarios_list = [_to_scenario(s) for s in scenarios_raw]
    bench_run.total_tasks = len(agents) * len(scenarios_list) * rep_count
    bench_run.completed_tasks = 0
    await db.commit()

    # 69: 取消检查
    async def _check_cancel():
        await db.refresh(bench_run)
        return bench_run.status == "cancelled"

    try:
        model_client = model_client_factory(
            bench_run.llm_api_key, bench_run.llm_base_url, bench_run.llm_model
        )
    except Exception as e:
        bench_run.status = "failed"
        bench_run.report = f"LLM 连接失败: {e}"
        bench_run.llm_api_key = ""
        await db.commit()
        return {}

    # 并发控制：最多 6 个任务同时跑
    sem = asyncio.Semaphore(6)

    async def _run_one(agent_tpl, scenario, rep):
        async with sem:
            result_id = str(uuid.uuid4())
            try:
                scores, events = await _run_single_test(agent_tpl, scenario, rep, model_client, db)
                return (result_id, scores, None, events)
            except Exception as e:
                return (result_id, calculate_metrics([], {}), str(e)[:500], [])

    # 构建任务列表 + 元数据
    task_specs = [
        (a, s, r) for a in agents for s in scenarios_list for r in range(rep_count)
    ]

    async def _run_with_meta(agent_tpl, scenario, rep):
        result_id, scores, error, events = await _run_one(agent_tpl, scenario, rep)
        return (agent_tpl, scenario, rep, result_id, scores, error, events)

    pending = [_run_with_meta(a, s, r) for a, s, r in task_specs]

    for coro in asyncio.as_completed(pending):
        agent_tpl, scenario, rep, result_id, scores, error, events_raw = await coro
        br = BenchResult(
            id=result_id, run_id=run_id,
            agent_template=agent_tpl.get("name", agent_tpl.get("id", "?")),
            scenario=scenario.name if hasattr(scenario, "name") else scenario.get("name", "?"),
            repeat_index=rep,
            scores_json=json.dumps(scores, ensure_ascii=False),
            events_json=json.dumps(events_raw, ensure_ascii=False),
            status="done" if not error else "failed",
            error=error,
        )
        # 失败任务的零分也进入聚合，避免只统计成功样本导致结果虚高。
        all_scores.append(scores)
        if not error:
            successful_tasks += 1
        db.add(br)
        bench_run.completed_tasks += 1
        await db.commit()
        # 69: 取消检查
        if await _check_cancel():
            logger.info(f"Bench run {run_id} cancelled at {bench_run.completed_tasks}/{bench_run.total_tasks}")
            break

    # 聚合 + 报告
    agg = aggregate_scores(all_scores)
    bench_run.scores_json = json.dumps(agg, ensure_ascii=False)

    try:
        from engines.bench.reporter import generate_report
        report = await generate_report(agg, bench_run.completed_tasks)
        bench_run.report = report
    except Exception as e:
        bench_run.report = f"报告生成失败: {e}"

    bench_run.status = "done" if successful_tasks > 0 else "failed"
    bench_run.llm_api_key = ""  # 安全：跑完即清除 API Key
    await db.commit()
    logger.info(f"Bench run {run_id}: completed {bench_run.completed_tasks}/{bench_run.total_tasks}")
    return agg


async def _run_single_test(agent_tpl: dict, scenario, rep: int,
                           model_client, _db: AsyncSession):
    """运行一条评测：创建 Agent → 注入场景 → run 8 ticks → 计算指标。"""
    from engines.agent_factory.factory import AgentFactory

    # BUG-M10-010: 自定义 Agent 可能缺少 mbti/big_five/narrative/decision_style
    _mbti = agent_tpl.get("mbti", "INTJ")
    _big_five = agent_tpl.get("big_five", {"openness": 0.5, "conscientiousness": 0.5, "extraversion": 0.5, "agreeableness": 0.5, "neuroticism": 0.5})
    _narrative = agent_tpl.get("narrative", agent_tpl.get("name", "Agent") + " 是一个 AI 角色。")
    _decision_style = agent_tpl.get("decision_style", "综合分析型")

    # 用模板创建 Agent
    persona = Persona(
        name=agent_tpl["name"], mbti=_mbti,
        big_five=_big_five, narrative=_narrative,
    )
    background = Background(hometown="", education="", key_events=[])
    factory = AgentFactory(model_client)
    agent = factory.create_from_persona(
        agent_id=f"bench-{str(uuid.uuid4())[:8]}",
        persona=persona, background=background, goals=[],
    )

    logger.info(f"Bench task started: {agent_tpl['name']} × {scenario.name} #{rep}")
    events: list[dict] = []
    tick_errors: list[str] = []
    successful_ticks = 0
    for tick in range(8):
        context = _build_tick_context(scenario, tick)
        agent.inject_context(context)
        start = __import__("time").time()
        try:
            from autogen_agentchat.messages import TextMessage
            from autogen_core import CancellationToken
            result = await asyncio.wait_for(
                agent.autogen_agent.on_messages(
                    [TextMessage(content="请根据场景自然地行动、思考或说话。", source="world")],
                    cancellation_token=CancellationToken(),
                ),
                timeout=30.0,
            )
            successful_ticks += 1
            # 从 AutoGen Response 提取所有消息（兼容 v0.4/v0.7）
            for msg in getattr(result, "inner_messages", []) or []:
                content = str(getattr(msg, "content", ""))
                if content:
                    tag = "agent_action" if any(kw in content for kw in ["调用","执行","Action","Tool","function","complete_step","submit"]) else "thought_stream"
                    events.append({"type": tag, "content": content, "tick": tick})
            # v0.7: messages 属性
            for msg in getattr(result, "messages", []) or []:
                content = str(getattr(msg, "content", ""))
                if content:
                    tag = "agent_action" if any(kw in content for kw in ["调用","执行","Action","Tool","function","complete_step","submit"]) else "agent_message"
                    events.append({"type": tag, "content": content, "tick": tick})
            # 兜底: chat_message
            chat = getattr(result, "chat_message", None)
            if chat and getattr(chat, "content", ""):
                events.append({"type": "agent_message", "content": str(chat.content), "tick": tick})
            # 兜底: result 本身就有 content
            content = getattr(result, "content", None)
            if content and isinstance(content, str):
                tag = "agent_action" if any(kw in content for kw in ["调用","执行","Action","Tool","function","complete_step","submit"]) else "agent_message"
                events.append({"type": tag, "content": content, "tick": tick})
        except asyncio.TimeoutError:
            tick_errors.append(f"tick {tick}: timeout")
        except Exception as exc:
            tick_errors.append(f"tick {tick}: {str(exc)[:100]}")
        elapsed = __import__("time").time() - start
        if tick == 0:
            logger.info(f"  tick {tick}: {len(events)} events in {elapsed:.1f}s")

    if successful_ticks == 0:
        detail = tick_errors[-1] if tick_errors else "no valid response"
        raise RuntimeError(f"all 8 ticks failed ({detail})")
    if tick_errors:
        logger.warning(
            f"Bench task partially failed: {agent_tpl['name']} × "
            f"{scenario.name} #{rep}, {len(tick_errors)}/8 ticks"
        )

    scores = calculate_metrics(
        events,
        {"mbti": _mbti, "big_five": _big_five},
    )
    logger.info(
        f"Bench task finished: {agent_tpl['name']} × {scenario.name} #{rep}, "
        f"{successful_ticks}/8 ticks, {len(events)} events, scores={scores}"
    )
    logger.info(f"  events collected: {len(events)} total (thoughts={sum(1 for e in events if e.get('type')=='thought_stream')}, msgs={sum(1 for e in events if e.get('type')=='agent_message')})")
    return scores, events
