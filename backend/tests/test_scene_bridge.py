"""
SceneBridge 单元测试 — Step T8。
覆盖: WorldEngine ↔ SceneEngine 双向同步、move_agent、try_random_event。
"""

from types import SimpleNamespace
from unittest.mock import patch

import pytest

from engines.scene.engine import SceneBridge, AgentSpriteData


# ── Helpers ──────────────────────────────────────────────


def _make_mock_agent(agent_id: str, name: str = "小明",
                     tile_x: int = 2, tile_y: int = 3,
                     emotion_label: str = "neutral"):
    """构造一个最小化的 mock LifeAgent。"""
    return SimpleNamespace(
        id=agent_id,
        persona=SimpleNamespace(name=name, emoji="🧑", color="#8888cc"),
        position={"tile_x": tile_x, "tile_y": tile_y},
        emotional_state=SimpleNamespace(label=emotion_label),
    )


def _make_mock_engine(agent_ids: list[str] | None = None):
    """构造一个带 agents dict 的 mock WorldEngine。"""
    agents = {}
    for aid in (agent_ids or ["a1", "a2"]):
        agents[aid] = _make_mock_agent(aid)
    return SimpleNamespace(agents=agents)


# =============================================================================
# SceneBridge.sync_to_scene — WorldEngine → SceneEngine
# =============================================================================


class TestSyncToScene:

    def test_sync_writes_sprites_for_all_agents(self):
        """sync_to_scene 将 WorldEngine 中所有 Agent 同步到 SceneEngine。"""
        we = _make_mock_engine(["a1", "a2", "a3"])
        bridge = SceneBridge("library", we)

        with patch("engines.scene.engine.scene_engine") as mock_se:
            mock_se.update_state = lambda sid, sprites: sprites
            result = bridge.sync_to_scene()

        assert len(result) == 3
        ids = {s.agentId for s in result}
        assert ids == {"a1", "a2", "a3"}

    def test_sync_reads_position_from_agent(self):
        """sync_to_scene 正确读取 Agent 的 tile_x / tile_y。"""
        we = _make_mock_engine(["a1"])
        we.agents["a1"].position = {"tile_x": 7, "tile_y": 4}
        bridge = SceneBridge("dorm", we)

        with patch("engines.scene.engine.scene_engine") as mock_se:
            mock_se.update_state = lambda sid, sprites: sprites
            result = bridge.sync_to_scene()

        assert result[0].tileX == 7
        assert result[0].tileY == 4

    def test_sync_handles_missing_position(self):
        """Agent 无 position 属性时默认 (0, 0)。"""
        we = _make_mock_engine(["a1"])
        we.agents["a1"].position = None
        bridge = SceneBridge("classroom", we)

        with patch("engines.scene.engine.scene_engine") as mock_se:
            mock_se.update_state = lambda sid, sprites: sprites
            result = bridge.sync_to_scene()

        assert result[0].tileX == 0
        assert result[0].tileY == 0

    def test_sync_reads_emotion_label(self):
        """sync_to_scene 将 agent.emotional_state.label 映射到 sprite.emotion。"""
        we = _make_mock_engine(["a1"])
        we.agents["a1"].emotional_state = SimpleNamespace(label="happy")
        bridge = SceneBridge("art", we)

        with patch("engines.scene.engine.scene_engine") as mock_se:
            mock_se.update_state = lambda sid, sprites: sprites
            result = bridge.sync_to_scene()

        assert result[0].emotion == "happy"

    def test_sync_passes_correct_scene_id(self):
        """sync_to_scene 调用 scene_engine.update_state 时传入正确的 scene_id。"""
        we = _make_mock_engine(["a1"])
        bridge = SceneBridge("sakura", we)

        captured_sid = None

        def capture_update(sid, sprites):
            nonlocal captured_sid
            captured_sid = sid
            return sprites

        with patch("engines.scene.engine.scene_engine") as mock_se:
            mock_se.update_state = capture_update
            bridge.sync_to_scene()

        assert captured_sid == "sakura"


# =============================================================================
# SceneBridge.sync_to_world — SceneEngine → WorldEngine
# =============================================================================


