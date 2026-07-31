"""Bench 进程重启恢复。

当前 Bench 任务运行在单进程 BackgroundTasks 中，进程退出后无法续跑。
应用启动时将遗留运行记录转为失败，避免僵尸任务和 API Key 残留。
"""

from loguru import logger
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from models.bench_orm import BenchRun


async def recover_interrupted_bench_runs(db: AsyncSession) -> int:
    """将进程重启前遗留的 running 评测标记为可清理的失败记录。"""
    try:
        result = await db.execute(
            select(BenchRun).where(BenchRun.status == "running")
        )
        interrupted_runs = result.scalars().all()

        for run in interrupted_runs:
            run.status = "failed"
            run.llm_api_key = ""
            run.report = (
                "执行中断：后端服务已重启，当前评测无法自动续跑。"
                f"已保留进度 {run.completed_tasks}/{run.total_tasks}，请重新发起评测。"
            )

        if interrupted_runs:
            await db.commit()
            logger.warning(
                f"Recovered {len(interrupted_runs)} interrupted Bench run(s)"
            )
        return len(interrupted_runs)
    except SQLAlchemyError:
        await db.rollback()
        logger.exception("Failed to recover interrupted Bench runs")
        raise
