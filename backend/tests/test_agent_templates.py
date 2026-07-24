"""Agent 静态模板与 GET /api/templates 测试。"""

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.templates import router
from engines.persona.template_library import load_agent_templates


def test_template_library_has_30_unique_valid_templates():
    templates = load_agent_templates()

    assert len(templates) >= 30
    assert len({template.id for template in templates}) == len(templates)
    assert len({template.category for template in templates}) >= 5
    assert all(template.seed_prompt and template.summary for template in templates)


def test_get_templates_returns_static_library():
    app = FastAPI()
    app.include_router(router)

    response = TestClient(app).get("/api/templates")

    assert response.status_code == 200
    payload = response.json()
    assert len(payload) >= 30
    assert {"id", "name", "category", "summary", "seed_prompt", "tags"} <= payload[0].keys()
