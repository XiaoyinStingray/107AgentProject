"""
Phase 16 E2E 全链路测试 — Step 74。
验证游戏化场景的完整交互链路：
  场景创建 → Agent 放置 → 状态读写 → 交互对话 → 存档/还原

运行方式:
    cd backend && PYTHONPATH=src python -m pytest tests/test_e2e_scene.py -v -s
"""

import tempfile

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine

from db import Base, reset_db_state
from api.scenes import router as scenes_router


# ── DB Setup ─────────────────────────────────────────────

_tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_tmp.close()
_TEST_DB_URL = f"sqlite+aiosqlite:///{_tmp.name}"
_SYNC_DB_URL = f"sqlite:///{_tmp.name}"


def _sync_create_tables():
    from db import Base
    import models.agent_orm        # noqa: F401
    import models.world_orm        # noqa: F401
    import models.event            # noqa: F401
    import models.memory           # noqa: F401
    import models.checkpoint_orm   # noqa: F401

    engine = create_engine(_SYNC_DB_URL)
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    engine.dispose()


@pytest.fixture(scope="module")
def client():
    """模块级 fixture：启动 FastAPI app。"""
    _sync_create_tables()
    reset_db_state()

    app = FastAPI()
    app.include_router(scenes_router)

    with TestClient(app) as c:
        yield c


# =============================================================================
# E2E 场景全链路测试
# =============================================================================


