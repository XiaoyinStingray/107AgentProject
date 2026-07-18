"""
Agent 路由 — CRUD API for LifeAgent。

路由:
    POST   /api/agents        创建 Agent（自然语言描述）
    GET    /api/agents        列出所有 Agent
    GET    /api/agents/{id}   获取 Agent 详情
    DELETE /api/agents/{id}   删除 Agent
"""

from fastapi import APIRouter, Depends, HTTPException

from engines.agent_factory.factory import AgentFactory, LifeAgent
from models.agent import AgentCreate, AgentResponse

router = APIRouter(prefix="/api/agents", tags=["agents"])


# =============================================================================
# 内存 Agent 存储（P0 — Phase 5.3 升级为 SQLite）
# =============================================================================

class AgentStore:
    """内存 Agent 注册表。"""

    def __init__(self):
        self._agents: dict[str, LifeAgent] = {}

    def save(self, agent: LifeAgent):
        self._agents[agent.id] = agent

    def list_all(self) -> list[LifeAgent]:
        return list(self._agents.values())

    def get(self, agent_id: str) -> LifeAgent | None:
        return self._agents.get(agent_id)

    def delete(self, agent_id: str) -> bool:
        if agent_id in self._agents:
            del self._agents[agent_id]
            return True
        return False


_agent_store = AgentStore()


# =============================================================================
# FastAPI 依赖
# =============================================================================

def get_agent_store() -> AgentStore:
    return _agent_store


def get_agent_factory() -> AgentFactory:
    """创建 AgentFactory（注入真实 LLM 客户端）。"""
    from llm.client import create_model_client

    return AgentFactory(create_model_client())


# =============================================================================
# 路由
# =============================================================================


@router.post("/", response_model=AgentResponse, status_code=201)
async def create_agent(
    req: AgentCreate,
    store: AgentStore = Depends(get_agent_store),
    factory: AgentFactory = Depends(get_agent_factory),
):
    """自然语言描述 → 完整 Agent。"""
    try:
        agent = await factory.create_from_description(req.description)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    store.save(agent)
    return agent.to_response()


@router.get("/", response_model=list[AgentResponse])
async def list_agents(store: AgentStore = Depends(get_agent_store)):
    return [a.to_response() for a in store.list_all()]


@router.get("/{agent_id}", response_model=AgentResponse)
async def get_agent(
    agent_id: str,
    store: AgentStore = Depends(get_agent_store),
):
    agent = store.get(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent {agent_id!r} not found")
    return agent.to_response()


@router.delete("/{agent_id}")
async def delete_agent(
    agent_id: str,
    store: AgentStore = Depends(get_agent_store),
):
    if not store.delete(agent_id):
        raise HTTPException(status_code=404, detail=f"Agent {agent_id!r} not found")
    return {"ok": True}
