"""
Team 路由 — CRUD + 角色推荐 API。
Step 51: 为 Agent Team 模块提供数据层。
"""

import asyncio
import json
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from loguru import logger
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from pathlib import Path

from db import get_db
from models.team_orm import TeamRow
from models.plan_orm import PlanRow
from config import settings

router = APIRouter(prefix="/api/teams", tags=["teams"])


# =============================================================================
# CRUD
# =============================================================================


@router.post("", status_code=201)
async def create_team(
    body: dict,
    db: AsyncSession = Depends(get_db),
):
    """创建 Team。

    body: {name, description, agent_ids: [str], roles?: [{agent_id, role, reason}]}
    返回: Team dict（含 id, status, created_at）
    """
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Team 名称不能为空")
    agent_ids = body.get("agent_ids", [])
    if not isinstance(agent_ids, list) or len(agent_ids) == 0:
        raise HTTPException(status_code=400, detail="Team 至少需要 1 个 Agent")

    # 验证所有 Agent 存在
    from models.agent_orm import AgentRow
    for aid in agent_ids:
        result = await db.execute(select(AgentRow).where(AgentRow.id == aid))
        if not result.scalar_one_or_none():
            raise HTTPException(
                status_code=400,
                detail=f"Agent {aid!r} 不存在，请先创建 Agent",
            )

    roles = body.get("roles", [])
    if not isinstance(roles, list):
        roles = []

    team_id = str(uuid.uuid4())
    row = TeamRow.from_create(
        team_id=team_id,
        name=name,
        description=body.get("description", ""),
        agent_ids=agent_ids,
        roles=roles,
    )
    db.add(row)
    await db.commit()

    logger.info(f"Team created: id={team_id}, name={name!r}, agents={len(agent_ids)}")
    return row.to_dict()


@router.get("")
async def list_teams(db: AsyncSession = Depends(get_db)):
    """列出全部 Team（摘要列表，不含 Agent 详情）。"""
    result = await db.execute(
        select(TeamRow).order_by(TeamRow.created_at.desc())
    )
    rows = result.scalars().all()
    return [row.to_dict() for row in rows]


@router.get("/{team_id}")
async def get_team(team_id: str, db: AsyncSession = Depends(get_db)):
    """获取单个 Team 详情，附带 Agent 摘要信息。"""
    result = await db.execute(select(TeamRow).where(TeamRow.id == team_id))
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail=f"Team {team_id!r} 不存在")

    data = row.to_dict()

    # 附带 Agent 摘要（id, name, mbti）
    from models.agent_orm import AgentRow
    import json as _json
    agents_summary = []
    for aid in data["agent_ids"]:
        agent_result = await db.execute(select(AgentRow).where(AgentRow.id == aid))
        agent_row = agent_result.scalar_one_or_none()
        if agent_row:
            try:
                persona = _json.loads(agent_row.persona_json)
                agent_name = persona.get("name", "") or agent_row.name or aid[:8]
                agent_mbti = persona.get("mbti", "")
            except Exception:
                agent_name = agent_row.name or aid[:8]
                agent_mbti = ""
            agents_summary.append({
                "id": aid,
                "name": agent_name,
                "mbti": agent_mbti,
            })
    data["agents"] = agents_summary
    return data


@router.delete("/{team_id}", status_code=204)
async def delete_team(team_id: str, db: AsyncSession = Depends(get_db)):
    """删除 Team（不删除 Agent）。"""
    result = await db.execute(select(TeamRow).where(TeamRow.id == team_id))
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail=f"Team {team_id!r} 不存在")
    await db.execute(delete(TeamRow).where(TeamRow.id == team_id))
    await db.commit()
    logger.info(f"Team deleted: id={team_id}")
    return None


# =============================================================================
# 角色推荐
# =============================================================================


