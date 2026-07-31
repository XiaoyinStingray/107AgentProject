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
