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
from models.bench_orm import BenchRun, BenchResult

router = APIRouter(prefix="/api/bench", tags=["bench"])


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
    """创建评测任务——后台异步执行标准套件。body: {api_key, base_url, model, name?}"""
    api_key = body.get("api_key", "")
    base_url = body.get("base_url", "")
    model = body.get("model", "")
    if not api_key or not base_url or not model:
        raise HTTPException(status_code=400, detail="api_key、base_url、model 必填")

    run_id = str(uuid.uuid4())
    name = body.get("name", f"{model} 评测")

    run = BenchRun(
        id=run_id, name=name,
        llm_api_key=api_key, llm_base_url=base_url, llm_model=model,
    )
    db.add(run)
    await db.commit()

    # 后台执行
    background_tasks.add_task(_execute_bench_run, run_id)
    logger.info(f"Bench run created: {run_id} ({model})")
    return {"id": run_id, "name": name, "status": "running"}


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

async def _execute_bench_run(run_id: str):
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
            await run_bench_suite(run_id, db, _make_client)
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
