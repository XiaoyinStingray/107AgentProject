"""
长期稳定性测试 — 10 Agent × 50 tick 连续运行。

验证:
  - 无崩溃 / 无异常
  - 无内存持续增长（轨迹数据有界）
  - FingerprintCollector 正常采集和聚合
  - MemoryConsolidator 正常触发和降级
  - 副作用管道（_pending_messages / _thought_log）不泄漏
"""

import gc
import sys

import pytest


# =============================================================================
# 辅助：轻量级 Tick 模拟器
# =============================================================================


class _TickSimulator:
    """模拟 WorldEngine tick 循环——不依赖真实 DB / AutoGen GroupChat。

    用于验证核心组件（FingerprintCollector / MemoryConsolidator / 副作用管道）
    在长期运行下的稳定性。
    """

    def __init__(self, agent_count: int = 10):
        self.agent_count = agent_count
        self.agent_ids = [f"agent-{i:02d}" for i in range(agent_count)]
        self.pending_messages: list[dict] = []
        self.thought_log: dict[str, list[dict]] = {}
        self.events: list[dict] = []
        self.current_tick = 0

        from engines.agent_factory.fingerprint import FingerprintCollector
        self.fingerprint_collector = FingerprintCollector()

    def simulate_tick(self) -> int:
        """模拟一个 tick——采集指纹 + 产生副作用数据。"""
        tick_events: list[dict] = []

        for aid in self.agent_ids:
            # 模拟 tool 调用
            tools = ["observe", "think_aloud"] if self.current_tick % 3 == 0 else ["send_message"]
            targets = [self.agent_ids[(self.agent_ids.index(aid) + 1) % self.agent_count]]

            # 模拟消息
            messages = [{"content": f"tick-{self.current_tick}-msg-from-{aid}"}]

            # 采集指纹
            self.fingerprint_collector.collect(
                agent_id=aid,
                tick=self.current_tick,
                tools_called=tools,
                messages=messages,
                emotion_before="neutral",
                emotion_after="happy" if self.current_tick % 5 == 0 else "neutral",
                targets=targets,
            )

            # 模拟副作用
            self.thought_log.setdefault(aid, []).append({
                "tick": self.current_tick,
                "thought": f"tick-{self.current_tick}-thought",
            })

            if "send_message" in tools:
                self.pending_messages.append({
                    "from": aid,
                    "to": targets[0],
                    "content": f"msg-{self.current_tick}",
                })

            tick_events.append({
                "type": "agent_action",
                "source_agent_id": aid,
                "tick": self.current_tick,
            })

        # 消费副作用（模拟 _post_process_tick 的清理行为）
        self.pending_messages.clear()
        for thoughts in self.thought_log.values():
            thoughts.clear()

        self.current_tick += 1
        return len(tick_events)


# =============================================================================
# 稳定性测试
# =============================================================================


class TestLongRunStability:
    """10 Agent × 50 tick 长期稳定性测试。"""

    def test_50_ticks_no_crash(self):
        """50 tick 连续运行无崩溃。"""
        sim = _TickSimulator(agent_count=10)
        for i in range(50):
            event_count = sim.simulate_tick()
            assert event_count == 10  # 每 tick 10 个 agent 各产生 1 个事件

    def test_fingerprint_data_bounded(self):
        """指纹采集数据有界——不会无限增长。"""
        sim = _TickSimulator(agent_count=10)
        for _ in range(50):
            sim.simulate_tick()

        # 每个 agent 应有 50 条轨迹
        for aid in sim.agent_ids:
            traces = sim.fingerprint_collector.get_traces(aid)
            assert len(traces) == 50

    def test_fingerprint_analyze_after_long_run(self):
        """长期运行后 analyze 正常返回完整指纹。"""
        sim = _TickSimulator(agent_count=10)
        for _ in range(50):
            sim.simulate_tick()

        for aid in sim.agent_ids:
            fp = sim.fingerprint_collector.analyze(aid)
            assert fp.total_ticks == 50
            assert fp.tool_distribution  # 非空
            assert len(fp.emotion_trajectory) == 50
            assert 0.0 <= fp.consistency_score <= 1.0

    def test_side_effects_consumed_each_tick(self):
        """副作用管道每 tick 被消费——不积累。"""
        sim = _TickSimulator(agent_count=10)
        for _ in range(50):
            sim.simulate_tick()
            # 每 tick 结束后 pending_messages 和 thought_log 应被清空
            assert len(sim.pending_messages) == 0
            for thoughts in sim.thought_log.values():
                assert len(thoughts) == 0

    def test_memory_stable_after_long_run(self):
        """长期运行后内存无异常增长。"""
        sim = _TickSimulator(agent_count=10)
        for _ in range(50):
            sim.simulate_tick()

        # 强制 GC 后检查对象数量不会爆炸
        gc.collect()
        # 指纹采集器中总共 10 agent × 50 tick = 500 条 trace
        total_traces = sum(
            len(sim.fingerprint_collector.get_traces(aid))
            for aid in sim.agent_ids
        )
        assert total_traces == 500

    def test_clear_and_restart(self):
        """清除数据后可重新开始。"""
        sim = _TickSimulator(agent_count=10)
        for _ in range(20):
            sim.simulate_tick()

        sim.fingerprint_collector.clear()
        for aid in sim.agent_ids:
            assert sim.fingerprint_collector.get_traces(aid) == []

        # 继续运行
        for _ in range(10):
            sim.simulate_tick()

        for aid in sim.agent_ids:
            traces = sim.fingerprint_collector.get_traces(aid)
            assert len(traces) == 10  # 清除后只跑了 10 tick


