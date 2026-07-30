"""
Bench API — LLM 评测端点。
Step 58: 创建评测任务 + 查询结果 + 报告。
"""

import asyncio
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from loguru import logger
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_db
from models.bench_orm import BenchRun, BenchResult, BenchTemplate

router = APIRouter(prefix="/api/bench", tags=["bench"])


# ── 69: 模板 CRUD ──

@router.get("/templates")
async def list_templates(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(BenchTemplate).order_by(BenchTemplate.created_at.desc()))
    return [r.to_dict() for r in result.scalars().all()]


@router.post("/templates", status_code=201)
async def create_template(body: dict, db: AsyncSession = Depends(get_db)):
    import json as _json
    tpl = BenchTemplate(
        id=str(uuid.uuid4()),
        name=body.get("name", "未命名模板"),
        agents_json=_json.dumps(body.get("agents", []), ensure_ascii=False),
        scenarios_json=_json.dumps(body.get("scenarios", []), ensure_ascii=False),
        repeats=body.get("repeats", 3),
    )
    db.add(tpl)
    await db.commit()
    return tpl.to_dict()


@router.delete("/templates/{tpl_id}", status_code=204)
async def delete_template(tpl_id: str, db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(BenchTemplate).where(BenchTemplate.id == tpl_id))
    tpl = r.scalar_one_or_none()
    if tpl:
        await db.delete(tpl)
        await db.commit()
    return None


@router.post("/test-api")
async def test_api(body: dict):
    """测试 LLM API 连通性——发送一条简单消息，返回耗时和响应。"""
    api_key = body.get("api_key", "")
    base_url = body.get("base_url", "")
    model = body.get("model", "")
    if not api_key or not base_url or not model:
        raise HTTPException(status_code=400, detail="api_key、base_url、model 必填")

    try:
        from autogen_ext.models.openai import OpenAIChatCompletionClient
        from autogen_core.models import UserMessage
        client = OpenAIChatCompletionClient(
            model=model, api_key=api_key, base_url=base_url,
            model_info={"vision": False, "function_calling": True, "json_output": True,
                        "family": "unknown", "structured_output": False},
        )
        start = time.time()
        result = await asyncio.wait_for(
            client.create(messages=[UserMessage(content="回复 OK", source="test")]),
            timeout=10.0,
        )
        elapsed = time.time() - start
        text = result.content if hasattr(result, "content") else str(result)
        return {"ok": True, "elapsed": round(elapsed, 2), "response": text[:100]}
    except Exception as e:
        return {"ok": False, "error": str(e)[:200]}


@router.post("/runs", status_code=201)
async def create_bench_run(
    body: dict,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """创建评测任务。支持自定义套件：{api_key, base_url, model, agents?, scenarios?, repeats?, template_id?, name?}"""
    api_key = body.get("api_key", "")
    base_url = body.get("base_url", "")
    model = body.get("model", "")
    if not api_key or not base_url or not model:
        raise HTTPException(status_code=400, detail="api_key、base_url、model 必填")

    run_id = str(uuid.uuid4())
    name = body.get("name", f"{model} 评测")

    # 69: 加载模板或自定义配置
    custom_agents = body.get("agents")
    custom_scenarios = body.get("scenarios")
    repeats = body.get("repeats")

    tpl_id = body.get("template_id")
    if tpl_id:
        r = await db.execute(select(BenchTemplate).where(BenchTemplate.id == tpl_id))
        tpl = r.scalar_one_or_none()
        if tpl:
            import json as _json
            custom_agents = _json.loads(tpl.agents_json) if tpl.agents_json else None
            custom_scenarios = _json.loads(tpl.scenarios_json) if tpl.scenarios_json else None
            repeats = tpl.repeats

    run = BenchRun(
        id=run_id, name=name,
        llm_api_key=api_key, llm_base_url=base_url, llm_model=model,
    )
    if custom_agents or custom_scenarios:
        total = (len(custom_agents or []) or 3) * (len(custom_scenarios or []) or 3) * (repeats or 3)
        run.total_tasks = total
    db.add(run)
    await db.commit()

    background_tasks.add_task(_execute_bench_run, run_id, custom_agents, custom_scenarios, repeats)
    logger.info(f"Bench run created: {run_id} ({model}) total={run.total_tasks}")
    return {"id": run_id, "name": name, "status": "running", "total_tasks": run.total_tasks}


@router.get("/runs")
async def list_bench_runs(db: AsyncSession = Depends(get_db)):
    """列出所有评测记录。"""
    result = await db.execute(
        select(BenchRun).order_by(BenchRun.created_at.desc())
    )
    rows = result.scalars().all()
    return [r.to_dict() for r in rows]


@router.get("/runs/{run_id}")
async def get_bench_run(run_id: str, db: AsyncSession = Depends(get_db)):
    """获取单次评测详情 + 所有子结果。"""
    result = await db.execute(select(BenchRun).where(BenchRun.id == run_id))
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="评测不存在")

    data = run.to_dict()
    # 附带子结果
    sub = await db.execute(
        select(BenchResult).where(BenchResult.run_id == run_id).order_by(BenchResult.created_at)
    )
    data["results"] = [r.to_dict() for r in sub.scalars().all()]
    return data