@router.post("/suggest-roles")
async def suggest_roles(body: dict) -> list[dict]:
    """根据 Agent 人格推荐团队角色。

    body: {agent_ids: [str]}
    返回: [{agent_id, role, reason}]

    调 LLM 分析每个 Agent 的人格特征，推荐最适合的团队角色。
    """
    agent_ids = body.get("agent_ids", [])
    if not isinstance(agent_ids, list) or len(agent_ids) == 0:
        raise HTTPException(status_code=400, detail="至少需要 1 个 Agent ID")

    # 从 DB 加载 Agent 人格摘要
    from models.agent_orm import AgentRow
    from db import async_session
    import json as _json

    agent_profiles = []
    async with async_session() as session:
        for aid in agent_ids:
            result = await session.execute(select(AgentRow).where(AgentRow.id == aid))
            row = result.scalar_one_or_none()
            if not row:
                raise HTTPException(status_code=400, detail=f"Agent {aid!r} 不存在")
            try:
                persona = _json.loads(row.persona_json)
            except Exception:
                persona = {}
            # 提取决策风格
            decision_style = ""
            try:
                bg = _json.loads(row.background_json)
                decision_style = bg.get("decision_style", "")
            except Exception:
                pass
            agent_profiles.append({
                "id": aid,
                "name": persona.get("name", row.name or aid[:8]),
                "mbti": persona.get("mbti", ""),
                "big_five": persona.get("big_five", {}),
                "decision_style": decision_style,
                "background": persona.get("narrative", "")[:200],
            })

    # 构建 LLM prompt
    profiles_text = ""
    for p in agent_profiles:
        bf = p["big_five"]
        profiles_text += (
            f"- {p['name']}（{p['mbti']}）\n"
            f"  大五人格: O:{bf.get('openness',0)} C:{bf.get('conscientiousness',0)} "
            f"E:{bf.get('extraversion',0)} A:{bf.get('agreeableness',0)} N:{bf.get('neuroticism',0)}\n"
            f"  决策风格: {p['decision_style']}\n"
            f"  背景: {p['background']}\n"
        )

    prompt = f"""你是一个团队组建顾问。根据以下 Agent 的人格特征，为每个人推荐一个最适合的团队角色。

角色选项：产品经理、技术架构师、前端开发、后端开发、测试工程师、UI/UX 设计师、数据分析师、市场研究员、技术写作、项目经理、DevOps 工程师、算法工程师、全栈开发

团队成员：
{profiles_text}

请为每个 Agent 返回一个 JSON 数组：
[{{"agent_id": "...", "role": "角色名", "reason": "一句话推荐理由"}}]

只返回 JSON 数组，不要其他文字。"""

    # 优先调 LLM 推荐，不可用时用 MBTI 规则兜底
    import asyncio

    llm_roles = None
    try:
        from api.agents import get_agent_factory
        from autogen_core.models import UserMessage

        factory = get_agent_factory()
        llm_client = factory.model_client

        result = await asyncio.wait_for(
            llm_client.create(
                messages=[UserMessage(content=prompt, source="user")],
            ),
            timeout=15.0,
        )
        response_text = result.content if hasattr(result, "content") else str(result)

        import re
        json_match = re.search(r"\[.*\]", response_text, re.DOTALL)
        if json_match:
            llm_roles = _json.loads(json_match.group())
        else:
            llm_roles = _json.loads(response_text)
    except Exception as e:
        logger.warning(f"LLM 角色推荐不可用，使用规则兜底: {e}")

    # LLM 返回了非数组（如 JSON 对象）→ 视为无效，走兜底
    if not isinstance(llm_roles, list):
        llm_roles = None

    # 规则兜底：MBTI → 角色映射
    if not llm_roles:
        mbti_role_map = {
            "INTJ": ("技术架构师", "INTJ 擅长系统思维和长期规划"),
            "INTP": ("算法工程师", "INTP 擅长抽象推理和逻辑分析"),
            "ENTJ": ("项目经理", "ENTJ 擅长领导统筹和战略决策"),
            "ENTP": ("产品经理", "ENTP 擅长创意发散和机会洞察"),
            "INFJ": ("技术写作", "INFJ 擅长深度理解和表达"),
            "INFP": ("UI/UX 设计师", "INFP 擅长共情和审美表达"),
            "ENFJ": ("产品经理", "ENFJ 擅长沟通协调和团队激励"),
            "ENFP": ("市场研究员", "ENFP 擅长探索新领域和用户共情"),
            "ISTJ": ("后端开发", "ISTJ 擅长严谨实现和流程遵循"),
            "ISFJ": ("测试工程师", "ISFJ 擅长细致检查和品质保障"),
            "ESTJ": ("DevOps 工程师", "ESTJ 擅长运维管理和效率优化"),
            "ESFJ": ("项目经理", "ESFJ 擅长协调资源和人际支持"),
            "ISTP": ("前端开发", "ISTP 擅长动手实践和即时调试"),
            "ISFP": ("UI/UX 设计师", "ISFP 擅长视觉表达和细节打磨"),
            "ESTP": ("全栈开发", "ESTP 擅长快速试错和多面手能力"),
            "ESFP": ("市场研究员", "ESFP 擅长现场感知和人脉拓展"),
        }
        llm_roles = []
        for p in agent_profiles:
            mbti = p.get("mbti", "")
            role, reason = mbti_role_map.get(
                mbti, ("全栈开发", "综合能力均衡，可胜任多种角色")
            )
            llm_roles.append({
                "agent_id": p["id"],
                "role": role,
                "reason": f"{reason}（规则推荐）",
            })

    # 验证结构
    validated = []
    for r in llm_roles:
        if isinstance(r, dict) and "agent_id" in r and "role" in r:
            validated.append({
                "agent_id": r["agent_id"],
                "role": r["role"],
                "reason": r.get("reason", ""),
            })
    return validated


