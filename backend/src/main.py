"""
Life Lab — 人生实验室
FastAPI 应用入口
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

from config import ensure_dirs
from db import async_session, init_db
from api.agents import router as agents_router
from api.arenas import router as arenas_router
from api.export import router as export_router
from api.narratives import router as narratives_router
from api.simulations import router as simulations_router
from api.sse import sse_router
from api.scenarios import router as scenarios_router
from api.templates import router as templates_router
from api.worlds import router as worlds_router
from api.achievements import router as achievements_router
from api.teams import router as teams_router
from api.market import router as market_router
from api.bench import router as bench_router
from api.scenes import router as scenes_router
from api.workers import router as workers_router
from api.pipelines import router as pipelines_router
from api.settings import router as settings_router
from engines.bench.recovery import recover_interrupted_bench_runs
from llm.errors import register_llm_error_middleware


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用启动/关闭时的生命周期管理"""
    logger.info("Starting Life Lab...")
    ensure_dirs()
    await init_db()
    async with async_session() as db:
        await recover_interrupted_bench_runs(db)

    # Phase 26: 恢复历史 Worker + 启动调度器
    from api.workers import _restore_workers_from_disk
    await _restore_workers_from_disk()
    from engines.worker.scheduler import get_scheduler
    scheduler = get_scheduler()
    await scheduler.start()
    logger.info("Life Lab ready (scheduler active, workers restored)")

    yield

    logger.info("Shutting down Life Lab")
    await scheduler.stop()


app = FastAPI(
    title="Life Lab API",
    version="0.1.0",
    description="Agent 社会实验平台 — 后端 API",
    lifespan=lifespan,
)

register_llm_error_middleware(app)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── API 路由 ──────────────────────────────────────────────────────────────────
app.include_router(agents_router)
app.include_router(worlds_router)
app.include_router(scenarios_router)
app.include_router(templates_router)
app.include_router(narratives_router)
app.include_router(arenas_router)
app.include_router(simulations_router)
app.include_router(sse_router)
app.include_router(export_router)
app.include_router(achievements_router)
app.include_router(teams_router)
app.include_router(market_router)
app.include_router(bench_router)
app.include_router(scenes_router)
app.include_router(workers_router)
app.include_router(pipelines_router)
app.include_router(settings_router)


@app.post("/api/reset-db")
async def reset_database():
    """清空数据库——删除 lifelab.db，创建全新空白数据库。"""
    import shutil
    from pathlib import Path
    target = Path("backend/data/lifelab.db")
    try:
        if target.exists():
            target.unlink()
        # 创建一个空的 SQLite 数据库
        import sqlite3
        conn = sqlite3.connect(str(target))
        conn.close()
        return {"ok": True, "message": "数据库已清空"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.get("/health")
async def health():
    from config import settings
    return {
        "status": "ok", "version": "0.1.0",
        "has_llm_key": bool(settings.llm_api_key),
        "agent_count": 0,  # 前端可据此判断是否需要种子数据
    }


@app.get("/api/status")
async def system_status():
    """系统状态：LLM 配置、Agent 数量、是否需要初始化。"""
    from config import settings
    from db import async_session
    try:
        async with async_session() as s:
            from sqlalchemy import text
            r = await s.execute(text("SELECT COUNT(*) FROM agents"))
            agent_count = r.scalar() or 0
    except Exception:
        agent_count = 0
    return {
        "has_llm_key": bool(settings.llm_api_key),
        "llm_model": settings.llm_model,
        "agent_count": agent_count,
        "needs_seed": agent_count == 0,
    }


@app.post("/api/seed")
async def seed_database(keep_existing: bool = False):
    """种子数据：将预置数据库复制为用户数据库。
    keep_existing=true → 保留当前数据，仅追加种子。
    keep_existing=false → 清空后替换为种子。
    """
    import shutil
    from pathlib import Path

    seed_path = Path("backend/data/seed.db")
    target_path = Path("backend/data/lifelab.db")

    if not seed_path.exists():
        return {"ok": False, "error": "种子数据库不存在，请联系开发者"}

    try:
        if not keep_existing:
            shutil.copy2(seed_path, target_path)
            return {"ok": True, "mode": "replace", "message": "已替换为预置数据库"}
        else:
            # 追加模式：将种子中不存在的记录插入
            import sqlite3
            seed_conn = sqlite3.connect(str(seed_path))
            target_conn = sqlite3.connect(str(target_path))

            tables = [r[0] for r in seed_conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_%'"
            ).fetchall()]

            inserted = {}
            for table in tables:
                try:
                    seed_rows = seed_conn.execute(f"SELECT * FROM \"{table}\"").fetchall()
                    seed_cols = [c[1] for c in seed_conn.execute(f"PRAGMA table_info(\"{table}\")").fetchall()]
                    existing_ids = {r[0] for r in target_conn.execute(f"SELECT id FROM \"{table}\"").fetchall()} if 'id' in seed_cols else set()

                    new_rows = [r for r in seed_rows if r[0] not in existing_ids] if 'id' in seed_cols else []
                    if new_rows:
                        placeholders = ','.join(['?' for _ in seed_cols])
                        cols_str = ','.join(f'\"{c}\"' for c in seed_cols)
                        target_conn.executemany(
                            f"INSERT OR IGNORE INTO \"{table}\" ({cols_str}) VALUES ({placeholders})",
                            new_rows
                        )
                        inserted[table] = len(new_rows)
                except Exception:
                    pass

            target_conn.commit()
            seed_conn.close()
            target_conn.close()
            return {"ok": True, "mode": "append", "inserted": inserted}

    except Exception as e:
        return {"ok": False, "error": str(e)}