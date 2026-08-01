"""
Checkpoint ORM 单元测试 — Step 74。
覆盖: CRUD、场景查询、删除、上限检查。
"""

import json
import tempfile
from datetime import datetime, timezone

import pytest
import pytest_asyncio
from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from db import Base
import models.checkpoint_orm
from models.checkpoint_orm import CheckpointRow

pytestmark = pytest.mark.asyncio


# ── Fixtures ──────────────────────────────────────────────

_tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_tmp.close()
_DB_URL = f"sqlite+aiosqlite:///{_tmp.name}"
_SYNC_URL = f"sqlite:///{_tmp.name}"


@pytest.fixture(autouse=True)
def _reset_db():
    """每个测试前重建表。"""
    engine = create_engine(_SYNC_URL)
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    engine.dispose()
    yield


@pytest_asyncio.fixture
async def session():
    engine = create_async_engine(_DB_URL)
    async_session = async_sessionmaker(engine, expire_on_commit=False)
    async with async_session() as s:
        yield s
    await engine.dispose()


# =====================================================================
# CheckpointRow Tests
# =====================================================================


class TestCheckpointRow:

    async def test_create_checkpoint(self, session):
        """创建存档，字段正确。"""
        agents_data = [
            {"agentId": "a1", "name": "测试A", "emoji": "🤖", "color": "#888",
             "tileX": 0, "tileY": 0, "action": "idle", "emotion": "neutral"},
        ]
        row = CheckpointRow(
            id="cp-001",
            scene_id="library",
            name="测试存档",
            agents_json=json.dumps(agents_data, ensure_ascii=False),
            created_at=datetime.now(timezone.utc),
        )
        session.add(row)
        await session.commit()
        await session.refresh(row)

        assert row.id == "cp-001"
        assert row.scene_id == "library"
        assert row.name == "测试存档"
        assert json.loads(row.agents_json) == agents_data

    async def test_list_by_scene(self, session):
        """list_by_scene 返回指定场景的所有存档，按时间倒序。"""
        # 创建 3 个存档
        for i in range(3):
            row = CheckpointRow(
                id=f"cp-{i}",
                scene_id="dorm",
                name=f"存档{i}",
                agents_json="[]",
                created_at=datetime.now(timezone.utc),
            )
            session.add(row)
        await session.commit()

        # 查询
        results = await CheckpointRow.list_by_scene(session, "dorm")
        assert len(results) == 3
        # 验证按时间倒序（最新的在前）
        assert results[0].id == "cp-2"
        assert results[2].id == "cp-0"

    async def test_list_by_scene_empty(self, session):
        """list_by_scene 空场景返回空列表。"""
        results = await CheckpointRow.list_by_scene(session, "nonexistent")
        assert results == []

    async def test_count_by_scene(self, session):
        """count_by_scene 返回正确数量。"""
        # 创建 5 个存档
        for i in range(5):
            row = CheckpointRow(
                id=f"cp-count-{i}",
                scene_id="classroom",
                name=f"存档{i}",
                agents_json="[]",
                created_at=datetime.now(timezone.utc),
            )
            session.add(row)
        await session.commit()

        count = await CheckpointRow.count_by_scene(session, "classroom")
        assert count == 5

    async def test_count_by_scene_empty(self, session):
        """count_by_scene 空场景返回 0。"""
        count = await CheckpointRow.count_by_scene(session, "nonexistent")
        assert count == 0

    async def test_delete_by_scene_and_id(self, session):
        """delete_by_scene_and_id 正确删除指定存档。"""
        # 创建 2 个存档
        for i in range(2):
            row = CheckpointRow(
                id=f"cp-del-{i}",
                scene_id="art",
                name=f"存档{i}",
                agents_json="[]",
                created_at=datetime.now(timezone.utc),
            )
            session.add(row)
        await session.commit()

        # 删除第一个
        ok = await CheckpointRow.delete_by_scene_and_id(session, "art", "cp-del-0")
        assert ok is True

        # 验证只剩 1 个
        count = await CheckpointRow.count_by_scene(session, "art")
        assert count == 1

        # 验证删除的是正确的那个
        results = await CheckpointRow.list_by_scene(session, "art")
        assert results[0].id == "cp-del-1"

    async def test_delete_nonexistent(self, session):
        """delete_by_scene_and_id 删除不存在的存档返回 False。"""
        ok = await CheckpointRow.delete_by_scene_and_id(session, "lab", "nonexistent")
        assert ok is False

    async def test_delete_wrong_scene(self, session):
        """delete_by_scene_and_id 场景不匹配时不删除。"""
        row = CheckpointRow(
            id="cp-wrong",
            scene_id="sakura",
            name="存档",
            agents_json="[]",
            created_at=datetime.now(timezone.utc),
        )
        session.add(row)
        await session.commit()

        # 尝试用错误的 scene_id 删除
        ok = await CheckpointRow.delete_by_scene_and_id(session, "library", "cp-wrong")
        assert ok is False

        # 验证存档仍存在
        count = await CheckpointRow.count_by_scene(session, "sakura")
        assert count == 1

    async def test_max_per_scene_constant(self):
        """MAX_PER_SCENE 常量为 30。"""
        assert CheckpointRow.MAX_PER_SCENE == 30

    async def test_agents_json_serialization(self, session):
        """agents_json 正确序列化复杂数据。"""
        agents_data = [
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
        row = CheckpointRow(
            id="cp-json",
            scene_id="library",
            name="JSON测试",
            agents_json=json.dumps(agents_data, ensure_ascii=False),
            created_at=datetime.now(timezone.utc),
        )
        session.add(row)
        await session.commit()
        await session.refresh(row)

        loaded = json.loads(row.agents_json)
        assert len(loaded) == 2
        assert loaded[0]["name"] == "小林"
        assert loaded[1]["emotion"] == "happy"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
