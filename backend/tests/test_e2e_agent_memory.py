"""
State 4 Phase B E2E: 跨 tick Agent 记忆保留测试。

验证 inject_context mode="continuous" 使 Agent 能
在多个 tick 之间保持对话记忆。
"""

import pytest


@pytest.mark.asyncio
async def test_context_accumulation_across_ticks(factory):
    """5 次 continuous inject_context 后，消息累积而非替换。"""
    agent = await factory.create_from_description("测试角色")

    for i in range(5):
        agent.inject_context(
            f"⏰ Tick {i}\n📍 图书馆",
            mode="continuous",
        )

    # 消息历史应累积了 5 条 context 消息
    msgs = agent._get_autogen_model_messages()
    context_msgs = [m for m in msgs if getattr(m, "source", "") == "world"]
    assert len(context_msgs) >= 5, f"Expected >=5 context messages, got {len(context_msgs)}"


@pytest.mark.asyncio
async def test_system_message_preserved_across_ticks(factory):
    """system prompt 在多次 continuous inject_context 后保持不变。"""
    agent = await factory.create_from_description("测试角色")
    original_sys = agent._get_autogen_system_messages()[0].content

    for _ in range(10):
        agent.inject_context("⏰ Tick N\n📍 任意位置", mode="continuous")

    current_sys = agent._get_autogen_system_messages()[0].content
    assert current_sys == original_sys, "System prompt should never change in continuous mode"


@pytest.mark.asyncio
async def test_replace_mode_clears_context(factory):
    """mode='replace' 保持原有行为——覆盖 system prompt + 清空历史。"""
    agent = await factory.create_from_description("测试角色")
    original_sys = agent._get_autogen_system_messages()[0].content

    agent.inject_context("⏰ Tick 5\n📍 大学宿舍\n🌤️ 阴天")

    new_sys = agent._get_autogen_system_messages()[0].content
    assert "当前处境" in new_sys
    assert "大学宿舍" in new_sys
    assert new_sys != original_sys


# =============================================================================
# 笔记跨 tick 测试
# =============================================================================


@pytest.mark.asyncio
async def test_notes_persist_in_context_across_ticks(factory):
    """笔记在连续 inject_context 后自动出现在上下文中。"""
    agent = await factory.create_from_description("测试角色")
    agent._notes = [
        {"tick": 1, "content": "小红今天没来图书馆"},
        {"tick": 2, "content": "她可能在准备比赛"},
    ]

    agent.inject_context("⏰ Tick 3\n📍 图书馆", mode="continuous")

    msgs = agent._get_autogen_model_messages()
    last_msg = msgs[-1]
    content = getattr(last_msg, "content", str(last_msg))
    assert "小红今天没来" in content
    assert "准备比赛" in content


@pytest.mark.asyncio
async def test_notes_only_recent_5_in_context(factory):
    """上下文中只包含最近 5 条笔记。"""
    agent = await factory.create_from_description("测试角色")
    agent._notes = [{"tick": i, "content": f"笔记{i}"} for i in range(10)]

    agent.inject_context("⏰ Tick 10\n📍 图书馆", mode="continuous")

    msgs = agent._get_autogen_model_messages()
    last_msg = msgs[-1]
    content = getattr(last_msg, "content", str(last_msg))
    # 最近 5 条应是笔记5-9
    assert "笔记9" in content
    assert "笔记5" in content
    # 笔记0-4 不应出现
    assert "笔记0" not in content
    assert "笔记1" not in content


@pytest.mark.asyncio
async def test_compression_preses_system_message(factory):
    """压缩后 system message 仍然保持不变。"""
    agent = await factory.create_from_description("测试角色")
    original_sys = agent._get_autogen_system_messages()[0].content
    agent._COMPRESS_THRESHOLD = 4  # 降低阈值方便测试

    # 注入足够多消息触发压缩
    for i in range(10):
        agent._add_autogen_model_message(
            type("FakeMsg", (), {"content": f"消息{i}", "source": f"agent_{i}"})()
        )
        agent._context_count += 1

    agent._compress_history()

    current_sys = agent._get_autogen_system_messages()[0].content
    assert current_sys == original_sys


@pytest.mark.asyncio
async def test_notes_empty_does_not_break_context(factory):
    """空笔记列表不影响上下文注入。"""
    agent = await factory.create_from_description("测试角色")
    agent._notes = []

    agent.inject_context("⏰ Tick 1\n📍 图书馆", mode="continuous")

    msgs = agent._get_autogen_model_messages()
    last_msg = msgs[-1]
    content = getattr(last_msg, "content", str(last_msg))
    assert "图书馆" in content
    # 不应包含笔记段
    assert "笔记" not in content
