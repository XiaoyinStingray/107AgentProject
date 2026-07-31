"""Target-aware routing for one-shot Agent instructions."""

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class AgentInstruction:
    """A private instruction plus an optional explicit social target."""

    description: str
    social_target_id: str | None = None
    social_target_name: str | None = None

    @property
    def is_social(self) -> bool:
        return self.social_target_id is not None


def resolve_agent_instruction(
    description: str,
    actor_id: str,
    agents: dict[str, Any],
) -> AgentInstruction:
    """Resolve exactly one explicitly named participant as the social target.

    No LLM guessing happens here. If the instruction names none or more than
    one other participant, it remains an actor-only instruction.
    """
    matches: list[tuple[str, str]] = []
    for agent_id, agent in agents.items():
        if agent_id == actor_id:
            continue
        display_name = agent.persona.name or agent_id
        if display_name and display_name in description:
            matches.append((agent_id, display_name))

    if len(matches) != 1:
        return AgentInstruction(description=description)

    target_id, target_name = matches[0]
    return AgentInstruction(
        description=description,
        social_target_id=target_id,
        social_target_name=target_name,
    )


def build_private_instruction_context(
    instructions: list[AgentInstruction],
) -> str:
    """Render one-shot instructions into strict, observable action rules."""
    if not instructions:
        return ""

    sections = ["\n# 用户只对你下达的一次性指令"]
    for instruction in instructions:
        sections.append(f"- 原始指令：{instruction.description}")
        if instruction.is_social:
            target_name = instruction.social_target_name or "指定对象"
            sections.extend([
                f"  互动对象已锁定为：{target_name}",
                f"  你的第一次可见发言必须直接称呼“{target_name}”，",
                f"  只点名{target_name}并对其说出完整内容；",
                "  不得只描述‘准备去说’或把任务转交给其他 Agent。",
                f"  发言后等待{target_name}回应，再自然继续互动。",
            ])
        else:
            sections.extend([
                "  该指令没有唯一指定另一位在场人物。",
                "  不得擅自把它改成找某个 Agent 聊天。",
                "  请由你本人执行环境、移动、物品或自身行为，",
                "  并用可见发言说明结果；若当前场景无法完成，要明确说明原因。",
            ])
    sections.append(
        "请由你本人在本轮行动或发言中立即执行；不要让其他 Agent 代替你。"
    )
    return "\n".join(sections) + "\n"
