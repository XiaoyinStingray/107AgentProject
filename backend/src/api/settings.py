"""
Step 103: 用户可调参数 API。

GET  /api/settings  → 当前参数
PUT  /api/settings  → 更新参数（部分或全部）
POST /api/settings/reset → 恢复默认值
"""

from fastapi import APIRouter
from pydantic import BaseModel
from loguru import logger

from config import get_settings, save_user_settings, UserSettings

router = APIRouter(prefix="/api/settings", tags=["settings"])


class SettingsResponse(BaseModel):
    """当前用户参数（完整）。"""
    temperature_think: float
    temperature_act: float
    randomness_pct: float
    proactive_chat_interval_min: int
    idle_pause_minutes: int
    emotion_decay_seconds: int
    worker_max_steps: int
    worker_max_revisions: int
    worker_timeout_minutes: int


class SettingsUpdateRequest(BaseModel):
    """部分更新请求——所有字段可选。"""
    temperature_think: float | None = None
    temperature_act: float | None = None
    randomness_pct: float | None = None
    proactive_chat_interval_min: int | None = None
    idle_pause_minutes: int | None = None
    emotion_decay_seconds: int | None = None
    worker_max_steps: int | None = None
    worker_max_revisions: int | None = None
    worker_timeout_minutes: int | None = None


def _to_response(s: UserSettings) -> SettingsResponse:
    return SettingsResponse(**s.model_dump())


@router.get("", response_model=SettingsResponse)
async def get_current_settings():
    """获取当前用户参数（内存缓存 + 磁盘持久化）。"""
    return _to_response(get_settings())


@router.put("", response_model=SettingsResponse)
async def update_settings(body: SettingsUpdateRequest):
    """更新用户参数——只传需要改的字段，其余保持不变。"""
    current = get_settings()
    updates = body.model_dump(exclude_none=True)
    if not updates:
        return _to_response(current)

    # Fix: 通过构造新 UserSettings 重新校验 ge/le 约束
    merged_data = current.model_dump()
    merged_data.update(updates)
    merged = UserSettings(**merged_data)  # 触发 Pydantic 校验
    save_user_settings(merged)
    logger.info(f"[settings] 用户参数已更新: {list(updates.keys())}")
    return _to_response(merged)


@router.post("/reset", response_model=SettingsResponse)
async def reset_settings():
    """恢复所有参数为默认值。"""
    defaults = UserSettings()
    save_user_settings(defaults)
    logger.info("[settings] 用户参数已恢复默认")
    return _to_response(defaults)
