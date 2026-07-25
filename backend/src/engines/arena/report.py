"""根据已持久化竞技结果生成零额外 LLM 成本的 Markdown 战报。"""

from collections import defaultdict

from models.arena import ArenaReportResponse, ArenaResult


_MODE_LABELS = {
    "debate": "1v1 辩论",
    "interview": "面试竞争",
    "pitch": "创业路演",
    "battle_royale": "多人自由淘汰赛",
}


def build_arena_report(
    arena_id: str,
    result: ArenaResult,
) -> ArenaReportResponse:
    """从完整服务端记录生成概述、逐轮分析和胜负原因。"""
    title = f"{result.topic} · 竞技战报"
    winner = result.participant_names.get(result.winner_id, result.winner_id)
    score_lines = [
        f"- {result.participant_names.get(agent_id, agent_id)}："
        f"{result.scores.get(agent_id, 0):g} 分"
        for agent_id in sorted(
            result.participant_ids,
            key=lambda item: result.scores.get(item, 0),
            reverse=True,
        )
    ]
    outcome_lines = (
        _build_battle_path(result)
        if result.mode.value == "battle_royale"
        else ["## 最终比分", *score_lines]
    )
    sections = [
        f"# {title}",
        "",
        "## 对战概述",
        f"- 模式：{_MODE_LABELS.get(result.mode.value, result.mode.value)}",
        f"- 主题：{result.topic}",
        f"- 参赛者：{'、'.join(result.participant_names.values())}",
        f"- 阶段/轮数：{result.rounds}",
        f"- 胜者：{winner}",
        "",
        *outcome_lines,
        "",
        "## 逐轮分析",
        *_build_round_sections(result),
        "",
        "## 胜负原因",
        result.judge_reasoning or "裁判未提供额外说明。",
    ]
    return ArenaReportResponse(
        arena_id=arena_id,
        title=title,
        markdown="\n".join(sections),
    )


def _build_battle_path(result: ArenaResult) -> list[str]:
    """按每阶段真实排名展示大乱斗淘汰路径。"""
    by_round: dict[int, list] = defaultdict(list)
    last_round: dict[str, int] = {}
    for entry in result.transcript:
        by_round[entry.round].append(entry)
        last_round[entry.speaker_id] = entry.round
    if not by_round:
        return ["## 淘汰路径", "暂无有效阶段记录。"]

    final_round = max(by_round)
    lines = ["## 淘汰路径"]
    for round_number in sorted(by_round):
        entries = sorted(
            {
                entry.speaker_id: entry
                for entry in by_round[round_number]
            }.values(),
            key=lambda item: item.stage_rank or 999,
        )
        next_ids = {
            item.speaker_id
            for item in by_round.get(round_number + 1, [])
        }
        statuses = [
            _battle_status(entry, next_ids, round_number, final_round, result)
            for entry in entries
        ]
        lines.extend([
            f"### 第 {round_number} 阶段 · "
            f"{len(entries)} → {sum(status != '淘汰' for status in statuses)}",
            *[
                _battle_entry_line(entry, status, last_round, result)
                for entry, status in zip(entries, statuses, strict=True)
            ],
            "",
        ])
    return lines[:-1]


def _battle_status(entry, next_ids, round_number, final_round, result) -> str:
    """兼容新旧记录并判断本轮结果。"""
    advanced = entry.advanced
    if advanced is None:
        advanced = (
            entry.speaker_id == result.winner_id
            if round_number == final_round
            else entry.speaker_id in next_ids
        )
    if advanced and round_number == final_round:
        return "冠军"
    return "晋级" if advanced else "淘汰"


def _battle_entry_line(entry, status, last_round, result) -> str:
    """格式化本轮名次和可确认的阶段分数。"""
    score = entry.stage_score
    if score is None and last_round.get(entry.speaker_id) == entry.round:
        score = result.scores.get(entry.speaker_id)
    score_text = f"{score:g} 分" if score is not None else "分数未保存"
    rank_text = f"#{entry.stage_rank}" if entry.stage_rank else "#?"
    return f"- {rank_text} {entry.speaker}：{score_text} · {status}"


def _build_round_sections(result: ArenaResult) -> list[str]:
    """把完整 transcript 按轮次组织为可读 Markdown。"""
    by_round: dict[int, list[str]] = defaultdict(list)
    for entry in result.transcript:
        by_round[entry.round].append(
            f"- **{entry.speaker}**：{entry.content}"
        )
    if not by_round:
        return ["暂无有效发言记录。"]
    lines: list[str] = []
    for round_number in sorted(by_round):
        lines.extend([
            f"### 第 {round_number} 轮/阶段",
            *by_round[round_number],
            "",
        ])
    return lines[:-1]
