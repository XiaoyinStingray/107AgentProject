"""
配置管理 — 从 .env 读取，pydantic-settings 校验
"""

from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    model_config = {
        "env_file": str(Path(__file__).parents[2] / ".env"),
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }

    # === API ===
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    debug: bool = False

    # === LLM ===
    llm_api_key: str = ""
    llm_base_url: str = "https://api.deepseek.com/v1"
    llm_model: str = "deepseek-v4-flash"
    llm_thinking_enabled: bool = False
    llm_temperature_think: float = 0.8
    llm_temperature_act: float = 0.5
    llm_max_tokens: int = 4096

    # === 数据库 ===
    database_url: str = "sqlite+aiosqlite:///./backend/data/lifelab.db"

    # === Agent 限制 ===
    max_ticks_per_simulation: int = 100
    max_agents_per_world: int = 8
    max_agents: int = 25
    max_worlds: int = 45
    agent_timeout_seconds: int = 30


settings = Settings()


def ensure_dirs() -> None:
    """确保运行时需要的目录存在。在应用启动时调用，不在 import 时执行。"""
    _data_dir = Path("backend/data")
    _data_dir.mkdir(parents=True, exist_ok=True)
