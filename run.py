"""
Life Lab — 一键启动脚本
用法: python run.py
      python run.py --reload
      python run.py --port 9000
"""

import sys
from pathlib import Path

# 确保 backend/src/ 在 sys.path 上（所有模块用绝对 import 的依赖）
_src = Path(__file__).resolve().parent / "backend" / "src"
sys.path.insert(0, str(_src))

import uvicorn


if __name__ == "__main__":
    import argparse
    from config import settings  # pyright: ignore[reportMissingImports]  # noqa: E402

    parser = argparse.ArgumentParser()
    parser.add_argument("--reload", action="store_true")
    parser.add_argument("--port", type=int, default=settings.api_port)
    args = parser.parse_args()

    uvicorn.run(
        "main:app",
        host=settings.api_host,
        port=args.port,
        reload=args.reload or settings.debug,
    )
