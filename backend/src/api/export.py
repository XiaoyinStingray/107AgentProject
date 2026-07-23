"""
报告导出 API — 将模拟事件生成 Markdown / JSON 研究报告。

路由:
    GET /api/export/report/{world_id}   导出 Markdown 报告（文件下载）
    GET /api/export/report/{world_id}/json  导出 JSON 报告
"""

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from loguru import logger

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_db
from api.sse import _active_worlds
from models.agent_orm import AgentRow
from models.event import SimEvent
from models.world_orm import WorldRow

router = APIRouter(prefix="/api/export", tags=["export"])


# =============================================================================
# 报告生成
# =============================================================================


def build_report_markdown(
    world_id: str,
    world_name: str,
    events: list[SimEvent],
    agent_names: dict[str, str],
    scenario_name: str = "",
) -> str:
    """将模拟事件列表转为结构化 Markdown 研究报告。

    Args:
        world_id: 世界 ID
        world_name: 世界名称
        events: 该世界的所有 SimEvent
        agent_names: {agent_id: agent_name} 映射
        scenario_name: 场景名称

    Returns:
        完整的 Markdown 报告字符串
    """
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    # 按类型分组统计
    type_counts: dict[str, int] = {}
    for e in events:
        type_counts[e.type] = type_counts.get(e.type, 0) + 1

    # 计算 tick 范围
    ticks = [e.tick for e in events]
    min_tick = min(ticks) if ticks else 0
    max_tick = max(ticks) if ticks else 0

    # 构建报告
    lines: list[str] = []
    lines.append(f"# 实验报告：{world_name}")
    lines.append("")
    lines.append(f"> 生成时间：{now}")
    lines.append(f"> 世界 ID：`{world_id}`")
    if scenario_name:
        lines.append(f"> 场景：{scenario_name}")
    lines.append("")

    # 摘要
    lines.append("## 摘要")
    lines.append("")
    lines.append(f"- **总事件数**：{len(events)}")
    lines.append(f"- **Tick 范围**：{min_tick} ~ {max_tick}（共 {max_tick - min_tick + 1} 轮）")
    lines.append(f"- **参与 Agent**：{len(agent_names)} 个")

    if type_counts:
        lines.append("- **事件分布**：")
        for t, c in sorted(type_counts.items(), key=lambda x: -x[1]):
            lines.append(f"  - {t}：{c}")
    lines.append("")

    # Agent 列表
    lines.append("## 参与 Agent")
    lines.append("")
    for aid, name in agent_names.items():
        agent_events = [e for e in events if e.source_agent_id == aid]
        lines.append(f"- **{name}** (`{aid[:8]}...`) — {len(agent_events)} 条事件")
    lines.append("")

    # 事件时间线
    lines.append("## 事件时间线")
    lines.append("")

    current_tick = -1
    for e in sorted(events, key=lambda x: (x.tick, x.created_at)):
        if e.tick != current_tick:
            current_tick = e.tick
            lines.append(f"### Tick {current_tick}")
            lines.append("")

        agent_label = agent_names.get(e.source_agent_id or "", "系统")
        type_emoji = _type_emoji(e.type)

        if e.type == "agent_message":
            lines.append(f"- {type_emoji} **{agent_label}**：{e.description}")
        elif e.type == "agent_action":
            lines.append(f"- {type_emoji} **{agent_label}** 执行：{e.description}")
        elif e.type == "thought_stream":
            lines.append(f"- {type_emoji} *{agent_label}* 思考：{e.description}")
        elif e.type == "relationship_change":
            lines.append(f"- {type_emoji} 关系变化：{e.description}")
        elif e.type == "world_event":
            lines.append(f"- {type_emoji} 世界事件：{e.description}")
        elif e.type == "tick_boundary":
            continue  # 跳过 tick 分隔线
        else:
            lines.append(f"- {type_emoji} [{e.type}] {e.description}")

    lines.append("")
    lines.append("---")
    lines.append(f"*本报告由 Life Lab 自动生成 — {now}*")

    return "\n".join(lines)


