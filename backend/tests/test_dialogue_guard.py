"""Cross-tick repetition and natural-completion guard coverage."""

from models.event import SimEvent


def _message(tick: int, agent_id: str, text: str) -> SimEvent:
    return SimEvent(
        id=f"{agent_id}-{tick}-{text}",
        world_id="world-guard",
        tick=tick,
        type="agent_message",
        source_agent_id=agent_id,
        description=text,
        created_at="2026-08-17T00:00:00",
    )


def test_normalization_detects_recorded_repetition_without_matching_new_content():
    from engines.world.dialogue_guard import is_near_duplicate, normalize_dialogue

    recorded = normalize_dialogue("（挥手）明早见，都稳稳的。")
    repeated = normalize_dialogue("明早见，都稳稳的！")
    progressed = normalize_dialogue("我先整理极限题，再核对错题。")

    assert is_near_duplicate(recorded, repeated) is True
    assert is_near_duplicate(recorded, progressed) is False


def test_question_about_tomorrow_is_not_treated_as_a_farewell():
    from engines.world.dialogue_guard import is_closing_utterance

    assert is_closing_utterance("明早见，都稳稳的。") is True
    assert is_closing_utterance("我们明早见老师吗？") is False


def test_two_closing_ticks_finish_naturally():
    from engines.world.dialogue_guard import DialogueProgressGuard

    guard = DialogueProgressGuard()
    first = guard.annotate_message(_message(9, "yue", "回见，明早稳稳拿下。"))
    first_result = guard.assess_tick([first])
    second = guard.annotate_message(_message(10, "yue", "明早见，都稳稳的。"))
    second_result = guard.assess_tick([second])

    assert first_result.should_finish is False
    assert "不要再次重复告别" in first_result.hint
    assert second_result.should_finish is True
    assert second_result.reason == "natural_completion"


def test_collective_farewell_finishes_in_one_tick():
    from engines.world.dialogue_guard import DialogueProgressGuard

    guard = DialogueProgressGuard()
    events = [
        guard.annotate_message(_message(12, "yue", "大家晚安，明天见。")),
        guard.annotate_message(_message(12, "shen", "好，拜拜。")),
    ]

    result = guard.assess_tick(events)

    assert result.should_finish is True
    assert result.reason == "natural_completion"


def test_generic_repetition_gets_one_replan_tick_then_finishes():
    from engines.world.dialogue_guard import DialogueProgressGuard

    guard = DialogueProgressGuard()
    first = guard.annotate_message(_message(1, "yue", "我先整理错题本。"))
    second = guard.annotate_message(_message(2, "yue", "（点头）我先整理错题本。"))
    third = guard.annotate_message(_message(3, "yue", "我先整理错题本！"))

    assert guard.assess_tick([first]).should_finish is False
    retry = guard.assess_tick([second])
    assert retry.should_finish is False
    assert retry.repeated_agent_ids == ("yue",)
    assert "推进新的行动" in retry.hint
    finished = guard.assess_tick([third])
    assert finished.should_finish is True
    assert finished.reason == "conversation_repeating"


def test_repeated_messages_do_not_count_as_tick_progress():
    from api.sse import _has_meaningful_events

    repeated = _message(2, "yue", "我先整理错题本。")
    repeated.data["dialogue_repeated"] = True
    relationship = SimEvent(
        id="relationship-2",
        world_id="world-guard",
        tick=2,
        type="relationship_change",
        source_agent_id="yue",
        description="关系变化",
        created_at="2026-08-17T00:00:00",
    )
    novel = _message(3, "shen", "我负责核对第二章公式。")

    assert _has_meaningful_events([repeated, relationship]) is False
    assert _has_meaningful_events([novel]) is True
