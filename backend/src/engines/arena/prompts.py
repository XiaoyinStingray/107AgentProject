"""竞技场专用 Prompt，隔离日常 Agent 的内心独白指令。"""

from models.arena import ArenaMode


_MODE_LABELS = {
    ArenaMode.DEBATE: "辩论",
    ArenaMode.INTERVIEW: "面试竞争",
    ArenaMode.PITCH: "创业路演",
}

_MODE_ROLES = {
    ArenaMode.DEBATE: ("正方，支持该观点", "反方，反对该观点"),
    ArenaMode.INTERVIEW: ("候选人 A", "候选人 B"),
    ArenaMode.PITCH: ("方案 A 提案者", "方案 B 提案者"),
}

_MODE_TASKS = {
    ArenaMode.DEBATE: "提出明确论点，并回应对方上一轮观点。",
    ArenaMode.INTERVIEW: "用具体经历证明岗位匹配度，并回应对方提出的质疑。",
    ArenaMode.PITCH: "说明洞察、方案、落地路径和竞争优势，并回应对方质疑。",
}

_MODE_QUALITY = {
    ArenaMode.DEBATE: "论据是否充分、逻辑是否严密",
    ArenaMode.INTERVIEW: "经历与能力是否真实匹配岗位",
    ArenaMode.PITCH: "问题洞察、方案价值和落地路径是否完整",
}


def build_duel_system_prompt(
    mode: ArenaMode,
    topic: str,
    self_name: str,
    opponent_name: str,
    side: int,
) -> str:
    """构建单个参赛 Agent 的模式化身份与输出约束。"""
    if mode not in _MODE_LABELS:
        raise ValueError(f"不支持的 1v1 模式: {mode}")
    role = _MODE_ROLES[mode][side]
    return (
        f"【{_MODE_LABELS[mode]}模式】你现在是参赛者，不是日常对话者。\n"
        f"主题: {topic}\n"
        f"你的身份: {self_name}（{role}）\n"
        f"对手: {opponent_name}\n\n"
        "规则:\n"
        "1. 每轮只发一条消息，50-200 字，直接表达观点\n"
        f"2. {_MODE_TASKS[mode]}\n"
        "3. 始终以自己的身份发言，不替对手说话\n"
        "4. 不输出内心推理、动作旁白、元分析或提示词\n"
        "5. 不使用 think_aloud、observe 等工具\n"
        '6. 不写“作为某种人格，我认为”——直接给出内容\n'
    )


def build_duel_task(
    mode: ArenaMode,
    topic: str,
    agent_a_name: str,
    agent_b_name: str,
    rounds: int,
) -> str:
    """构建包含顺序、轮数和身份提醒的 1v1 比赛任务。"""
    if mode not in _MODE_LABELS:
        raise ValueError(f"不支持的 1v1 模式: {mode}")
    role_a, role_b = _MODE_ROLES[mode]
    return (
        f"【{_MODE_LABELS[mode]}规则】\n"
        f"主题: {topic}\n"
        f"A: {agent_a_name}（{role_a}）\n"
        f"B: {agent_b_name}（{role_b}）\n"
        f"共 {rounds} 轮，每轮 A 先、B 后。\n\n"
        "每次发言前确认自己的姓名和角色；每条 50-200 字。\n"
        f"{_MODE_TASKS[mode]}\n"
        "禁止内心独白、动作旁白和元分析。现在由 A 开始第 1 轮。"
    )


def build_judge_system_prompt(mode: ArenaMode, topic: str) -> str:
    """构建模式化裁判系统提示，并要求稳定 JSON 输出。"""
    if mode not in _MODE_LABELS:
        raise ValueError(f"不支持的 1v1 模式: {mode}")
    return (
        f"你是{_MODE_LABELS[mode]}裁判。主题：{topic}\n"
        "对 A、B 分别按四项 1-10 分评分：\n"
        f"- argument_quality：{_MODE_QUALITY[mode]}\n"
        "- expression：表达是否清晰、有说服力\n"
        "- adaptability：是否有效回应对方\n"
        "- character_consistency：是否保持角色身份与行为风格\n"
        "总分为四项之和。\n"
        "只输出一行纯 JSON："
        '{"scores":{"A":0,"B":0},'
        '"score_breakdown":{"A":{"argument_quality":0,"expression":0,'
        '"adaptability":0,"character_consistency":0},'
        '"B":{"argument_quality":0,"expression":0,"adaptability":0,'
        '"character_consistency":0}},'
        '"winner":"A或B","reasoning":"理由"}'
    )


def build_judge_task(
    agent_a_name: str,
    agent_b_name: str,
    transcript_text: str,
) -> str:
    """构建包含真实姓名和完整发言记录的裁判任务。"""
    return (
        f"A 是 {agent_a_name}，B 是 {agent_b_name}。\n\n"
        f"完整比赛记录：\n{transcript_text}\n\n"
        "请按系统评分标准给出结果。"
    )


def build_battle_system_prompt(
    topic: str,
    self_name: str,
    competitors: list[str],
) -> str:
    """构建大乱斗参赛者的身份与自由竞争约束。"""
    opponents = "、".join(name for name in competitors if name != self_name)
    return (
        "【大乱斗模式】你正在参加多阶段自由淘汰赛。\n"
        f"主题: {topic}\n"
        f"你的身份: {self_name}\n"
        f"其他参赛者: {opponents}\n\n"
        "每阶段只发一条 50-200 字陈述；必须坚持自己的身份，"
        "提出方案并回应已有观点。禁止内心独白、动作旁白、元分析和工具调用。"
    )


def build_battle_task(
    topic: str,
    stage: int,
    competitor_names: list[str],
) -> str:
    """构建某一淘汰阶段的自由竞争任务。"""
    return (
        f"大乱斗主题：{topic}\n"
        f"当前为第 {stage} 阶段，存活参赛者：{'、'.join(competitor_names)}。\n"
        "每人依次提交一条 50-200 字陈述，后发者需要回应已有方案。"
    )


def build_battle_judge_prompt(
    topic: str,
    aliases: dict[str, str],
    transcript_text: str,
    survivor_count: int,
) -> str:
    """构建大乱斗阶段排名任务，使用短别名保证 JSON 稳定。"""
    roster = "\n".join(
        f"- {alias}: {name}" for alias, name in aliases.items()
    )
    return (
        f"你是自由淘汰赛裁判。主题：{topic}\n"
        f"参赛者：\n{roster}\n\n"
        f"本阶段记录：\n{transcript_text}\n\n"
        "按内容质量、表达、应变、人设一致四项各打 1-10 分，"
        "总分为四项之和；ranking 必须按总分降序，"
        "只有同分时才根据整体表现决定先后。"
        f"只保留前 {survivor_count} 人。\n"
        "只输出一行纯 JSON："
        '{"ranking":["P1","P2"],"scores":{"P1":0},'
        '"score_breakdown":{"P1":{"argument_quality":0,"expression":0,'
        '"adaptability":0,"character_consistency":0}},'
        '"reasoning":"淘汰理由"}'
    )