class TestSceneFullChain:
    """游戏化场景全链路 E2E 测试。"""

    def test_scene_state_crud(self, client):
        """场景状态 CRUD：创建→读取→更新→删除 Agent。"""
        scene_id = "library"

        # 1. 初始状态为空
        resp = client.get(f"/api/scenes/{scene_id}/state")
        assert resp.status_code == 200
        data = resp.json()
        assert data["sceneId"] == scene_id
        assert data["agents"] == []

        # 2. 全量更新状态（投放 2 个 Agent）
        agents_payload = [
            {
                "agentId": "agent-001",
                "name": "小林",
                "emoji": "👨‍💻",
                "color": "#4488ff",
                "tileX": 3,
                "tileY": 2,
                "action": "idle",
                "emotion": "neutral",
            },
            {
                "agentId": "agent-002",
                "name": "小红",
                "emoji": "👩‍🎨",
                "color": "#ff4466",
                "tileX": 5,
                "tileY": 4,
                "action": "walk",
                "emotion": "happy",
            },
        ]
        resp = client.post(f"/api/scenes/{scene_id}/state", json=agents_payload)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["agents"]) == 2
        assert data["agents"][0]["name"] == "小林"
        assert data["agents"][1]["emotion"] == "happy"

        # 3. 读取状态验证持久化
        resp = client.get(f"/api/scenes/{scene_id}/state")
        assert resp.status_code == 200
        assert len(resp.json()["agents"]) == 2

        # 4. 添加单个 Agent
        new_agent = {
            "agentId": "agent-003",
            "name": "小刚",
            "emoji": "👨‍💼",
            "color": "#00ff88",
            "tileX": 7,
            "tileY": 3,
            "action": "sit",
            "emotion": "neutral",
        }
        resp = client.post(f"/api/scenes/{scene_id}/agents", json=new_agent)
        assert resp.status_code == 200
        assert len(resp.json()["agents"]) == 3

        # 5. 删除 Agent
        resp = client.delete(f"/api/scenes/{scene_id}/agents/agent-002")
        assert resp.status_code == 200
        agents = resp.json()["agents"]
        assert len(agents) == 2
        assert all(a["agentId"] != "agent-002" for a in agents)

    def test_scene_interact_mock(self, client):
        """场景交互：Mock 对话生成。"""
        scene_id = "dorm"

        # 先投放 Agent
        agents_payload = [
            {
                "agentId": "agent-a",
                "name": "小雪",
                "emoji": "👩‍🔬",
                "color": "#aa44ff",
                "tileX": 2,
                "tileY": 2,
                "action": "idle",
                "emotion": "neutral",
            },
            {
                "agentId": "agent-b",
                "name": "阿杰",
                "emoji": "🧑‍🎤",
                "color": "#ff8844",
                "tileX": 4,
                "tileY": 3,
                "action": "idle",
                "emotion": "excited",
            },
        ]
        client.post(f"/api/scenes/{scene_id}/state", json=agents_payload)

        # 交互请求
        interact_payload = {
            "from": "小雪",
            "to": "阿杰",
            "scene": scene_id,
            "message": "",
            "emotion": "neutral",
        }
        resp = client.post(f"/api/scenes/{scene_id}/interact", json=interact_payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data["from_agent"] == "小雪"
        assert data["to_agent"] == "阿杰"
        assert len(data["message"]) > 0
        assert data["source"] in ["mock", "llm"]

    def test_scene_checkpoint_lifecycle(self, client):
        """场景存档生命周期：创建→列表→删除。"""
        scene_id = "classroom"

        # 1. 投放 Agent
        agents_payload = [
            {
                "agentId": "agent-x",
                "name": "小林",
                "emoji": "👨‍💻",
                "color": "#4488ff",
                "tileX": 1,
                "tileY": 1,
                "action": "sit",
                "emotion": "neutral",
            },
        ]
        client.post(f"/api/scenes/{scene_id}/state", json=agents_payload)

        # 2. 创建存档
        checkpoint_payload = {
            "name": "课堂存档-第1 tick",
            "agents": agents_payload,
        }
        resp = client.post(f"/api/scenes/{scene_id}/checkpoints", json=checkpoint_payload)
        assert resp.status_code == 200
        checkpoint = resp.json()
        assert checkpoint["scene_id"] == scene_id
        assert checkpoint["name"] == "课堂存档-第1 tick"
        assert len(checkpoint["agents"]) == 1
        checkpoint_id = checkpoint["id"]

        # 3. 列出存档
        resp = client.get(f"/api/scenes/{scene_id}/checkpoints")
        assert resp.status_code == 200
        checkpoints = resp.json()
        assert len(checkpoints) >= 1
        assert any(c["id"] == checkpoint_id for c in checkpoints)

        # 4. 删除存档
        resp = client.delete(f"/api/scenes/{scene_id}/checkpoints/{checkpoint_id}")
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

        # 5. 验证删除成功
        resp = client.get(f"/api/scenes/{scene_id}/checkpoints")
        assert resp.status_code == 200
        assert all(c["id"] != checkpoint_id for c in resp.json())

    def test_scene_random_event(self, client):
        """场景随机事件：66-S 情绪引擎。"""
        scene_id = "sakura"

        # 多次请求，验证端点可用（随机性导致可能返回 null）
        for _ in range(5):
            resp = client.get(f"/api/scenes/{scene_id}/random-event")
            assert resp.status_code == 200
            data = resp.json()
            if data is not None:
                # 如果有事件，验证结构
                assert "id" in data
                assert "text" in data
                assert "emotion" in data
                assert "intensity" in data
                assert 1 <= data["intensity"] <= 3


# =============================================================================
# 独立函数测试（非类组织）
# =============================================================================


@pytest.mark.asyncio
async def test_scene_engine_state_management():
    """SceneEngine 状态管理单元测试。"""
    from engines.scene.engine import SceneEngine, AgentSpriteData

    engine = SceneEngine()

    # 1. 空场景
    agents = engine.get_state("test_scene")
    assert agents == []

    # 2. 更新状态
    sprite1 = AgentSpriteData(
        agentId="a1", name="测试A", emoji="🤖", color="#888",
        tileX=0, tileY=0, action="idle", emotion="neutral",
    )
    sprite2 = AgentSpriteData(
        agentId="a2", name="测试B", emoji="🧪", color="#44f",
        tileX=5, tileY=3, action="walk", emotion="happy",
    )
    result = engine.update_state("test_scene", [sprite1, sprite2])
    assert len(result) == 2

    # 3. 添加 Agent
    sprite3 = AgentSpriteData(
        agentId="a3", name="测试C", emoji="🎨", color="#f44",
        tileX=2, tileY=2, action="sit", emotion="sad",
    )
    result = engine.add_agent("test_scene", sprite3)
    assert len(result) == 3

    # 4. 删除 Agent
    result = engine.remove_agent("test_scene", "a2")
    assert len(result) == 2
    assert all(a.agentId != "a2" for a in result)


@pytest.mark.asyncio
async def test_emotion_detection():
    """情绪关键词检测。"""
    from engines.scene.engine import detect_emotion

    # 正面情绪
    assert detect_emotion("天哪好美！") == "happy"
    assert detect_emotion("太棒了！") == "happy"

    # 负面情绪
    assert detect_emotion("烦死了") == "angry"
    assert detect_emotion("好累啊") == "tired"

    # 焦虑
    assert detect_emotion("来不及了") == "anxious"

    # 无情绪关键词
    assert detect_emotion("今天天气不错") is None


@pytest.mark.asyncio
async def test_random_event_engine():
    """随机事件引擎。"""
    from engines.scene.engine import RandomEventEngine

    engine = RandomEventEngine()

    # 多次调用，验证返回类型正确
    events_seen = set()
    for _ in range(20):
        event = engine.get_for_scene("library")
        if event is not None:
            events_seen.add(event.id)
            assert event.emotion in ["happy", "anxious", "angry", "sad", "surprised", "excited", "confused", "tired"]
            assert 1 <= event.intensity <= 3

    # 图书馆场景应该能看到图书馆专属事件
    # （由于随机性，不强制要求看到特定事件）


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])


