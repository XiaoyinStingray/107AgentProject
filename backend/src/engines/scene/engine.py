"""
SceneEngine — 场景中 Agent 精灵状态管理。

当前（Step 63b）：纯内存存储，接收前端投放的 Agent 状态。
后续（Step 65+）：接入 WorldEngine tick，每 tick 更新位置/动作/情绪。
"""

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class AgentSpriteData:
    """单个 Agent 精灵的状态——与前端 AgentSpriteData 对齐"""
    agentId: str
    name: str
    emoji: str
    color: str
    tileX: int
    tileY: int
    action: str    # idle | walk | sit | talk
    emotion: str   # neutral | happy | anxious | angry | sad


@dataclass
class SceneState:
    """单个场景的完整状态"""
    scene_id: str
    agents: list[AgentSpriteData] = field(default_factory=list)


class SceneEngine:
    """
    场景引擎——管理各场景的 Agent 状态。

    当前为纯内存存储（进程重启后丢失），
    后续 Step 可接入 SQLite / SceneSnapshot 持久化。
    """

    def __init__(self):
        self._scenes: dict[str, SceneState] = {}

    def _get_or_create(self, scene_id: str) -> SceneState:
        if scene_id not in self._scenes:
            self._scenes[scene_id] = SceneState(scene_id=scene_id)
        return self._scenes[scene_id]

    def get_state(self, scene_id: str) -> list[AgentSpriteData]:
        """获取某场景当前 Agent 状态"""
        return self._get_or_create(scene_id).agents

    def update_state(
        self, scene_id: str, agents: list[AgentSpriteData],
    ) -> list[AgentSpriteData]:
        """替换某场景的全部 Agent 状态"""
        scene = self._get_or_create(scene_id)
        scene.agents = agents
        return scene.agents

    def add_agent(self, scene_id: str, agent: AgentSpriteData) -> list[AgentSpriteData]:
        """向场景添加单个 Agent"""
        scene = self._get_or_create(scene_id)
        # 已存在则替换
        existing = next((a for a in scene.agents if a.agentId == agent.agentId), None)
        if existing:
            existing.tileX = agent.tileX
            existing.tileY = agent.tileY
            existing.action = agent.action
            existing.emotion = agent.emotion
        else:
            scene.agents.append(agent)
        return scene.agents

    def remove_agent(self, scene_id: str, agent_id: str) -> list[AgentSpriteData]:
        """从场景移除单个 Agent"""
        scene = self._get_or_create(scene_id)
        scene.agents = [a for a in scene.agents if a.agentId != agent_id]
        return scene.agents


# 全局单例
scene_engine = SceneEngine()
