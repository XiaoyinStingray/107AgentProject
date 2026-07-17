"""
数据库 — SQLite + aiosqlite + SQLAlchemy async
P0 零外部依赖，SQLite 单文件
"""

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from loguru import logger
from config import settings

# === 异步引擎 ===
engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,
    connect_args={"check_same_thread": False},  # SQLite 允许多线程
)

# === 会话工厂 ===
async_session = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


# === ORM 声明基类 ===
class Base(DeclarativeBase):
    """所有 ORM 模型继承此类。后续 Phase 逐步添加表定义。"""
    pass


# === 依赖注入 ===
async def get_db() -> AsyncSession:
    """FastAPI Depends 用——每个请求一个 session。
    async with 上下文管理器已自动管理 session 生命周期（commit/rollback/close）。
    """
    async with async_session() as session:
        yield session


# === 初始化 ===
async def init_db():
    """创建所有未存在的表（启动时调用一次）"""
    # 确保所有 ORM 子类在 create_all 前被 import ——
    # SQLAlchemy DeclarativeBase 只在子类 import 时注册到 metadata。
    # 放在函数内避免 db.py 与 models.memory 的循环 import。
    import models.memory  # noqa: F401 — 触发 Memory ORM 的 __init_subclass__ 注册

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables ensured (SQLite)")
