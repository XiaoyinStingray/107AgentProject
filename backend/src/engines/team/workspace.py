"""
Team 工作区初始化 — 为 Team 执行创建共享文件系统结构。

隔离规则:
  - M12 Worker workspace = workspaces/workers/{run_id}/
  - M9 Team workspace  = workspaces/teams/{team_id}/{run_id}/
  - 两个路径不在同一父目录下——互不干扰
"""

import json
import uuid
from pathlib import Path


def init_team_workspace(
    team_id: str,
    team_name: str,
    task: str,
    steps: list[dict],
    agents: list[dict],
    base_dir: str | None = None,
) -> str:
    """初始化 Team 工作区目录结构。

    在 workspaces/teams/{team_id}/{run_id}/ 下创建:

        shared/
          TASK.md               — 原始任务描述
          TEAM.json             — 团队信息 + 完整步骤列表
          CONTEXT_{step_id}.md  — 每步骤上下文（执行前动态写入）

        step_1_{title}/
        step_2_{title}/
        ...

    Args:
        team_id: Team UUID
        team_name: Team 名称
        task: 原始任务描述
        steps: 步骤列表 [{id, title, assignee, description, ...}]
        agents: 成员列表 [{id, name, role, mbti, ...}]
        base_dir: 工作区根目录 (默认 ~/workspaces)

    Returns:
        Team workspace 根目录的绝对路径
    """
    root = Path(base_dir or str(Path.home() / "workspaces"))
    run_id = f"run-{uuid.uuid4().hex[:8]}"
    team_root = root / "teams" / team_id / run_id

    # ── shared/ ──
    shared_dir = team_root / "shared"
    shared_dir.mkdir(parents=True, exist_ok=True)

    # TASK.md
    (shared_dir / "TASK.md").write_text(
        f"# 团队任务\n\n{task}\n\n---\n**团队**: {team_name}\n**成员数**: {len(agents)}\n",
        encoding="utf-8",
    )

    # TEAM.json
    team_info = {
        "team_id": team_id,
        "team_name": team_name,
        "task": task,
        "agents": [
            {
                "id": a["id"],
                "name": a.get("name", a["id"][:8]),
                "role": a.get("role", "成员"),
                "mbti": a.get("mbti", ""),
            }
            for a in agents
        ],
        "steps": [
            {
                "id": s.get("id", f"s{i}"),
                "title": s.get("title", f"步骤 {i+1}"),
                "assignee": s.get("assignee"),
                "assignee_name": _find_agent_name(s.get("assignee"), agents),
                "description": s.get("description", ""),
                "depends_on": s.get("depends_on", []),
            }
            for i, s in enumerate(steps)
        ],
    }
    (shared_dir / "TEAM.json").write_text(
        json.dumps(team_info, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    # ── 预创建每步的子目录 ──
    for i, step in enumerate(steps):
        step_dir_name = f"step_{i + 1}_{_safe_dirname(step.get('title', str(i + 1)))}"
        (team_root / step_dir_name).mkdir(parents=True, exist_ok=True)

    return str(team_root)


def write_step_context(team_root: str, step_id: str, context: str) -> str:
    """为某步骤写入上下文摘要文件。

    Args:
        team_root: Team workspace 根目录
        step_id: 步骤 ID
        context: 上下文 Markdown 文本

    Returns:
        CONTEXT 文件的绝对路径
    """
    shared_dir = Path(team_root) / "shared"
    shared_dir.mkdir(parents=True, exist_ok=True)
    context_file = shared_dir / f"CONTEXT_{step_id}.md"
    context_file.write_text(context, encoding="utf-8")
    return str(context_file)


def get_step_workspace(team_root: str, step_index: int, step_title: str) -> str:
    """获取某步骤的工作区子目录路径。

    Args:
        team_root: Team workspace 根目录
        step_index: 步骤序号（0-based）
        step_title: 步骤标题

    Returns:
        步骤子目录的绝对路径
    """
    dir_name = f"step_{step_index + 1}_{_safe_dirname(step_title)}"
    step_dir = Path(team_root) / dir_name
    step_dir.mkdir(parents=True, exist_ok=True)
    return str(step_dir)


def _safe_dirname(title: str) -> str:
    """将步骤标题转为安全的目录名。"""
    import re
    safe = title.strip()[:30]
    safe = re.sub(r"[^\w一-鿿\-]", "_", safe)
    safe = re.sub(r"_+", "_", safe).strip("_")
    return safe or "step"


def _find_agent_name(agent_id: str | None, agents: list[dict]) -> str:
    """从 agents 列表中查找名称。"""
    if not agent_id:
        return "全员"
    for a in agents:
        if a.get("id") == agent_id:
            return a.get("name", agent_id[:8])
    return agent_id[:8] or "未知"