# =============================================================================
# Step 81: SceneBridge 集成测试
# =============================================================================

from types import SimpleNamespace

from engines.scene.engine import SceneBridge, SceneEngine, AgentSpriteData


def _make_mock_agent(agent_id, name="小明", tile_x=2, tile_y=3,
                     emotion_label="neutral"):
    return SimpleNamespace(
        id=agent_id,
        persona=SimpleNamespace(name=name, emoji="🧑", color="#8888cc"),
        position={"tile_x": tile_x, "tile_y": tile_y},
        emotional_state=SimpleNamespace(label=emotion_label),
    )


class TestSceneBridgeIntegration:
    """SceneBridge 双向同步 + move_agent 集成测试。"""

    def test_roundtrip_world_to_scene_and_back(self):
        """WorldEngine → SceneEngine → WorldEngine 位置往返一致性。"""
        scene_eng = SceneEngine()
        agent = _make_mock_agent("a1", tile_x=3, tile_y=4)
        we = SimpleNamespace(agents={"a1": agent})

        bridge = SceneBridge("library", we)

        # 替换全局 scene_engine
        import engines.scene.engine as mod
        original = mod.scene_engine
        mod.scene_engine = scene_eng
        try:
            # WorldEngine → SceneEngine
            sprites = bridge.sync_to_scene()
            assert len(sprites) == 1
            assert sprites[0].tileX == 3

            # 修改 SceneEngine 中的位置
            scene_eng.update_state("library", [
                AgentSpriteData(
                    agentId="a1", name="小明", emoji="🧑", color="#888",
                    tileX=9, tileY=8, action="walk", emotion="happy",
                ),
            ])

            # SceneEngine → WorldEngine
            bridge.sync_to_world()
            assert we.agents["a1"].position["tile_x"] == 9
            assert we.agents["a1"].position["tile_y"] == 8
        finally:
            mod.scene_engine = original

    def test_move_agent_updates_both_world_and_scene(self):
        """move_agent 同时更新 WorldEngine 和 SceneEngine。"""
        scene_eng = SceneEngine()
        agent = _make_mock_agent("a1", tile_x=1, tile_y=1)
        we = SimpleNamespace(agents={"a1": agent})

        bridge = SceneBridge("dorm", we)

        import engines.scene.engine as mod
        original = mod.scene_engine
        mod.scene_engine = scene_eng
        try:
            ok = bridge.move_agent("a1", 7, 6)
            assert ok is True
            # WorldEngine 已更新
            assert we.agents["a1"].position["tile_x"] == 7
            # SceneEngine 也已更新
            scene_sprites = scene_eng.get_state("dorm")
            assert len(scene_sprites) == 1
            assert scene_sprites[0].tileX == 7
            assert scene_sprites[0].tileY == 6
        finally:
            mod.scene_engine = original

    def test_multi_agent_sync_preserves_all_positions(self):
        """多 Agent 同步时所有位置都正确保留。"""
        scene_eng = SceneEngine()
        agents = {
            "a1": _make_mock_agent("a1", "小明", 1, 2),
            "a2": _make_mock_agent("a2", "小红", 5, 6, "happy"),
            "a3": _make_mock_agent("a3", "小刚", 9, 10, "anxious"),
        }
        we = SimpleNamespace(agents=agents)
        bridge = SceneBridge("classroom", we)

        import engines.scene.engine as mod
        original = mod.scene_engine
        mod.scene_engine = scene_eng
        try:
            sprites = bridge.sync_to_scene()
            assert len(sprites) == 3
            pos_map = {s.agentId: (s.tileX, s.tileY) for s in sprites}
            assert pos_map["a1"] == (1, 2)
            assert pos_map["a2"] == (5, 6)
            assert pos_map["a3"] == (9, 10)
            emo_map = {s.agentId: s.emotion for s in sprites}
            assert emo_map["a2"] == "happy"
            assert emo_map["a3"] == "anxious"
        finally:
            mod.scene_engine = original

    def test_random_event_integration(self):
        """SceneBridge.try_random_event 与 SceneEngine 集成。"""
        scene_eng = SceneEngine()
        we = SimpleNamespace(agents={"a1": _make_mock_agent("a1")})
        bridge = SceneBridge("library", we)

        import engines.scene.engine as mod
        original = mod.scene_engine
        mod.scene_engine = scene_eng
        try:
            # 多次调用，验证不报错且返回类型正确
            for _ in range(10):
                result = bridge.try_random_event()
                if result is not None:
                    assert "id" in result
                    assert "text" in result
                    assert "emotion" in result
        finally:
            mod.scene_engine = original
