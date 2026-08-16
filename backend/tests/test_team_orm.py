"""
Team ORM + Plan ORM 单元测试 — Step T1。
覆盖: CRUD、JSON 序列化、状态转换。
"""

import json
import tempfile

import pytest
import pytest_asyncio
from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from db import Base
import models.team_orm
import models.plan_orm
from models.team_orm import TeamRow
from models.plan_orm import PlanRow, summarize_plan_steps

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
# TeamRow Tests
# =====================================================================


class TestTeamRow:

    async def test_from_create_basic(self, session):
        """from_create 构造后字段正确。"""
        row = TeamRow.from_create(
            team_id="t1",
            name="测试团队",
            description="描述",
            agent_ids=["a1", "a2"],
            roles=[{"agent_id": "a1", "role": "PM", "reason": "测试"}],
        )
        session.add(row)
        await session.commit()

        assert row.id == "t1"
        assert row.name == "测试团队"
        assert row.status == "idle"
        assert json.loads(row.agent_ids) == ["a1", "a2"]
        assert json.loads(row.roles)[0]["role"] == "PM"

    async def test_to_dict_deserializes_json(self, session):
        """to_dict 将 JSON 字符串反序列化为 Python 对象。"""
        row = TeamRow.from_create(
            team_id="t2", name="字典测试", description="",
            agent_ids=["x"], roles=[],
        )
        session.add(row)
        await session.commit()

        d = row.to_dict()
        assert isinstance(d["agent_ids"], list)
        assert d["agent_ids"] == ["x"]
        assert isinstance(d["roles"], list)
        assert d["status"] == "idle"
        assert "created_at" in d

    async def test_status_transition(self, session):
        """状态转换: idle → executing → finished。"""
        row = TeamRow.from_create(
            team_id="t3", name="状态测试", description="",
            agent_ids=["a1"], roles=[],
        )
        session.add(row)
        await session.commit()
        assert row.status == "idle"

        row.status = "executing"
        await session.commit()
        assert row.status == "executing"

        row.status = "finished"
        await session.commit()
        assert row.status == "finished"

    async def test_roles_json_roundtrip(self, session):
        """角色 JSON 序列化/反序列化保持结构。"""
        roles = [
            {"agent_id": "a1", "role": "产品经理", "reason": "ENFP 擅长沟通"},
            {"agent_id": "a2", "role": "后端开发", "reason": "ISTJ 严谨"},
        ]
        row = TeamRow.from_create(
            team_id="t4", name="JSON测试", description="",
            agent_ids=["a1", "a2"], roles=roles,
        )
        session.add(row)
        await session.commit()

        loaded = json.loads(row.roles)
        assert len(loaded) == 2
        assert loaded[0]["role"] == "产品经理"
        assert loaded[1]["reason"] == "ISTJ 严谨"


# =====================================================================
# PlanRow Tests
# =====================================================================


class TestPlanRow:

    async def test_step_summary_distinguishes_partial_from_success(self, session):
        summary = summarize_plan_steps([
            {"id": "s1", "status": "error"},
            {"id": "s2", "status": "done"},
        ], "finished")

        assert summary == {
            "outcome": "partial",
            "total_steps": 2,
            "completed_steps": 1,
            "failed_steps": 1,
        }

    async def test_finished_plan_with_only_errors_is_failed(self, session):
        summary = summarize_plan_steps([
            {"id": "s1", "status": "error"},
        ], "finished")

        assert summary["outcome"] == "failed"

    async def test_from_decomposition(self, session):
        """from_decomposition 正确持久化步骤。"""
        steps = [
            {"id": "s1", "title": "需求分析", "assignee": "a1", "status": "pending", "progress": 0.0},
            {"id": "s2", "title": "技术方案", "assignee": "a2", "status": "pending", "progress": 0.0},
        ]
        row = PlanRow.from_decomposition(
            plan_id="p1", team_id="t1", task="设计 App", steps=steps,
        )
        session.add(row)
        await session.commit()

        assert row.team_id == "t1"
        assert row.task == "设计 App"
        assert row.status == "executing"
        loaded = json.loads(row.steps)
        assert len(loaded) == 2
        assert loaded[0]["title"] == "需求分析"

    async def test_to_dict(self, session):
        """to_dict 包含所有必要字段。"""
        row = PlanRow.from_decomposition(
            plan_id="p2", team_id="t2", task="测试任务",
            steps=[{"id": "s1", "title": "步骤一", "status": "done"}],
        )
        row.world_id = "w1"
        session.add(row)
        await session.commit()

        d = row.to_dict()
        assert d["id"] == "p2"
        assert d["team_id"] == "t2"
        assert d["world_id"] == "w1"
        assert isinstance(d["steps"], list)
        assert d["report"] is None
        assert d["outcome"] == "success"
        assert d["completed_steps"] == 1
        assert d["failed_steps"] == 0

    async def test_status_transition(self, session):
        """Plan 状态: executing → finished。"""
        row = PlanRow.from_decomposition(
            plan_id="p3", team_id="t3", task="", steps=[],
        )
        session.add(row)
        await session.commit()
        assert row.status == "executing"

        row.status = "finished"
        await session.commit()
        assert row.status == "finished"

    async def test_report_json(self, session):
        """report 字段 JSON 序列化。"""
        row = PlanRow.from_decomposition(
            plan_id="p4", team_id="t4", task="", steps=[],
        )
        report = {"title": "复盘报告", "content": "# 报告内容"}
        row.report = json.dumps(report, ensure_ascii=False)
        session.add(row)
        await session.commit()

        d = row.to_dict()
        assert d["report"]["title"] == "复盘报告"

    async def test_failed_step_error_is_persisted_for_reload(self, session):
        from engines.team.engine import TeamEngine

        row = PlanRow.from_decomposition(
            plan_id="p-error", team_id="t-error", task="测试错误恢复",
            steps=[{"id": "s1", "title": "失败步骤", "status": "pending"}],
        )
        session.add(row)
        await session.commit()

        engine = TeamEngine(team={"id": "t-error"}, db=session)
        engine._plan_id = row.id
        await engine._update_plan_step(
            "s1",
            "error",
            {"files": [], "error": "Request timed out"},
        )
        await session.refresh(row)

        step = row.to_dict()["steps"][0]
        assert step["status"] == "error"
        assert step["result"]["error"] == "Request timed out"
