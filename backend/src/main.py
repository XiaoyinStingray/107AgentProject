"""
Life Lab — 人生实验室
FastAPI 应用入口
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

from config import ensure_dirs
from db import init_db
from api.agents import router as agents_router
from api.sse import sse_router
from api.worlds import router as worlds_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用启动/关闭时的生命周期管理"""
    logger.info("Starting Life Lab...")
    ensure_dirs()
    await init_db()
    logger.info("Life Lab ready")
    yield
    logger.info("Shutting down Life Lab")


app = FastAPI(
    title="Life Lab API",
    version="0.1.0",
    description="Agent 社会实验平台 — 后端 API",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── API 路由 ──────────────────────────────────────────────────────────────────
app.include_router(agents_router)
app.include_router(worlds_router)
app.include_router(sse_router)


@app.get("/health")
async def health():
    return {"status": "ok", "version": "0.1.0"}