@router.delete("/runs/{run_id}", status_code=204)
async def delete_bench_run(run_id: str, db: AsyncSession = Depends(get_db)):
    """删除评测记录及所有子结果。"""
    result = await db.execute(select(BenchRun).where(BenchRun.id == run_id))
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="评测不存在")
    if run.status == "running":
        raise HTTPException(
            status_code=409,
            detail="运行中的评测不可删除，请等待完成",
        )
    await db.execute(delete(BenchResult).where(BenchResult.run_id == run_id))
    await db.execute(delete(BenchRun).where(BenchRun.id == run_id))
    await db.commit()
    return None


@router.get("/runs/{run_id}/report")
async def get_bench_report(run_id: str, db: AsyncSession = Depends(get_db)):
    """获取评测分析报告。"""
    result = await db.execute(select(BenchRun).where(BenchRun.id == run_id))
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="评测不存在")
    return {"report": run.report or "", "scores": run.to_dict().get("scores")}


# ── 后台执行 ──────────────────────────────────────────

# ── 69: 分场景雷达 ──

@router.get("/runs/{run_id}/by-scenario")
async def get_bench_by_scenario(run_id: str, db: AsyncSession = Depends(get_db)):
    """按场景分组返回雷达数据。"""
    r = await db.execute(select(BenchRun).where(BenchRun.id == run_id))
    run = r.scalar_one_or_none()
    if not run:
        raise HTTPException(404, "评测不存在")

    sub = await db.execute(
        select(BenchResult).where(BenchResult.run_id == run_id).order_by(BenchResult.created_at)
    )
    results = [s.to_dict() for s in sub.scalars().all()]

    by_scenario: dict[str, list] = {}
    for item in results:
        sc = item.get("scenario", "unknown")
        if item.get("scores"):
            by_scenario.setdefault(sc, []).append(item["scores"])

    scenarios = {}
    for sc, scores_list in by_scenario.items():
        from engines.bench.metrics import aggregate_scores
        scenarios[sc] = aggregate_scores(scores_list)

    return {"run_id": run_id, "model": run.llm_model, "scenarios": scenarios}


# ── 69: 取消评测 ──

@router.post("/runs/{run_id}/cancel")
async def cancel_bench_run(run_id: str, db: AsyncSession = Depends(get_db)):
    """取消运行中的评测。"""
    r = await db.execute(select(BenchRun).where(BenchRun.id == run_id))
    run = r.scalar_one_or_none()
    if not run:
        raise HTTPException(404, "评测不存在")
    if run.status != "running":
        raise HTTPException(400, "只有运行中的评测可以取消")
    run.status = "cancelled"
    await db.commit()
    return {"ok": True}


async def _execute_bench_run(
    run_id: str,
    custom_agents: list | None = None,
    custom_scenarios: list | None = None,
    repeats: int | None = None,
):
    """后台异步执行评测套件。"""
    from db import async_session
    from engines.bench.scheduler import run_bench_suite

    def _make_client(api_key: str, base_url: str, model: str):
        from autogen_ext.models.openai import OpenAIChatCompletionClient
        return OpenAIChatCompletionClient(
            model=model, api_key=api_key, base_url=base_url,
            model_info={"vision": False, "function_calling": True, "json_output": True,
                        "family": "unknown", "structured_output": False},
        )

    try:
        async with async_session() as db:
            await run_bench_suite(run_id, db, _make_client, custom_agents, custom_scenarios, repeats)
    except Exception as e:
        logger.error(f"Bench run {run_id} failed: {e}")
        async with async_session() as db:
            result = await db.execute(select(BenchRun).where(BenchRun.id == run_id))
            run = result.scalar_one_or_none()
            if run:
                run.status = "failed"
                run.report = f"执行失败: {e}"
                run.llm_api_key = ""
                await db.commit()