class TestSyncToWorld:

    def test_sync_writes_position_back_to_agent(self):
        """sync_to_world 将 SceneEngine 中的精灵位置写回 WorldEngine Agent。"""
        we = _make_mock_engine(["a1"])
        bridge = SceneBridge("library", we)

        sprites = [
            AgentSpriteData(
                agentId="a1", name="小明", emoji="🧑", color="#888",
                tileX=9, tileY=7, action="walk", emotion="neutral",
            ),
        ]

        with patch("engines.scene.engine.scene_engine") as mock_se:
            mock_se.get_state = lambda sid: sprites
            bridge.sync_to_world()

        assert we.agents["a1"].position["tile_x"] == 9
        assert we.agents["a1"].position["tile_y"] == 7

    def test_sync_ignores_unknown_agents(self):
        """sync_to_world 忽略 WorldEngine 中不存在的 Agent。"""
        we = _make_mock_engine(["a1"])
        bridge = SceneBridge("library", we)

        sprites = [
            AgentSpriteData(
                agentId="a1", name="小明", emoji="🧑", color="#888",
                tileX=1, tileY=1, action="idle", emotion="neutral",
            ),
            AgentSpriteData(
                agentId="unknown", name="未知", emoji="?", color="#000",
                tileX=5, tileY=5, action="idle", emotion="neutral",
            ),
        ]

        with patch("engines.scene.engine.scene_engine") as mock_se:
            mock_se.get_state = lambda sid: sprites
            bridge.sync_to_world()  # 不应抛异常

        assert we.agents["a1"].position["tile_x"] == 1


# =============================================================================
# SceneBridge.move_agent
# =============================================================================


class TestMoveAgent:

    def test_move_updates_position_and_syncs(self):
        """move_agent 更新 Agent 位置并同步到 SceneEngine。"""
        we = _make_mock_engine(["a1"])
        bridge = SceneBridge("library", we)

        with patch("engines.scene.engine.scene_engine") as mock_se:
            mock_se.update_state = lambda sid, sprites: sprites
            result = bridge.move_agent("a1", 10, 8)

        assert result is True
        assert we.agents["a1"].position["tile_x"] == 10
        assert we.agents["a1"].position["tile_y"] == 8

    def test_move_returns_false_for_unknown_agent(self):
        """move_agent 对不存在的 Agent 返回 False。"""
        we = _make_mock_engine(["a1"])
        bridge = SceneBridge("library", we)

        result = bridge.move_agent("nonexistent", 3, 3)
        assert result is False

    def test_move_initializes_position_if_none(self):
        """move_agent 在 Agent.position 为 None 时初始化 dict。"""
        we = _make_mock_engine(["a1"])
        we.agents["a1"].position = None
        bridge = SceneBridge("dorm", we)

        with patch("engines.scene.engine.scene_engine") as mock_se:
            mock_se.update_state = lambda sid, sprites: sprites
            bridge.move_agent("a1", 4, 5)

        assert we.agents["a1"].position == {"tile_x": 4, "tile_y": 5}


# =============================================================================
# SceneBridge.try_random_event
# =============================================================================


class TestTryRandomEvent:

    def test_returns_none_when_no_event(self, monkeypatch):
        """无随机事件时返回 None。"""
        we = _make_mock_engine(["a1"])
        bridge = SceneBridge("library", we)

        monkeypatch.setattr(
            "engines.scene.engine.scene_engine.get_random_event",
            lambda sid: None,
        )

        assert bridge.try_random_event() is None

    def test_returns_event_dict_when_triggered(self, monkeypatch):
        """触发事件时返回结构化 dict。"""
        from engines.scene.engine import SceneEvent

        we = _make_mock_engine(["a1"])
        bridge = SceneBridge("library", we)

        fake_event = SceneEvent(
            "ev_test", "测试事件文本", "all", "happy", 2, ["library"],
        )
        monkeypatch.setattr(
            "engines.scene.engine.scene_engine.get_random_event",
            lambda sid: fake_event,
        )

        result = bridge.try_random_event()
        assert result is not None
        assert result["id"] == "ev_test"
        assert result["text"] == "测试事件文本"
        assert result["emotion"] == "happy"
        assert result["intensity"] == 2