def _type_emoji(event_type: str) -> str:
    """事件类型对应的 emoji 标记。"""
    mapping = {
        "agent_message": "💬",
        "agent_action": "⚡",
        "thought_stream": "💭",
        "relationship_change": "🤝",
        "world_event": "🌐",
        "tick_boundary": "⏱",
    }
    return mapping.get(event_type, "📋")


def _ascii_slug(text: str, max_len: int = 20) -> str:
    """将中文文本转为 URL/文件名安全的短字符串。

    使用 hash 摘要保证唯一性，前缀取 ASCII 兼容字符。
    """
    import hashlib
    h = hashlib.md5(text.encode("utf-8")).hexdigest()[:6]
    # 尝试提取 ASCII 前缀
    ascii_prefix = "".join(c for c in text if c.isascii() and c.isalnum())[:max_len]
    if ascii_prefix:
        return f"{ascii_prefix}-{h}"
    return h


# =============================================================================
# 辅助：收集事件
# =============================================================================


def _collect_events(world_id: str) -> list[SimEvent]:
    """从活跃 WorldEngine 或内存中收集事件。"""
    engine = _active_worlds.get(world_id)
    if engine:
        return list(engine.events)
    return []


async def _collect_agent_names(world_id: str, db: AsyncSession) -> dict[str, str]:
    """收集 Agent ID → 名称映射（从活跃引擎 + SQLite）。"""
    names: dict[str, str] = {}
    engine = _active_worlds.get(world_id)
    if engine:
        for aid, agent in engine.agents.items():
            names[aid] = agent.persona.name or aid[:8]
    # 补充从 SQLite 中查找
    result = await db.execute(select(AgentRow))
    for row in result.scalars().all():
        if row.id not in names:
            persona = json.loads(row.persona_json)
            names[row.id] = persona.get("name", "") or row.id[:8]
    return names


# =============================================================================
# 路由
# =============================================================================


@router.get("/report/{world_id}")
async def export_report_markdown(
    world_id: str,
    db: AsyncSession = Depends(get_db),
):
    """生成实验报告 Markdown → 返回文件下载。"""
    result = await db.execute(select(WorldRow).where(WorldRow.id == world_id))
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail=f"World {world_id!r} not found")

    world_data = row.to_dict()

    events = _collect_events(world_id)
    if not events:
        raise HTTPException(
            status_code=404,
            detail=f"No events found for world {world_id!r}. Start a simulation first.",
        )

    agent_names = await _collect_agent_names(world_id, db)
    report = build_report_markdown(
        world_id=world_id,
        world_name=world_data["name"],
        events=events,
        agent_names=agent_names,
        scenario_name=world_data["scenario"].get("name", ""),
    )

    safe_name = _ascii_slug(world_data["name"])
    filename = f"report-{safe_name}-{datetime.now(timezone.utc).strftime('%Y%m%d')}.md"
    logger.info(f"Export report: world={world_id}, events={len(events)}, file={filename}")

    return Response(
        content=report,
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/report/{world_id}/json")
async def export_report_json(
    world_id: str,
    db: AsyncSession = Depends(get_db),
):
    """生成 JSON 格式的实验报告。"""
    result = await db.execute(select(WorldRow).where(WorldRow.id == world_id))
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail=f"World {world_id!r} not found")

    world_data = row.to_dict()

    events = _collect_events(world_id)
    agent_names = await _collect_agent_names(world_id, db)

    report_data = {
        "world_id": world_id,
        "world_name": world_data["name"],
        "scenario": world_data["scenario"].get("name", ""),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_events": len(events),
        "total_ticks": world_data["current_tick"],
        "agents": [
            {"id": aid, "name": name}
            for aid, name in agent_names.items()
        ],
        "events": [e.model_dump() for e in events],
    }

    safe_name = _ascii_slug(world_data["name"])
    filename = f"report-{safe_name}-{datetime.now(timezone.utc).strftime('%Y%m%d')}.json"
    content = json.dumps(report_data, ensure_ascii=False, indent=2)

    return Response(
        content=content,
        media_type="application/json; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
