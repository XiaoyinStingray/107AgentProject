"""
Team 路由 — CRUD + 角色推荐 API。
Step 51: 为 Agent Team 模块提供数据层。
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from loguru import logger
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_db
from models.team_orm import TeamRow
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
# 执行 + Plan（Step 52）
# =============================================================================


@router.post("/{team_id}/execute")
async def execute_team(
    team_id: str,
    db: AsyncSession = Depends(get_db),
):
    """启动 Team 执行——分解任务、创建 Plan、创建临时 World。"""
    from engines.team.engine import TeamEngine
    from models.plan_orm import PlanRow

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
            return plan_row.to_dict()
        raise HTTPException(status_code=400, detail="Team 正在执行中但 Plan 丢失")

    if team_row.status not in ("idle", "finished"):
        raise HTTPException(
            status_code=400,
            detail=f"Team 状态为 {team_row.status}，无法启动"
        )

    team = team_row.to_dict()

    try:
        from api.agents import get_agent_factory
        model_client = get_agent_factory().model_client
    except Exception:
        model_client = None

    engine = TeamEngine(team, db)
    plan = await engine.execute(model_client)

    logger.info(f"Team {team_id!r} execution started: plan={plan['id']}")
    return plan


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
