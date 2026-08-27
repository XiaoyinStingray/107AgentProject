"""
配置管理 — 从 .env 读取，pydantic-settings 校验
"""

import sys
from pathlib import Path
from pydantic_settings import BaseSettings


# ── PyInstaller 打包感知路径 ─────────────────────────────────────────────
# frozen 模式（exe）：代码在 _MEIPASS 临时目录，用户数据在 exe 同级目录
# 开发模式：一切相对于项目根目录
#
# 注意：sys.frozen / sys._MEIPASS 是 PyInstaller 运行时注入的属性，
# 类型检查器不可见，统一用 getattr() 安全访问，避免 IDE 报错。
_FROZEN: bool = bool(getattr(sys, 'frozen', False))
_MEIPASS: str = getattr(sys, '_MEIPASS', '')

PROJECT_ROOT = Path(__file__).resolve().parents[2]

if _FROZEN and _MEIPASS:
    # 打包后的代码根目录（_MEIPASS 临时解压目录）
    PROJECT_ROOT = Path(_MEIPASS)
    # 用户可写数据目录：exe 所在目录（持久化）
    _DATA_DIR = Path(sys.executable).parent / "data"
else:
    _DATA_DIR = PROJECT_ROOT / "backend" / "data"

# .env 文件位置：开发时项目根目录，打包后 exe 同级目录
if _FROZEN:
    ENV_FILE = Path(sys.executable).parent / ".env"
else:
    ENV_FILE = PROJECT_ROOT / ".env"

DATA_DIR = _DATA_DIR
DATABASE_PATH = DATA_DIR / "lifelab.db"
SEED_DATABASE_PATH = PROJECT_ROOT / "backend" / "data" / "seed.db"
USER_SETTINGS_PATH = DATA_DIR / "user_settings.json"
DEFAULT_DATABASE_URL = f"sqlite+aiosqlite:///{DATABASE_PATH.as_posix()}"


def _resolve_relative_sqlite_url(url: str) -> str:
    """Resolve local SQLite URLs from the project root, never the launch directory."""
    prefixes = ("sqlite+aiosqlite:///", "sqlite:///")
    for prefix in prefixes:
        if not url.startswith(prefix):
            continue
        raw_path = url[len(prefix):]
        if raw_path == ":memory:":
            return url
        path = Path(raw_path)
        if not path.is_absolute():
            path = (PROJECT_ROOT / path).resolve()
        return f"{prefix}{path.as_posix()}"
    return url


class Settings(BaseSettings):
    model_config = {
        "env_file": str(ENV_FILE),
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
    database_url: str = DEFAULT_DATABASE_URL

    # === Agent 限制 ===
    max_ticks_per_simulation: int = 100
    max_agents_per_world: int = 8
    max_agents: int = 25
    max_worlds: int = 45
    agent_timeout_seconds: int = 30


settings = Settings()
settings.database_url = _resolve_relative_sqlite_url(settings.database_url)


# ── Step 103: 用户可调参数 ──

from pydantic import BaseModel, Field
import json as _json

_USER_SETTINGS_PATH = USER_SETTINGS_PATH


class UserSettings(BaseModel):
    """用户可调的运行时参数。通过 API 读写，localStorage 前端缓存。"""

    # Agent 决策
    temperature_think: float = Field(default=0.8, ge=0.1, le=1.5,
        description="思考深度——低=更确定，高=更多样")
    temperature_act: float = Field(default=0.5, ge=0.1, le=1.5,
        description="执行温度——低=更精确，高=更灵活")
    randomness_pct: float = Field(default=5.0, ge=0.0, le=30.0,
        description="决策随机性——Agent 偶尔做反常选择的概率(%)")

    # M11 场景
    proactive_chat_interval_min: int = Field(default=6, ge=1, le=30,
        description="主动搭话间隔(分钟)")
    idle_pause_minutes: int = Field(default=5, ge=1, le=60,
        description="空闲暂停时间(分钟)")
    emotion_decay_seconds: int = Field(default=15, ge=5, le=60,
        description="情绪衰减间隔(秒)")

    # M12 Worker
    worker_max_steps: int = Field(default=30, ge=5, le=50,
        description="Worker 最大步数")
    worker_max_revisions: int = Field(default=3, ge=1, le=10,
        description="自我修正次数上限")
    worker_timeout_minutes: int = Field(default=15, ge=5, le=30,
        description="Worker 全局超时(分钟)")


_user_settings: UserSettings | None = None


def get_settings() -> UserSettings:
    """获取用户可调参数单例（从磁盘加载，无则用默认值）。"""
    global _user_settings
    if _user_settings is None:
        _user_settings = _load_user_settings()
    return _user_settings


def save_user_settings(s: UserSettings) -> None:
    """保存用户参数到磁盘 + 更新内存单例。"""
    global _user_settings
    _user_settings = s
    _USER_SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    _USER_SETTINGS_PATH.write_text(s.model_dump_json(indent=2), encoding="utf-8")


def _load_user_settings() -> UserSettings:
    """从磁盘加载用户参数，文件不存在或损坏则返回默认值。"""
    try:
        if _USER_SETTINGS_PATH.exists():
            data = _json.loads(_USER_SETTINGS_PATH.read_text(encoding="utf-8"))
            return UserSettings(**data)
    except Exception:
        pass
    return UserSettings()


def ensure_dirs() -> None:
    """确保运行时需要的目录存在。在应用启动时调用，不在 import 时执行。"""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
