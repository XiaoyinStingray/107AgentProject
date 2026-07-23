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
    """创建所有未存在的表（启动时调用一次）"""
    import models.memory   # noqa: F401 — 注册 Memory ORM → memories 表
    import models.event    # noqa: F401 — 注册 Event ORM → events 表
    import models.agent_orm  # noqa: F401 — 注册 Agent ORM → agents 表
    import models.world_orm  # noqa: F401 — 注册 World ORM → worlds 表

    async with _get_engine().begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables ensured (SQLite)")


def reset_db_state():
    """重置引擎和会话工厂（测试用）。"""
    global _engine, _async_session_factory
    _engine = None
    _async_session_factory = None