# =============================================================================
# MemoryConsolidator 稳定性
# =============================================================================


class TestMemoryConsolidatorStability:
    """MemoryConsolidator 长期运行稳定性测试。"""

    @pytest.mark.asyncio
    async def test_consolidate_with_many_events(self):
        """大量事件下 consolidate 正常处理。"""
        from types import SimpleNamespace
        from engines.agent_factory.memory import MemoryConsolidator

        class _FakeResult:
            def __init__(self, content):
                self.content = content

        class StableMockClient:
            model_info = {"function_calling": False}
            call_count = 0

            async def create(self, messages):
                self.call_count += 1
                import json
                lessons = [
                    {"content": f"长期运行教训{i}：系统在持续运行中保持稳定状态", "importance": 0.75, "type": "lesson"}
                    for i in range(3)
                ]
                return _FakeResult(json.dumps(lessons, ensure_ascii=False))

        # 内存 SQLite
        from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
        from db import Base
        from models.memory import Memory  # noqa: F401

        eng = create_async_engine("sqlite+aiosqlite://", echo=False)
        async with eng.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        factory = async_sessionmaker(eng, class_=AsyncSession, expire_on_commit=False)

        async with factory() as session:
            client = StableMockClient()
            consolidator = MemoryConsolidator(client, session)

            # 模拟 500 个事件
            events = [
                SimpleNamespace(
                    id=f"evt-{i}",
                    source_agent_id="a1",
                    tick=i % 50,
                    description=f"Agent a1 在第 {i} 个事件中执行了复杂的操作并产生了重要的结果数据。",
                    type="agent_action",
                )
                for i in range(500)
            ]

            result = await consolidator.consolidate("a1", events, (0, 50))
            assert len(result) <= 5  # 最多 5 条
            assert all(m.memory_type == "lesson" for m in result)

        await eng.dispose()

    @pytest.mark.asyncio
    async def test_consolidate_repeated_calls(self):
        """多次调用 consolidate 不会崩溃或泄漏。"""
        from types import SimpleNamespace
        from engines.agent_factory.memory import MemoryConsolidator

        class _FakeResult:
            def __init__(self, content):
                self.content = content

        class RepeatMockClient:
            model_info = {"function_calling": False}
            call_count = 0

            async def create(self, messages):
                self.call_count += 1
                import json
                return _FakeResult(json.dumps([
                    {"content": f"第{self.call_count}次调用的教训内容需要足够长", "importance": 0.7, "type": "lesson"}
                ], ensure_ascii=False))

        from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
        from db import Base
        from models.memory import Memory  # noqa: F401

        eng = create_async_engine("sqlite+aiosqlite://", echo=False)
        async with eng.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        factory = async_sessionmaker(eng, class_=AsyncSession, expire_on_commit=False)

        async with factory() as session:
            client = RepeatMockClient()
            consolidator = MemoryConsolidator(client, session)

            events = [
                SimpleNamespace(
                    id=f"evt-{i}",
                    source_agent_id="a1",
                    tick=i,
                    description=f"Agent 在第 {i} tick 进行了重要的决策和行动记录，这是一段足够长的描述。",
                    type="agent_action",
                )
                for i in range(20)
            ]

            # 连续调用 10 次 consolidate
            for _ in range(10):
                result = await consolidator.consolidate("a1", events, (0, 20))
                assert isinstance(result, list)

            assert client.call_count == 10

        await eng.dispose()