# =============================================================================
# 内存 Team 执行注册表
# =============================================================================

_active_team_runs: dict[str, dict] = {}  # team_id → {engine, queue, plan_id, done, task}


def _cleanup_team_run(team_id: str):
    """清理 Team 执行注册表——释放内存。"""
    _active_team_runs.pop(team_id, None)


# =============================================================================
# 执行 + Plan（State 8 重写）
# =============================================================================


def _plan_execution_response(
    *,
    team_id: str,
    plan_id: str,
    task: str,
    steps: list[dict],
    world_id: str | None = None,
) -> dict:
    """Keep the full Plan response while also exposing the stable plan_id."""
    return {
        "id": plan_id,
        "plan_id": plan_id,
        "team_id": team_id,
        "task": task,
        "steps": steps,
        "status": "executing",
        "world_id": world_id,
    }


@router.post("/{team_id}/execute")
async def execute_team(
    team_id: str,
    db: AsyncSession = Depends(get_db),
):
    """启动 Team 执行——分解任务、创建 Plan、后台执行 Worker 步骤。"""

    # 前端重复点击或状态落库前的短暂窗口：复用同一次运行的 Plan。
    active_run = _active_team_runs.get(team_id)
    if active_run:
        active_engine = active_run["engine"]
        return _plan_execution_response(
            team_id=team_id,
            plan_id=active_run["plan_id"],
            task=active_run.get("task", ""),
            steps=active_engine._prepared_steps or [],
        )

    result = await db.execute(select(TeamRow).where(TeamRow.id == team_id))
    team_row = result.scalar_one_or_none()
    if not team_row:
        raise HTTPException(status_code=404, detail=f"Team {team_id!r} 不存在")

    if team_row.status == "executing":
        plan_result = await db.execute(
            select(PlanRow)
            .where(PlanRow.team_id == team_id)
            .where(PlanRow.status == "executing")
            .order_by(PlanRow.created_at.desc())
            .limit(1)
        )
        plan_row = plan_result.scalar_one_or_none()
        if plan_row:
            response = plan_row.to_dict()
            response["plan_id"] = plan_row.id
            return response
        team_row.status = "idle"

    if team_row.status not in ("idle", "finished"):
        raise HTTPException(status_code=400, detail=f"Team 状态为 {team_row.status}，无法启动")

    team = team_row.to_dict()
    task = team.get("description", "") or team.get("name", "")

    try:
        from api.agents import get_agent_factory
        model_client = get_agent_factory().model_client
    except Exception:
        model_client = None

    from engines.agent_factory.loader import AgentNotFoundError
    from engines.team.engine import TeamEngine

    # ── 预计算一次：后台 Worker 将直接消费这份 Plan ──
    engine = TeamEngine(team, db)
    try:
        plan_id = await engine.prepare(model_client)
    except AgentNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    event_queue: asyncio.Queue = asyncio.Queue()

    async def _run():
        from db import async_session as _async_session
        async with _async_session() as run_db:
            engine.db = run_db
            engine._agent_instances = {}
            logger.info(f"[Team] _run: switched to independent db session for team {team_id}")
            try:
                async for sse_str in engine.execute(model_client):
                    await event_queue.put(sse_str)
            except Exception as e:
                logger.error(f"[Team] execution error: {e}")
                import json as _json
                payload = _json.dumps({
                    "type": "team.error",
                    "data": {"error": str(e)},
                    "timestamp": "",
                }, ensure_ascii=False)
                await event_queue.put(f"data: {payload}\n\n")
            finally:
                await event_queue.put(None)
                await asyncio.sleep(5)
                _cleanup_team_run(team_id)

    _active_team_runs[team_id] = {
        "engine": engine,
        "queue": event_queue,
        "plan_id": plan_id,
        "done": False,
        "task": task,
    }

    asyncio.create_task(_run())

    logger.info(f"Team {team_id!r} execution started, plan={plan_id}")
    return _plan_execution_response(
        team_id=team_id,
        plan_id=plan_id,
        task=task,
        steps=engine._prepared_steps or [],
    )


