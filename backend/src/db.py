"""
数据库 — SQLite + aiosqlite + SQLAlchemy async
P0 零外部依赖，SQLite 单文件

引擎和会话工厂采用延迟初始化（首次访问时创建），
确保测试可以在 import 后覆盖 settings.database_url。
"""

from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from loguru import logger
from config import settings

# === 延迟初始化（首次访问时创建，避免 import 时绑定 event loop） ===
_engine = None
_async_session_factory = None


def _get_engine():
    """获取异步引擎（首次调用时创建）。"""
    global _engine
    if _engine is None:
        _engine = create_async_engine(
            settings.database_url,
            echo=settings.debug,
            connect_args={"check_same_thread": False},
        )
    return _engine


def _get_session_factory():
    """获取会话工厂（首次调用时创建）。"""
    global _async_session_factory
    if _async_session_factory is None:
        _async_session_factory = async_sessionmaker(
            _get_engine(),
            class_=AsyncSession,
            expire_on_commit=False,
        )
    return _async_session_factory


# === 兼容接口：async_session() 调用 ===
class _LazySession:
    """延迟代理——调用 async_session() 时动态获取最新的 session factory。"""

    def __call__(self, **kwargs):
        return _get_session_factory()(**kwargs)

    def __getattr__(self, name):
        return getattr(_get_session_factory(), name)


async_session = _LazySession()


# === ORM 声明基类 ===
class Base(DeclarativeBase):
    """所有 ORM 模型继承此类。后续 Phase 逐步添加表定义。"""
    pass


# === 依赖注入 ===
async def get_db():
    """FastAPI Depends 用——每个请求一个 session。"""
    factory = _get_session_factory()
    async with factory() as session:
        yield session


# === 初始化 ===
async def init_db():
    """创建所有未存在的表 + 增量迁移（启动时调用一次）"""
    import models.memory   # noqa: F401 — 注册 Memory ORM → memories 表
    import models.event    # noqa: F401 — 注册 Event ORM → events 表
    import models.agent_orm  # noqa: F401 — 注册 Agent ORM → agents 表
    import models.world_orm  # noqa: F401 — 注册 World ORM → worlds 表
    import models.scenario_orm  # noqa: F401 — 注册 Scenario ORM → custom_scenarios 表
    import models.arena_orm  # noqa: F401 — 注册 Arena ORM → arenas 表
    import models.simulation_orm  # noqa: F401 — 注册 Simulation ORM → simulations 表
    import models.intervention_orm  # noqa: F401 — 注册 Intervention ORM → interventions 表
    import models.team_orm  # noqa: F401 — 注册 Team ORM → teams 表
    import models.plan_orm  # noqa: F401 — 注册 Plan ORM → plans 表
    import models.market_orm  # noqa: F401 — 注册 Market ORM → market_items 表
    import models.bench_orm  # noqa: F401 — 注册 Bench ORM → bench_runs + bench_results 表
    import models.checkpoint_orm  # noqa: F401 — 注册 Checkpoint ORM → checkpoints 表

    async with _get_engine().begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # ── 增量迁移：为已有表添加缺失列 ──
    from sqlalchemy import text as _text
    async with _get_engine().connect() as conn:
        # 2026-07-24: worlds 表加 world_type 列
        try:
            await conn.execute(_text("ALTER TABLE worlds ADD COLUMN world_type VARCHAR DEFAULT 'group'"))
        except Exception:
            pass  # 列已存在，忽略
        await conn.commit()

        # 2026-07-27: plans 表加 report 列
        try:
            await conn.execute(_text("ALTER TABLE plans ADD COLUMN report TEXT"))
        except Exception:
            pass
        await conn.commit()

        # BUG-014: 修正历史 World——单 Agent → solo
        import json as _json
        result = await conn.execute(
            _text("SELECT id, agent_ids_json FROM worlds WHERE world_type = 'group'")
        )
        rows = result.fetchall()
        fixed = 0
        for row in rows:
            try:
                agent_ids = _json.loads(row[1])
                if len(agent_ids) == 1:
                    await conn.execute(
                        _text("UPDATE worlds SET world_type = 'solo' WHERE id = :id"),
                        {"id": row[0]},
                    )
                    fixed += 1
            except Exception:
                pass
        if fixed:
            await conn.commit()
            logger.info(f"BUG-014: fixed {fixed} old worlds (world_type group→solo)")

        # BUG-025: Team 创建的 World 使用 world_type='group' → 修正为 'team'
        result = await conn.execute(
            _text("SELECT id, name FROM worlds WHERE world_type = 'group' AND name LIKE 'Team: %'")
        )
        team_rows = result.fetchall()
        team_fixed = 0
        for row in team_rows:
            await conn.execute(
                _text("UPDATE worlds SET world_type = 'team' WHERE id = :id"),
                {"id": row[0]},
            )
            team_fixed += 1
        if team_fixed:
            await conn.commit()
            logger.info(f"BUG-025: fixed {team_fixed} old Team worlds (world_type group→team)")

    logger.info("Database tables ensured (SQLite)")


def reset_db_state():
    """重置引擎和会话工厂（测试用）。"""
    global _engine, _async_session_factory
    _engine = None
    _async_session_factory = None