@router.get("/{team_id}/stream")
async def stream_team(
    team_id: str,
    db: AsyncSession = Depends(get_db),
):
    """SSE 端点——前端 EventSource 连接此 URL，实时接收 Team 执行事件。"""
    result = await db.execute(select(TeamRow).where(TeamRow.id == team_id))
    team_row = result.scalar_one_or_none()
    if not team_row:
        raise HTTPException(status_code=404, detail=f"Team {team_id!r} 不存在")

    run_info = _active_team_runs.get(team_id)

    # 服务重启后执行中的 Team 没有活跃 run——从 DB 恢复 Plan 信息返回给前端
    if not run_info:
        if team_row.status == "executing":
            plan_result = await db.execute(
                select(PlanRow)
                .where(PlanRow.team_id == team_id)
                .order_by(PlanRow.created_at.desc())
                .limit(1)
            )
            plan_row = plan_result.scalar_one_or_none()
            if plan_row:
                plan = plan_row.to_dict()
                # 发送一个合成的 plan_created 事件让前端恢复状态
                event_queue: asyncio.Queue = asyncio.Queue()
                import json as _json
                payload = _json.dumps({
                    "type": "plan_created",
                    "data": {
                        "plan_id": plan["id"],
                        "task": plan.get("task", ""),
                        "total_steps": len(plan.get("steps", [])),
                        "steps": [
                            {"id": s.get("id", ""), "title": s.get("title", ""),
                             "assignee_id": s.get("assignee"), "assignee_name": s.get("assignee_name", "?"),
                             "description": s.get("description", "")}
                            for s in plan.get("steps", [])
                        ],
                    },
                    "timestamp": "",
                }, ensure_ascii=False)
                await event_queue.put(f"data: {payload}\n\n")
                if plan.get("report"):
                    report_payload = _json.dumps({
                        "type": "team_done",
                        "data": {
                            "total_duration_secs": 0,
                            "total_steps_completed": sum(1 for s in plan.get("steps", []) if s.get("status") == "done"),
                            "total_steps": len(plan.get("steps", [])),
                            "steps": [
                                {"step_title": s.get("title", ""), "success": s.get("status") == "done",
                                 "files": (s.get("result") or {}).get("files", []), "duration_secs": 0}
                                for s in plan.get("steps", [])
                            ],
                            "report": plan["report"],
                            "workspace_root": "",
                        },
                        "timestamp": "",
                    }, ensure_ascii=False)
                    await event_queue.put(f"data: {report_payload}\n\n")

                async def _restored_generator():
                    while True:
                        try:
                            event = await asyncio.wait_for(event_queue.get(), timeout=5.0)
                            if event is None:
                                break
                            yield event
                        except asyncio.TimeoutError:
                            break

                return StreamingResponse(
                    _restored_generator(),
                    media_type="text/event-stream",
                    headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
                )

        raise HTTPException(status_code=404, detail=f"Team {team_id!r} 没有活跃的执行")

    event_queue: asyncio.Queue = run_info["queue"]

    async def _event_generator():
        while True:
            try:
                event = await asyncio.wait_for(event_queue.get(), timeout=30.0)
                if event is None:
                    run_info["done"] = True
                    break
                yield event
            except asyncio.TimeoutError:
                yield f'data: {{"type":"heartbeat","data":{{}},"timestamp":""}}\n\n'

    return StreamingResponse(
        _event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


@router.get("/{team_id}/history")
async def get_team_history(
    team_id: str,
    db: AsyncSession = Depends(get_db),
):
    """获取 Team 的全部历史执行 Plan。"""
    result = await db.execute(
        select(PlanRow)
        .where(PlanRow.team_id == team_id)
        .order_by(PlanRow.created_at.desc())
    )
    rows = result.scalars().all()
    return [row.to_dict() for row in rows]


@router.get("/{team_id}/files/{file_path:path}")
async def get_team_file(
    team_id: str,
    file_path: str,
    db: AsyncSession = Depends(get_db),
):
    """读取 Team 工作区文件内容。"""
    result = await db.execute(select(TeamRow).where(TeamRow.id == team_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail=f"Team {team_id!r} 不存在")

    workspaces_root = Path.home() / "workspaces" / "teams" / team_id
    if not workspaces_root.exists():
        raise HTTPException(status_code=404, detail="Team 工作区不存在")

    run_dirs = sorted(workspaces_root.glob("run-*"), reverse=True)
    if not run_dirs:
        raise HTTPException(status_code=404, detail="没有找到 Team 执行记录")

    # 路径穿越检查——resolved 必须在 run_dir 内
    run_dir = run_dirs[0]
    resolved = (run_dir / file_path).resolve()
    if not str(resolved).startswith(str(run_dir.resolve())):
        raise HTTPException(status_code=403, detail="不允许访问工作区外的文件")
    if not resolved.exists() or not resolved.is_file():
        raise HTTPException(status_code=404, detail=f"文件 {file_path!r} 不存在")

    content = resolved.read_text(encoding="utf-8")
    return {"path": file_path, "content": content, "size": len(content)}


@router.get("/{team_id}/plan")
async def get_team_plan(
    team_id: str,
    db: AsyncSession = Depends(get_db),
):
    """获取 Team 的当前或最近一次 Plan。"""
    from models.plan_orm import PlanRow

    result = await db.execute(
        select(PlanRow)
        .where(PlanRow.team_id == team_id)
        .order_by(PlanRow.created_at.desc())
        .limit(1)
    )
    plan_row = result.scalar_one_or_none()
    if not plan_row:
        raise HTTPException(status_code=404, detail=f"Team {team_id!r} 还没有执行计划")
    return plan_row.to_dict()


@router.post("/{team_id}/evaluate")
async def evaluate_team(
    team_id: str,
    db: AsyncSession = Depends(get_db),
):
    """评估团队协作——LLM 分析 Plan 产出 + World 事件，给出评估报告。"""
    from models.plan_orm import PlanRow
    from models.event import Event

    # 获取最近的 Plan
    plan_result = await db.execute(
        select(PlanRow)
        .where(PlanRow.team_id == team_id)
        .order_by(PlanRow.created_at.desc())
        .limit(1)
    )
    plan_row = plan_result.scalar_one_or_none()
    if not plan_row:
        raise HTTPException(status_code=404, detail="该 Team 还没有执行记录")

    plan = plan_row.to_dict()
    report = plan.get("report") or {}
    steps = plan.get("steps") or []
    steps_total = len(steps)
    steps_done = sum(1 for step in steps if step.get("status") == "done")
    progress_pct = steps_done / steps_total if steps_total else 0.0

    # 获取 World 事件
    world_id = plan_row.world_id
    events_text = ""
    if world_id:
        evt_result = await db.execute(
            select(Event)
            .where(Event.world_id == world_id)
            .order_by(Event.tick, Event.created_at)
            .limit(30)
        )
        evts = evt_result.scalars().all()
        events_text = "\n".join(
            f"[{e.tick}] {e.type}: {e.description[:200]}"
            for e in evts
            if e.description
        )

    # LLM 评估
    prompt = f"""你是一个团队协作评估专家。请根据以下团队任务执行记录，给出简洁的评估。

任务：{plan.get('task', '')}
步骤完成：{steps_done}/{steps_total}

各步骤产出：
{report.get('content', '无')[:1500]}

关键事件：
{events_text[:2000]}

请用 200 字以内给出评估，包含：
1. 协作质量（1-10分）
2. 亮点
3. 改进建议

直接回复评估文本，不需要 JSON 格式。"""

    try:
        from api.agents import get_agent_factory
        from autogen_core.models import UserMessage
        import asyncio

        factory = get_agent_factory()
        result = await asyncio.wait_for(
            factory.model_client.create(
                messages=[UserMessage(content=prompt, source="evaluator")],
            ),
            timeout=20.0,
        )
        evaluation = result.content if hasattr(result, "content") else str(result)
        return {"evaluation": evaluation.strip()}
    except Exception as e:
        logger.warning(f"团队评估失败: {e}")
        # 兜底：基于数据的简单评估
        return {
            "evaluation": (
                f"【自动评估】\n"
                f"任务完成度：{steps_done}/{steps_total}（{int(progress_pct * 100)}%）\n"
                f"协作质量：因 LLM 不可用，无法给出详细评估。"
            )
        }


@router.get("/{team_id}/plan/history")
async def get_team_plan_history(
    team_id: str,
    db: AsyncSession = Depends(get_db),
):
    """获取 Team 的全部历史 Plan。"""
    from models.plan_orm import PlanRow

    result = await db.execute(
        select(PlanRow)
        .where(PlanRow.team_id == team_id)
        .order_by(PlanRow.created_at.desc())
    )
    rows = result.scalars().all()
    return [row.to_dict() for row in rows]


# ── 68: Team 打分 ──

class ScoreRequest(BaseModel):
    task: str = ""


@router.post("/{team_id}/score")
async def score_team(team_id: str, body: ScoreRequest, db: AsyncSession = Depends(get_db)):
    """对 Team 最新报告做 LLM 多维评分（8 维雷达图）。"""
    from models.team_orm import TeamRow
    from models.plan_orm import PlanRow
    from llm.client import create_model_client
    from engines.team.versus import score_team as _score

    result = await db.execute(select(TeamRow).where(TeamRow.id == team_id))
    team = result.scalar_one_or_none()
    if not team:
        raise HTTPException(404, "Team 不存在")

    plan_result = await db.execute(
        select(PlanRow)
        .where(PlanRow.team_id == team_id, PlanRow.status == "finished")
        .order_by(PlanRow.created_at.desc()).limit(1)
    )
    row = plan_result.scalar_one_or_none()
    report = row.to_dict().get("report") if row else {"content": "", "title": ""}
    task = body.task or row.to_dict().get("task", "") if row else ""

    client = create_model_client("think")
    return await _score(team.name, report, task, client)


# ── 68: Team 对抗 ──

class VersusRequest(BaseModel):
    team_a_id: str
    team_b_id: str
    task: str


@router.post("/versus")
async def team_versus(body: VersusRequest, db: AsyncSession = Depends(get_db)):
    """双 Team 对抗：LLM 多维评分 + 差异对比。"""
    from models.team_orm import TeamRow
    from models.plan_orm import PlanRow
    from llm.client import create_model_client
    from engines.team.versus import judge_versus

    teams_data = {}
    reports = {}
    for tid in [body.team_a_id, body.team_b_id]:
        r = await db.execute(select(TeamRow).where(TeamRow.id == tid))
        t = r.scalar_one_or_none()
        if not t:
            raise HTTPException(404, f"Team {tid} 不存在")
        teams_data[tid] = t.to_dict()
        pr = await db.execute(
            select(PlanRow)
            .where(PlanRow.team_id == tid, PlanRow.status == "finished")
            .order_by(PlanRow.created_at.desc()).limit(1)
        )
        prow = pr.scalar_one_or_none()
        reports[tid] = prow.to_dict().get("report") if prow else {"content": "", "title": ""}

    client = create_model_client("think")
    return await judge_versus(
        team_a=teams_data[body.team_a_id],
        team_b=teams_data[body.team_b_id],
        report_a=reports[body.team_a_id],
        report_b=reports[body.team_b_id],
        task=body.task,
        model_client=client,
    )


# ── 68: 学习曲线 ──

@router.get("/{team_id}/learning-curve")
async def get_learning_curve(team_id: str, db: AsyncSession = Depends(get_db)):
    """获取 Team 的学习曲线数据。"""
    from models.team_orm import TeamRow
    from models.plan_orm import PlanRow
    from engines.team.learning_curve import compute_learning_curve

    r = await db.execute(select(TeamRow).where(TeamRow.id == team_id))
    team = r.scalar_one_or_none()
    if not team:
        raise HTTPException(404, "Team 不存在")

    pr = await db.execute(
        select(PlanRow)
        .where(PlanRow.team_id == team_id)
        .order_by(PlanRow.created_at.asc())
    )
    plans = [row.to_dict() for row in pr.scalars().all()]
    return {"team_name": team.name, **compute_learning_curve(plans)}
