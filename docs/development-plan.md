# 人生实验室 · Life Lab — 串行开发计划

> **文档目的：** 自顶向下、接口先行、模块串行的完整开发计划。
> **目标读者：** 人类开发者 + AI（vibe coding 友好）。
> **设计原则：** 每个 phase 自包含，有明确输入/输出接口，有 Mock 可独立测试。
>
> **配套流程：** 每一步开发遵循 [STEP.md](STEP.md)，完成后写入 [docs/done/](done/README.md)。

---

## Step 速查表

| Step | Phase | 名称 | 依赖 | 核心产出 |
|------|-------|------|------|----------|
| 00 | 0.1 | 项目目录初始化 | — | 目录骨架 + `/health` |
| 01 | 0.2 | Pydantic 类型定义 | 00 | 所有 shared types |
| 02 | 0.3 | 配置 + DB + TS 类型 | 01 | config.py + db.py + 前端 types/ |
| 03 | 1.1 | Persona Builder | 02 | 一句话 → Persona JSON |
| 04 | 1.2 | System Prompt 构建器 | 03 | Persona → system_message str |
| 05 | 2.1 | LifeAgent 封装 | 04 | AgentFactory + LifeAgent |
| 06 | 2.2 | Tool 注册体系 | 05 | Agent 行动 tools |
| 07 | 2.3 | 记忆检索器 | 02 | MemoryRetriever |
| 08 | 3.1 | 场景模板 | 02 | 3 个内置 Scenario |
| 09 | 3.2 | Tick 调度器 | 05, 08 | WorldEngine.tick() |
| 10 | 3.3 | 关系演化 | 09 | 双向量化关系 |
| 11 | 4.1 | AutoGen → SSE 翻译 | 09 | SSE 事件流 |
| 12 | 5.1 | Agent 路由 | 05 | /api/agents CRUD |
| 13 | 5.2 | World 路由 | 09 | /api/worlds CRUD |
| 14 | 5.3 | main.py 组装 + 全局 registry | 12, 13 | FastAPI app 完整启动 |
| 15 | 6.1 | 叙事引擎 | 09 | Event → Story/Diary/Letter |
| 16 | 7.1 | 前端骨架 + Sidebar (56菜单) | 02 | App.tsx + 布局 + 路由 |
| 17 | 7.2 | 铸造厂页面 (M1) | 16 | AgentFoundry.tsx |
| 18 | 7.3 | SSE Hook + 思维流组件 | 16 | useSSE + ThoughtBubble |
| 19 | 7.4 | 单人剧场 (M2) | 18 | SoloTheater.tsx |
| 20 | 7.5 | 主观察界面 (M3) | 19 | GroupSandbox.tsx |
| 21 | 7.6 | 关系网络图 | 20 | RelationshipGraph.tsx |
| 22 | 7.7 | 竞技场页面 (M4) | 16 | Arena.tsx |
| 23 | 7.8 | 叙事页面 (M5) | 15, 16 | NarrativeFactory.tsx |
| 24 | 7.9 | 控制台 + 干预台 (M6/M7) | 20 | ControlPanel + Intervention |
| 25 | 7.10 | 档案馆 (M8) | 16 | Archive.tsx |
| 26 | 8.1 | 竞技引擎 | 05, 09 | ArenaEngine (debate/1v1) |
| 27 | 9.1 | 56 菜单铺量 + 报告导出 | 25 | 占位页 + PDF 导出 |
| 28 | 9.2 | 演示脚本 + 最终联调 | 27 | demo-script.md |

> **共 29 个 Step。** 每个 Step 约 2-4 小时（一个人 + AI）。

---

## 目录

- [Phase 0: 基础设施与类型系统](#phase-0-基础设施与类型系统)
- [Phase 1: 人格引擎 (Persona Engine)](#phase-1-人格引擎-persona-engine)
- [Phase 2: Agent 工厂 (Agent Shell)](#phase-2-agent-工厂-agent-shell)
- [Phase 3: 世界引擎 (World Engine)](#phase-3-世界引擎-world-engine)
- [Phase 4: SSE 桥接](#phase-4-sse-桥接)
- [Phase 5: FastAPI 服务层](#phase-5-fastapi-服务层)
- [Phase 6: 叙事引擎 (Narrative Engine)](#phase-6-叙事引擎-narrative-engine)
- [Phase 7: 前端](#phase-7-前端)
- [Phase 8: 竞技场 (Arena)](#phase-8-竞技场-arena)
- [Phase 9: 打磨与铺量](#phase-9-打磨与铺量)
- [附录: 依赖关系图](#附录-依赖关系图)

---

## Phase 0: 基础设施与类型系统

> **目标：** 搭好项目骨架，定义所有模块间共享的类型（Pydantic + TypeScript），所有后续 phase 依赖此 phase。
> **不涉及：** 任何业务逻辑、LLM 调用、AutoGen。
> **产出：** 项目能 `python main.py` 启动（返回 200），数据库能创建表。

---

### 0.1 项目目录初始化

**文件清单：**

```
backend/
├── src/
│   ├── __init__.py
│   ├── main.py              # FastAPI app（空壳，/health 端点）
│   ├── config.py             # 配置管理
│   ├── db.py                 # SQLite + aiosqlite 连接
│   ├── models/
│   │   ├── __init__.py
│   │   ├── base.py          ← 共享基类 (HasId → Timestamped → MutableTimestamped)
│   │   ├── agent.py
│   │   ├── world.py
│   │   ├── event.py
│   │   ├── memory.py
│   │   └── simulation.py
│   ├── engines/
│   │   └── __init__.py
│   ├── api/
│   │   └── __init__.py
│   └── llm/
│       └── __init__.py
├── tests/
│   ├── __init__.py
│   └── conftest.py
└── data/                     # SQLite 文件放这里（gitignore）
    └── .gitkeep

frontend/
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── types/
│   │   ├── agent.ts
│   │   ├── world.ts
│   │   └── events.ts
│   ├── stores/
│   ├── hooks/
│   ├── pages/
│   ├── components/
│   │   ├── layout/
│   │   ├── agent/
│   │   ├── world/
│   │   └── shared/
│   └── mocks/
└── index.html
```

**AI Prompt Template:**
```
Create a FastAPI project with this structure:
- main.py with /health endpoint returning {"status": "ok"}
- config.py using pydantic-settings to read .env
- db.py with aiosqlite async connection, creating tables from models
- Empty __init__.py files for all packages
```

---

### 0.2 共享类型定义 — Pydantic 模型

> **这是整个项目的"接口宪法"。** 所有引擎、API、前端都基于这些类型通信。
> **规则：** 改类型 = 改接口 = 所有下游都要 check。所以一次定义清楚。

**文件: `backend/src/models/agent.py`**

```python
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

# ========== 人格结构 ==========
class BigFive(BaseModel):
    """大五人格 (0-1)"""
    openness: float = Field(default=0.5, ge=0, le=1)
    conscientiousness: float = Field(default=0.5, ge=0, le=1)
    extraversion: float = Field(default=0.5, ge=0, le=1)
    agreeableness: float = Field(default=0.5, ge=0, le=1)
    neuroticism: float = Field(default=0.5, ge=0, le=1)

class DecisionStyle(BaseModel):
    """决策风格"""
    info_processing: str = "balanced"     # intuitive | analytical | balanced
    risk_preference: str = "moderate"     # averse | moderate | seeking
    social_tendency: str = "cooperative"  # competitive | cooperative | independent
    stress_response: str = "adaptive"     # avoidant | reactive | adaptive | resilient

class Persona(BaseModel):
    """Agent 人格定义"""
    name: str = ""               # 2026-07-17 Step05 新增——LLM 生成的 2-3 字中文名
    mbti: str = "INTJ-T"
    big_five: BigFive = Field(default_factory=BigFive)
    values: list[str] = Field(default_factory=list)       # ["成就", "自由", "安全"]
    decision_style: DecisionStyle = Field(default_factory=DecisionStyle)
    narrative: str = ""  # 200-400 字人格画像（LLM 生成）

class Background(BaseModel):
    """背景故事"""
    hometown: str = ""
    family: str = ""
    education: str = ""
    key_events: list[str] = Field(default_factory=list)

class Goal(BaseModel):
    """层级化目标"""
    id: str
    description: str
    priority: int = 1          # 1=最高
    deadline: Optional[str] = None  # ISO datetime
    status: str = "active"     # active | achieved | abandoned

# ========== Agent 主模型 ==========
class EmotionalState(BaseModel):
    """情绪状态 (VAD 模型)"""
    valence: float = 0.5       # 愉悦度 0-1
    arousal: float = 0.5       # 唤醒度 0-1
    dominance: float = 0.5     # 支配感 0-1
    label: str = "neutral"     # happy | sad | angry | anxious | excited | neutral

class AgentCreate(BaseModel):
    """创建 Agent 的请求体"""
    description: str = Field(..., min_length=3, description="自然语言描述")

class AgentResponse(BaseModel):
    """Agent 的 API 响应"""
    id: str
    name: str
    persona: Persona
    background: Background
    goals: list[Goal] = Field(default_factory=list)
    emotional_state: EmotionalState = Field(default_factory=EmotionalState)
    energy: float = 100.0
    created_at: str
    updated_at: str
```

**文件: `backend/src/models/world.py`**

```python
from pydantic import BaseModel, Field
from typing import Optional

class Scenario(BaseModel):
    """场景定义"""
    name: str
    description: str
    time_range: str = "1-30"     # tick 范围
    initial_events: list[str] = Field(default_factory=list)
    environment_params: dict = Field(default_factory=dict)

class WorldCreate(BaseModel):
    """创建 World 的请求体"""
    name: str
    scenario: Scenario
    agent_ids: list[str] = Field(default_factory=list)

class WorldResponse(BaseModel):
    """World 的 API 响应"""
    id: str
    name: str
    scenario: Scenario
    agent_ids: list[str]
    current_tick: int = 0
    status: str = "idle"        # idle | running | paused | finished
    created_at: str
```

**文件: `backend/src/models/event.py`**

```python
from pydantic import BaseModel
from typing import Optional

class SimEvent(BaseModel):
    """模拟事件——这是核心通信单位"""
    id: str
    world_id: str
    tick: int
    type: str                   # thought | agent_message | agent_action | world_event | relationship_change | tick_boundary
    source_agent_id: Optional[str] = None
    target_agent_ids: list[str] = Field(default_factory=list)
    description: str
    data: dict = Field(default_factory=dict)  # 附加结构数据
    created_at: str
```

**文件: `backend/src/models/memory.py`**

```python
from pydantic import BaseModel, Field

class MemoryCreate(BaseModel):
    """创建记忆"""
    agent_id: str
    type: str          # episodic | semantic
    content: str
    importance: float = Field(default=0.5, ge=0, le=1)

class MemoryResponse(BaseModel):
    """记忆响应"""
    id: str
    agent_id: str
    type: str
    content: str
    importance: float
    keywords: str
    created_at: str
```

**文件: `backend/src/models/simulation.py`**

```python
from pydantic import BaseModel

class SimulationResponse(BaseModel):
    """模拟运行响应"""
    id: str
    world_id: str
    started_at: str
    ended_at: Optional[str] = None
    total_ticks: int = 0
    status: str = "running"
```

### 共享基类体系

> **2026-07-17 更新：** Plan 原始方案每个模型独立定义 `id`/`created_at`，导致 6 个类复制粘贴。实际实现引入基类体系，后续所有新模型遵循此模式。

**文件: `backend/src/models/base.py`**

```python
from pydantic import BaseModel

class HasId(BaseModel):
    """有 id 的实体基类"""
    id: str

class Timestamped(HasId):
    """有 id + created_at"""
    created_at: str

class MutableTimestamped(Timestamped):
    """有 id + created_at + updated_at"""
    updated_at: str
```

**继承关系：**

| 基类 | 适用模型 | 字段 |
|------|---------|------|
| `HasId` | `Goal`, `SimulationResponse` | `id` |
| `Timestamped` | `WorldResponse`, `SimEvent`, `MemoryResponse` | `id`, `created_at` |
| `MutableTimestamped` | `AgentResponse` | `id`, `created_at`, `updated_at` |
| `BaseModel` | `Persona`, `BigFive`, `Scenario`, `MemoryCreate` 等 | 无（不需要 id） |

**验收标准:**
- [ ] `python -c "from backend.src.models.agent import Persona; print(Persona())"` 成功
- [ ] 所有模型能 `model_dump()` 序列化为 dict

---

### 0.3 配置系统

**文件: `backend/src/config.py`**

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    # API
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    debug: bool = False

    # LLM
    llm_api_key: str = ""
    llm_base_url: str = "https://api.deepseek.com/v1"
    llm_model: str = "deepseek-chat"
    llm_temperature_think: float = 0.8
    llm_temperature_act: float = 0.5
    llm_max_tokens: int = 4096

    # 数据库
    database_url: str = "sqlite+aiosqlite:///./backend/data/lifelab.db"

    # Agent 限制
    max_ticks_per_simulation: int = 100
    max_agents_per_world: int = 8
    agent_timeout_seconds: int = 30

settings = Settings()


def ensure_dirs() -> None:
    """确保运行时需要的目录存在。在应用启动时调用，不在 import 时执行。"""
    _data_dir = Path("backend/data")
    _data_dir.mkdir(parents=True, exist_ok=True)
```

**文件: `backend/src/db.py`**

```python
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from loguru import logger
from config import settings

engine = create_async_engine(
    settings.database_url, echo=settings.debug,
    connect_args={"check_same_thread": False},
)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

class Base(DeclarativeBase):
    """所有 ORM 模型继承此类。"""
    pass

async def get_db() -> AsyncSession:
    """async with 上下文管理器已自动管理 session 生命周期。"""
    async with async_session() as session:
        yield session

async def init_db():
    """创建所有未存在的表（启动时调用一次）。
    必须在函数内 import 所有 ORM 模型模块——DeclarativeBase 只在子类被 import 时注册。
    """
    import models.memory  # noqa: F401 — 注册 Memory ORM → memories 表
    import models.event   # noqa: F401 — 注册 Event ORM → events 表
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables ensured (SQLite)")
```

### 应用启动入口

> **2026-07-17 更新：** 原来 main.py 没有生命周期管理。实际实现加入 FastAPI `lifespan`（调用 `ensure_dirs()` + `init_db()`），并创建 `run.py` 一键启动脚本。

**文件: `run.py`（项目根目录）**

```python
"""一键启动: python run.py [--reload] [--port 9000]"""
import sys
from pathlib import Path
_src = Path(__file__).resolve().parent / "backend" / "src"
sys.path.insert(0, str(_src))

import uvicorn

if __name__ == "__main__":
    import argparse
    from config import settings  # pyright: ignore[reportMissingImports]

    parser = argparse.ArgumentParser()
    parser.add_argument("--reload", action="store_true")
    parser.add_argument("--port", type=int, default=settings.api_port)
    args = parser.parse_args()

    uvicorn.run("main:app", host=settings.api_host, port=args.port,
                reload=args.reload or settings.debug)
```

**文件: `backend/src/main.py` 中的 lifespan**

```python
from contextlib import asynccontextmanager
from config import ensure_dirs
from db import init_db

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Life Lab...")
    ensure_dirs()
    await init_db()
    logger.info("Life Lab ready")
    yield
    logger.info("Shutting down Life Lab")

app = FastAPI(..., lifespan=lifespan)
```

**启动方式：**

```
python run.py              # 生产模式
python run.py --reload     # 开发模式（热重载）
python run.py --port 9000  # 指定端口
```

---

### 0.4 前端类型定义

**文件: `frontend/src/types/agent.ts`**

```typescript
// 与后端 Pydantic 模型一一对应

export interface BigFive {
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
}

export interface DecisionStyle {
  info_processing: "intuitive" | "analytical" | "balanced";
  risk_preference: "averse" | "moderate" | "seeking";
  social_tendency: "competitive" | "cooperative" | "independent";
  stress_response: "avoidant" | "reactive" | "adaptive" | "resilient";
}

export interface Persona {
  mbti: string;
  big_five: BigFive;
  values: string[];
  decision_style: DecisionStyle;
  narrative: string;
}

export interface EmotionalState {
  valence: number;
  arousal: number;
  dominance: number;
  label: "happy" | "sad" | "angry" | "anxious" | "excited" | "neutral";
}

export interface Goal {
  id: string;
  description: string;
  priority: number;
  deadline?: string;
  status: "active" | "achieved" | "abandoned";
}

export interface AgentResponse {
  id: string;
  name: string;
  persona: Persona;
  background: { hometown: string; family: string; education: string; key_events: string[] };
  goals: Goal[];
  emotional_state: EmotionalState;
  energy: number;
  created_at: string;
  updated_at: string;
}

export interface AgentCreate {
  description: string;
}
```

**文件: `frontend/src/types/world.ts`**

```typescript
export interface Scenario {
  name: string;
  description: string;
  time_range: string;
  initial_events: string[];
  environment_params: Record<string, unknown>;
}

export interface WorldResponse {
  id: string;
  name: string;
  scenario: Scenario;
  agent_ids: string[];
  current_tick: number;
  status: "idle" | "running" | "paused" | "finished";
  created_at: string;
}

export interface WorldCreate {
  name: string;
  scenario: Scenario;
  agent_ids: string[];
}
```

**文件: `frontend/src/types/events.ts`**

```typescript
// SSE 事件类型——前端消费的核心数据流

export type SSEEventType =
  | "thought_stream"
  | "agent_message"
  | "agent_action"
  | "world_event"
  | "relationship_change"
  | "tick_boundary";

export interface SSEEvent {
  type: SSEEventType;
  agent_id?: string;
  agent_name?: string;
  phase?: string;
  content?: string;
  message?: string;
  subtext?: string;
  tone?: string;
  action?: string;
  target?: string;
  description?: string;
  tick: number;
  data?: Record<string, unknown>;
}
```

**验收标准:**
- [ ] `npx tsc --noEmit` 无类型错误

---

## Phase 1: 人格引擎 (Persona Engine)

> **目标：** 自然语言描述 → 完整的 Persona JSON → System Prompt 字符串。
> **上游依赖：** Phase 0（类型定义）
> **下游被依赖：** Phase 2 (Agent 工厂)、Phase 5 (API)
> **可独立测试：** Mock LLM 返回固定 Persona JSON 即可
> **对应蓝图模块：** M1.#1, #2, #4, #5

---

### 1.1 Persona Builder（核心）

**文件: `backend/src/engines/persona/builder.py`**

**输入接口：**
```python
# 输入
class PersonaBuildRequest:
    description: str              # "来自小镇的计算机系新生，内向但野心大"
    model_client: ChatCompletionClient  # AutoGen 的 LLM 客户端

# 输出
class PersonaBuildResult:
    persona: Persona              # 完整人格
    background: Background       # 补全的背景故事
    goals: list[Goal]           # 推断的目标
    raw_response: str            # LLM 原始返回（调试用）
```

**实现逻辑：**
1. 将 `description` 填入 prompt 模板
2. 调用 LLM，要求返回结构化 JSON
3. 解析 JSON → Pydantic 验证 → 如果格式不对重试 1 次
4. 返回 `PersonaBuildResult`

**Prompt 模板（内置在代码中）：**
```
你是一个角色设计师。根据以下描述，生成一个完整的人物设定。

描述：{description}

请返回 JSON 格式（不要 markdown 包装）：
{
  "name": "角色名（2-3字中文名）",
  "mbti": "MBTI类型",
  "big_five": {"openness": 0.0-1.0, "conscientiousness": 0.0-1.0, "extraversion": 0.0-1.0, "agreeableness": 0.0-1.0, "neuroticism": 0.0-1.0},
  "values": ["价值观1", "价值观2", "价值观3"],
  "decision_style": {
    "info_processing": "intuitive|analytical|balanced",
    "risk_preference": "averse|moderate|seeking",
    "social_tendency": "competitive|cooperative|independent",
    "stress_response": "avoidant|reactive|adaptive|resilient"
  },
  "narrative": "200-400字的第一人称人格画像，描述TA的内心世界、行为模式、核心矛盾",
  "background": {
    "hometown": "家乡",
    "family": "家庭背景一句话",
    "education": "教育背景",
    "key_events": ["人生关键事件1", "关键事件2"]
  },
  "goals": [
    {"id": "g1", "description": "目标描述", "priority": 1, "deadline": null, "status": "active"}
  ]
}
```

**Mock 数据（用于测试，不调 LLM）：**
```python
MOCK_PERSONA_JSON = {
    "name": "小明",
    "mbti": "INTJ-T",
    "big_five": {"openness": 0.7, "conscientiousness": 0.85, "extraversion": 0.25, "agreeableness": 0.5, "neuroticism": 0.6},
    "values": ["成就", "独立", "效率"],
    "decision_style": {"info_processing": "analytical", "risk_preference": "moderate", "social_tendency": "independent", "stress_response": "adaptive"},
    "narrative": "小明是一个来自小镇的年轻人...",
    "background": {"hometown": "安徽某县城", "family": "父母务农，独生子", "education": "中科大计算机系大二", "key_events": ["高考全县第一", "大一编程比赛失利"]},
    "goals": [{"id": "g1", "description": "保研清华", "priority": 1, "deadline": None, "status": "active"}],
}
```

**验收标准:**
- [ ] `PersonaBuilder.build("小镇做题家，社交恐惧，想进大厂")` → 返回合法 `PersonaBuildResult`
- [ ] JSON 解析失败时能重试 1 次
- [ ] Mock LLM 模式下能跑通

---

### 1.2 Prompt 构建器

**文件: `backend/src/engines/persona/prompt_templates.py`**

**输入:** `Persona` + `Background` + `list[Goal]` + `list[MemoryResponse]`
**输出:** `str`（AutoGen 的 `system_message`）

```python
def build_system_message(
    persona: Persona,
    background: Background,
    goals: list[Goal],
    recent_memories: list[MemoryResponse] | None = None,
    world_context: str = "",
) -> str:
    """将人格对象 → AutoGen Agent 的 system_message 字符串"""
    ...
```

**Prompt 结构（5 段式）：**
1. **你是谁** — `persona.narrative`
2. **你的核心价值观** — `persona.values`
3. **你的决策风格** — `persona.decision_style` 展开为自然语言
4. **你的记忆** — `recent_memories` 中取 top-5
5. **你的目标** — `goals` 按 priority 排序
6. **当前处境** — `world_context`（每 tick 刷新）

**验收标准:**
- [ ] `build_system_message(persona, bg, goals)` 返回 800-1500 字符的字符串
- [ ] 同一 Persona 每次返回相同字符串（纯函数）
- [ ] 包含世界上下文时，上下文在末尾

---

## Phase 2: Agent 工厂 (Agent Shell)

> **目标：** 把 Persona + AutoGen → 一个能用的 `LifeAgent` 实例。
> **上游依赖：** Phase 0（类型）、Phase 1（人格引擎）
> **下游被依赖：** Phase 3（世界引擎）、Phase 4（SSE）、Phase 5（API）
> **可独立测试：** 创建 Agent → 发一条消息 → 看输出
> **对应蓝图模块：** Agent Shell（AutoGen 封装）

---

### 2.1 LifeAgent 封装

**文件: `backend/src/engines/agent_factory/factory.py`**

**核心接口：**

```python
from autogen_agentchat.agents import AssistantAgent
from autogen_ext.models.openai import OpenAIChatCompletionClient

class LifeAgent:
    """一个自主 Agent 实体——AutoGen AssistantAgent 的薄封装"""

    def __init__(
        self,
        id: str,
        persona: Persona,
        background: Background,
        goals: list[Goal],
        model_client: OpenAIChatCompletionClient,
        tools: list[Callable] | None = None,
    ):
        self.id = id
        self.persona = persona
        self.background = background
        self.goals = goals
        self.emotional_state = EmotionalState()
        self.energy = 100.0

        # === 构建 AutoGen Agent ===
        system_message = build_system_message(persona, background, goals)
        # 2026-07-17 AutoGen 0.7 适配：
        #   max_consecutive_auto_reply → max_tool_iterations（参数重命名）
        #   system_message= 字符串 → _system_messages=[SystemMessage(...)]（内部 API 变更）
        #   persona.name 不再需要 hasattr——Persona 已加 name 字段（Step05）
        self._agent = AssistantAgent(
            name=persona.name or id,
            model_client=model_client,
            system_message=system_message,
            tools=tools or [],
            reflect_on_tool_use=True,
            max_tool_iterations=3,
        )

    @property
    def autogen_agent(self) -> AssistantAgent:
        """暴露底层 AutoGen Agent 给 GroupChat"""
        return self._agent

    def inject_context(self, world_state: str, memories: list[MemoryResponse]):
        """每 tick 前刷新上下文"""
        self._agent.system_message = build_system_message(
            self.persona, self.background, self.goals,
            recent_memories=memories,
            world_context=world_state,
        )

class AgentFactory:
    """Agent 工厂：Persona + LLM Client → LifeAgent"""

    def __init__(self, model_client: OpenAIChatCompletionClient):
        self.model_client = model_client
        self.persona_builder = PersonaBuilder(model_client)

    async def create_from_description(self, description: str) -> LifeAgent:
        """自然语言 → LifeAgent（完整流程）"""
        result = await self.persona_builder.build(description)
        agent = LifeAgent(
            id=str(uuid.uuid4()),
            persona=result.persona,
            background=result.background,
            goals=result.goals,
            model_client=self.model_client,
            tools=DEFAULT_AGENT_TOOLS,
        )
        return agent

    async def create_from_persona(
        self, agent_id: str, persona: Persona, background: Background, goals: list[Goal]
    ) -> LifeAgent:
        """已有 Persona → LifeAgent（从数据库恢复用）"""
        return LifeAgent(
            id=agent_id, persona=persona, background=background,
            goals=goals, model_client=self.model_client, tools=DEFAULT_AGENT_TOOLS,
        )
```

---

### 2.2 Tool 注册体系

**文件: `backend/src/engines/agent_factory/tools.py`**

Agent 能做哪些"行动"——注册为 AutoGen Tool：

```python
# === 所有 Agent 共用的默认 Tools ===

async def send_message(target_name: str, content: str, tone: str = "neutral") -> str:
    """向另一个 Agent 发送消息。
    Args:
        target_name: 目标 Agent 的名字
        content: 消息内容
        tone: 语气 (casual/formal/urgent/gentle/neutral)
    """
    # 世界引擎会拦截这个 tool call 结果
    return f"消息已发送给 {target_name}"

async def think_aloud(thought: str) -> str:
    """记录内部独白（会展示在思维流中）。
    Args:
        thought: 你的内心想法
    """
    return f"思考已记录: {thought}"

async def set_goal(description: str, priority: int = 1) -> str:
    """设定一个新目标。
    Args:
        description: 目标描述
        priority: 优先级 (1=最高, 3=最低)
    """
    return f"新目标已设定: {description}"

async def observe(target: str) -> str:
    """专注观察某个人或事物。
    Args:
        target: 观察对象
    """
    return f"正在观察: {target}"

# === 场景特定 Tools ===
# 不同场景注册不同 tools（如：考试场景有 study()，社交场景有 invite()）

STUDY_SCENE_TOOLS = [
    send_message,
    think_aloud,
    set_goal,
    observe,
    # study, skip_class, join_club, cheat 等场景相关 tool
]

DEFAULT_AGENT_TOOLS = [send_message, think_aloud, set_goal, observe]
```

---

### 2.3 记忆检索器

**文件: `backend/src/engines/agent_factory/memory.py`**

```python
class MemoryRetriever:
    """P0: 关键词 + 时间衰退。P2: 加向量检索。"""

    def __init__(self, session: AsyncSession):  # 2026-07-17: 加类型标注，参数名 db_session → session
        self.db = db_session

    async def add_memory(self, agent_id: str, content: str, type_: str, importance: float = 0.5):
        """添加记忆"""
        ...

    async def retrieve(self, agent_id: str, context: str, top_k: int = 5) -> list[MemoryResponse]:
        """检索相关记忆（P0: 关键词匹配 + importance 排序）"""
        # 1. 从 context 中提取关键词
        # 2. SQL LIKE 匹配
        # 3. 按 importance DESC, created_at DESC 排序
        # 4. 返回 top_k
        ...

    async def get_recent(self, agent_id: str, limit: int = 10) -> list[MemoryResponse]:
        """获取最近 N 条记忆（时间衰退）"""
        ...
```

**验收标准 (Phase 2):**
- [ ] `AgentFactory.create_from_description("内向的程序员")` → 返回 `LifeAgent`
- [ ] LifeAgent 能直接和另一个 Agent 对话（AutoGen GroupChat）
- [ ] Tool call 结果正确返回
- [ ] 记忆能写入 SQLite 并检索

---

## Phase 3: 世界引擎 (World Engine)

> **目标：** 管理 tick 推进、事件分发、关系演化。
> **上游依赖：** Phase 0（类型）、Phase 2（Agent 工厂）
> **下游被依赖：** Phase 4（SSE）、Phase 5（API）、Phase 6（叙事）
> **可独立测试：** 创建 World + 几个 Mock Agent → 跑 N 个 tick → 验证事件流
> **对应蓝图模块：** World Engine

---

### 3.1 场景模板

**文件: `backend/src/engines/world/scenarios.py`**

```python
# === P0 三个内置场景 ===

FRESHMAN_ORIENTATION = Scenario(
    name="新生报到",
    description="大学开学第一天，几个新生在宿舍相遇...",
    time_range="1-20",
    initial_events=[
        "宿舍分配完成，4人一间",
        "新生入学教育下午2点开始",
    ],
    environment_params={"location": "大学宿舍", "weather": "晴"},
)

FINAL_EXAM_WEEK = Scenario(
    name="期末周",
    description="期末考试周，图书馆座位紧张，压力山大...",
    time_range="1-30",
    initial_events=[
        "期末考表公布",
        "图书馆座位减少80%",
    ],
    environment_params={"location": "大学校园", "stress_level": "high"},
)

GRADUATION_CHOICE = Scenario(
    name="毕业选择",
    description="大四了，保研/考研/工作/出国...每个人都站在十字路口。",
    time_range="1-25",
    initial_events=[
        "保研名额公布",
        "秋招开始",
    ],
    environment_params={"location": "大学校园", "life_stage": "graduation"},
)

BUILTIN_SCENARIOS = [FRESHMAN_ORIENTATION, FINAL_EXAM_WEEK, GRADUATION_CHOICE]
```

---

### 3.2 Tick 调度器

**文件: `backend/src/engines/world/engine.py`**

**核心接口：**

```python
class WorldEngine:
    """世界引擎：tick 推进 + 事件分发 + 关系演化"""

    def __init__(self, world: WorldResponse, agents: list[LifeAgent], db_session):
        self.world = world
        self.agents = {a.id: a for a in agents}
        self.db = db_session
        self.events: list[SimEvent] = []
        self.relationships: dict[tuple[str, str], float] = {}  # (A→B): score
        self.current_tick = 0

    def build_group_chat(self) -> RoundRobinGroupChat:
        """创建 AutoGen GroupChat 用于多 Agent 交互"""
        return RoundRobinGroupChat(
            participants=[a.autogen_agent for a in self.agents.values()],
            max_turns=len(self.agents) * 3,
        )

    async def tick(self) -> list[SimEvent]:
        """推进一个 tick，返回本 tick 产生的所有事件"""
        tick_events = []

        # 1. 注入当前世界状态到每个 Agent
        context = self._build_world_context()
        for agent in self.agents.values():
            memories = await memory_retriever.retrieve(agent.id, context)
            agent.inject_context(context, memories)

        # 2. 运行 AutoGen GroupChat（如果只有一个 Agent 则直接调 agent）
        if len(self.agents) == 1:
            tick_events += await self._run_solo_tick(list(self.agents.values())[0])
        else:
            tick_events += await self._run_group_tick()

        # 3. 解析 tool calls → 更新世界状态
        for event in tick_events:
            if event.type == "agent_action":
                self._apply_action(event)

        # 4. 更新关系
        self._update_relationships(tick_events)

        # 5. 写事件到数据库
        await self._persist_events(tick_events)

        self.current_tick += 1
        self.events.extend(tick_events)
        return tick_events

    async def run(self, max_ticks: int = 30) -> list[SimEvent]:
        """运行整个模拟"""
        all_events = []
        for _ in range(max_ticks):
            if self.world.status == "paused":
                break
            events = await self.tick()
            all_events.extend(events)
        return all_events

    def _build_world_context(self) -> str:
        """构建当前 tick 的世界上下文文本"""
        return f"""⏰ 第 {self.current_tick} 个时间段
📍 地点: {self.world.scenario.environment_params.get('location', '未知')}
🌤️ 天气: {self.world.scenario.environment_params.get('weather', '晴')}
👥 在场人物: {", ".join([a.persona.name for a in self.agents.values()])}
📋 最近事件: {self._recent_events_text(5)}"""
```

---

### 3.3 关系演化

**文件: `backend/src/engines/world/relationships.py`**

```python
# === 关系模型 ===
# 双向量化关系：A→B 和 B→A 可以有不同态度
# 正值 = 正面（喜欢/信任），负值 = 负面（讨厌/不信任），0 = 中性

# 2026-07-17 实现备注：函数名为 update_relationship_score（区别于符号名），
# INTERACTION_DELTAS 提升为模块级常量。额外实现了 detect_interaction_type、
# extract_relationship_changes、apply_relationship_changes 三个辅助函数。

INTERACTION_DELTAS = {
    "friendly": +0.10,
    "hostile": -0.15,
    "cooperative": +0.08,
    "competitive": -0.05,
    "neutral": 0.0,
}

def update_relationship_score(
    current_score: float,
    interaction_type: str,
    intensity: float = 1.0,
) -> float:
    """根据一次交互更新关系分数（-1.0 ~ 1.0）"""
    delta = INTERACTION_DELTAS.get(interaction_type, 0.0) * intensity
    return max(-1.0, min(1.0, current_score + delta))
```

**验收标准 (Phase 3):**
- [ ] 创建 World + 1 个 Agent → `tick()` 返回事件列表
- [ ] 创建 World + 4 个 Agent → GroupChat 跑起来 → 每个 Agent 至少发言 1 次
- [ ] 关系分数随交互正确变化
- [ ] 事件正确写入 SQLite

---

## Phase 4: SSE 桥接

> **目标：** AutoGen streaming → SSE → 前端实时更新。
> **上游依赖：** Phase 2（Agent）、Phase 3（世界引擎）
> **下游被依赖：** Phase 5（API 端点）、Phase 7（前端）
> **可独立测试：** `curl localhost:8000/api/worlds/{id}/stream` 看到事件流
> **对应蓝图模块：** Event Bus / SSE Bridge

---

### 4.1 AutoGen → SSE 翻译器

**文件: `backend/src/api/sse.py`**

**核心接口：**

```python
from fastapi.responses import StreamingResponse
import json

# === AutoGen 消息 → SSE 事件 翻译映射 ===
# autogen_agentchat.messages.TextMessage → agent_message
# autogen_agentchat.messages.ToolCallMessage → agent_action
# autogen_agentchat.messages.ThoughtEvent → thought_stream
# 自定义 → world_event / relationship_change / tick_boundary

async def world_event_stream(world_engine: WorldEngine) -> AsyncGenerator[str, None]:
    """SSE 事件生成器——FastAPI StreamingResponse 的 content"""
    async for autogen_message in world_engine.team.run_stream():
        sse_event = translate_message(autogen_message, world_engine.current_tick)

        # 1. 写事件到数据库
        await event_store.save(sse_event)

        # 2. SSE 格式输出
        yield f"data: {json.dumps(sse_event.model_dump(), ensure_ascii=False)}\n\n"

    # 发送 tick_boundary
    yield f"data: {json.dumps({'type': 'tick_boundary', 'tick': world_engine.current_tick})}\n\n"


def translate_message(msg, tick: int) -> SimEvent:
    """AutoGen 消息类型 → 我们的 SimEvent 类型"""
    from autogen_agentchat.messages import TextMessage, ToolCallMessage

    if isinstance(msg, TextMessage):
        return SimEvent(
            type="agent_message" if msg.source != "user" else "world_event",
            source_agent_id=msg.source,
            description=msg.content,
            tick=tick,
            ...
        )
    elif isinstance(msg, ToolCallMessage):
        return SimEvent(
            type="agent_action",
            source_agent_id=msg.source,
            description=f"调用工具: {msg.content}",
            tick=tick,
            ...
        )
    ...
```

**FastAPI 端点：**
```python
# 在 Phase 5 挂载到 FastAPI router
@router.get("/worlds/{world_id}/stream")
async def stream_world(world_id: str):
    """SSE 端点——前端 EventSource 连接此 URL"""
    engine = get_world_engine(world_id)  # 从内存 registry 取
    return StreamingResponse(
        world_event_stream(engine),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # nginx 禁用缓冲
        },
    )
```

**验收标准 (Phase 4):**
- [ ] `curl http://localhost:8000/api/worlds/{id}/stream` 持续输出 SSE 事件
- [ ] 每个 AutoGen 消息正确翻译为 SimEvent 类型
- [ ] 事件同时写入数据库
- [ ] 连接断开后 EventSource 能自动重连

---

## Phase 5: FastAPI 服务层

> **目标：** 把所有引擎通过 REST API 暴露出去。
> **上游依赖：** Phase 0-4（所有引擎）
> **下游被依赖：** Phase 7（前端）、Phase 8（竞技场）
> **可独立测试：** `pytest tests/test_api.py`

---

### 5.1 API 路由规划

| 路由 | 方法 | 功能 | Phase |
|------|------|------|-------|
| `/api/agents` | POST | 自然语言创建 Agent | 5 |
| `/api/agents` | GET | 列出所有 Agent | 5 |
| `/api/agents/{id}` | GET | Agent 详情 | 5 |
| `/api/agents/{id}` | PUT | 修改 Agent | 5 |
| `/api/agents/{id}` | DELETE | 删除 Agent | 5 |
| `/api/worlds` | POST | 创建 World | 5 |
| `/api/worlds` | GET | 列出 World | 5 |
| `/api/worlds/{id}` | GET | World 详情 | 5 |
| `/api/worlds/{id}/start` | POST | 启动模拟 | 5 |
| `/api/worlds/{id}/pause` | POST | 暂停 | 5 |
| `/api/worlds/{id}/inject` | POST | 注入事件 | 5 |
| `/api/worlds/{id}/stream` | GET | SSE 流 | 4 |
| `/api/worlds/{id}/events` | GET | 历史事件 | 5 |
| `/api/simulations/{id}` | GET | 模拟详情 | 5 |
| `/api/narratives/story` | POST | 生成小说 | 6 |
| `/api/narratives/letter` | POST | 生成信 | 6 |
| `/api/narratives/diary` | POST | 生成日记 | 6 |
| `/api/arenas` | POST | 创建竞技 | 8 |
| `/api/arenas/{id}/result` | GET | 竞技结果 | 8 |
| `/api/export/report/{sim_id}` | GET | 导出报告 | 9 |

---

### 5.2 Agent 路由

**文件: `backend/src/api/agents.py`**

```python
from fastapi import APIRouter, Depends
from ..engines.agent_factory.factory import AgentFactory
from ..engines.persona.builder import PersonaBuilder
from ..models.agent import AgentCreate, AgentResponse

router = APIRouter(prefix="/api/agents", tags=["agents"])

@router.post("/", response_model=AgentResponse)
async def create_agent(req: AgentCreate, factory: AgentFactory = Depends()):
    """自然语言创建 Agent"""
    life_agent = await factory.create_from_description(req.description)
    # 持久化到 SQLite
    await agent_store.save(life_agent)
    return life_agent.to_response()

@router.get("/", response_model=list[AgentResponse])
async def list_agents():
    """列出所有 Agent"""
    return await agent_store.list_all()

@router.get("/{agent_id}", response_model=AgentResponse)
async def get_agent(agent_id: str):
    """获取 Agent 详情"""
    return await agent_store.get(agent_id)

@router.delete("/{agent_id}")
async def delete_agent(agent_id: str):
    await agent_store.delete(agent_id)
    return {"ok": True}
```

---

### 5.3 World 路由

**文件: `backend/src/api/worlds.py`**

```python
from fastapi import APIRouter, Depends, BackgroundTasks
from ..engines.world.engine import WorldEngine

router = APIRouter(prefix="/api/worlds", tags=["worlds"])

@router.post("/", response_model=WorldResponse)
async def create_world(req: WorldCreate):
    """创建 World"""
    world = await world_store.create(req)
    return world

@router.post("/{world_id}/start")
async def start_world(world_id: str, background_tasks: BackgroundTasks):
    """启动模拟（后台运行）"""
    engine = await build_world_engine(world_id)
    # 注册到内存 registry
    active_worlds[world_id] = engine
    # 后台运行
    background_tasks.add_task(engine.run)
    return {"status": "started", "world_id": world_id}

@router.post("/{world_id}/pause")
async def pause_world(world_id: str):
    engine = active_worlds.get(world_id)
    engine.world.status = "paused"
    return {"status": "paused"}

@router.post("/{world_id}/inject")
async def inject_event(world_id: str, event: dict):
    """注入事件（M7 干预台）"""
    engine = active_worlds.get(world_id)
    engine.inject_event(event["description"])
    return {"status": "injected"}
```

---

### 5.4 main.py 组装

**文件: `backend/src/main.py`**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .api import agents, worlds, simulations, narratives, arenas, sse
from .config import settings

app = FastAPI(title="Life Lab API", version="0.1.0")

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

app.include_router(agents.router)
app.include_router(worlds.router)
app.include_router(simulations.router)
app.include_router(narratives.router)
app.include_router(arenas.router)

@app.get("/health")
async def health(): return {"status": "ok", "version": "0.1.0"}

# 启动
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=settings.api_host, port=settings.api_port)
```

**验收标准 (Phase 5):**
- [ ] `POST /api/agents` 创建 Agent → 返回 201 + AgentResponse
- [ ] `POST /api/worlds` 创建 World → 返回 WorldResponse
- [ ] `POST /api/worlds/{id}/start` 启动模拟 → SSE 端点有数据流
- [ ] 所有端点在 Swagger UI (`/docs`) 可见可测试

---

## Phase 6: 叙事引擎 (Narrative Engine)

> **目标：** 事件日志 → 自然语言叙事（小说/日记/信/播客）。
> **上游依赖：** Phase 0（类型）、Phase 3（事件数据）
> **下游被依赖：** Phase 5（API 端点）、Phase 7（前端）
> **可独立测试：** 输入 Mock 事件列表 → 输出叙事文本
> **对应蓝图模块：** M5 叙事工厂

---

### 6.1 叙事引擎

**文件: `backend/src/engines/narrative/engine.py`**

**核心接口：**

```python
from enum import Enum

class NarrativeStyle(str, Enum):
    STORY = "story"        # 第一人称短篇小说
    DIARY = "diary"        # 日记
    LETTER = "letter"      # 未来的信
    PODCAST = "podcast"    # 播客脚本

class NarrativeRequest:
    style: NarrativeStyle
    agent_id: str
    events: list[SimEvent]       # 该 Agent 参与的所有事件
    persona: Persona             # 用于保持口吻一致
    target: str | None = None    # letter 的收件人 / podcast 的主题

class NarrativeResponse:
    title: str
    content: str                 # 叙事正文
    style: NarrativeStyle
    agent_id: str
    generated_at: str

class NarrativeEngine:
    def __init__(self, model_client):
        self.model_client = model_client

    async def generate(self, req: NarrativeRequest) -> NarrativeResponse:
        """事件 → 叙事"""
        prompt = self._build_prompt(req)
        result = await self.model_client.create(prompt)
        return NarrativeResponse(
            title=...,
            content=result.content,
            style=req.style,
            agent_id=req.agent_id,
            generated_at=datetime.now().isoformat(),
        )

    def _build_prompt(self, req: NarrativeRequest) -> str:
        """根据风格选择不同 prompt 模板"""
        templates = {
            NarrativeStyle.STORY: STORY_PROMPT,
            NarrativeStyle.DIARY: DIARY_PROMPT,
            NarrativeStyle.LETTER: LETTER_PROMPT,
            NarrativeStyle.PODCAST: PODCAST_PROMPT,
        }
        template = templates[req.style]
        return template.format(
            persona_narrative=req.persona.narrative,
            events=self._format_events(req.events),
            target=req.target or "",
        )
```

**Prompt 模板: `backend/src/engines/narrative/templates.py`**

```python
STORY_PROMPT = """
你是一个小说家。请根据以下角色经历，写一篇第一人称短篇小说。

角色人格：{persona_narrative}

角色经历（按时间顺序）：
{events}

要求：
- 以该角色的口吻和视角写作
- 包含角色的内心独白和情感变化
- 800-1500 字
- 有开头、发展、结尾
- 标题自拟
"""

DIARY_PROMPT = """
你正在写日记。请根据今天的经历，写一篇日记。

你的性格：{persona_narrative}

今天的经历：
{events}

要求：
- 第一人称
- 像真实的日记一样随意、私密
- 包含你的真实感受和想法
- 300-500 字
- 以"今天..."开头
"""
```

**验收标准 (Phase 6):**
- [ ] 输入 10 个 Mock 事件 → 返回 800-1500 字叙事
- [ ] 叙事口吻符合人格描述
- [ ] 四种风格都能正确生成

---

## Phase 7: 前端

> **目标：** 完整的 React 前端，能用 Mock 数据独立开发。
> **上游依赖：** Phase 5（API 端点定义）、Phase 0（TypeScript 类型）
> **可独立测试：** `npm run dev` → 看到完整 UI（Mock 数据）

---

### 7.1 项目骨架

**文件清单：**

```
frontend/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
├── src/
│   ├── main.tsx
│   ├── App.tsx                 # 路由 + 布局
│   ├── index.css               # Tailwind + 自定义调色板
│   ├── types/                  # Phase 0 已定义
│   ├── stores/
│   │   ├── useWorldStore.ts    # Zustand: 当前 World 状态
│   │   └── useSSEStore.ts      # Zustand: SSE 事件队列
│   ├── hooks/
│   │   ├── useSSE.ts           # EventSource 连接 hook
│   │   └── useApi.ts           # fetch 封装 hook
│   ├── pages/
│   │   ├── Home.tsx
│   │   ├── AgentFoundry.tsx    # M1
│   │   ├── SoloTheater.tsx     # M2
│   │   ├── GroupSandbox.tsx    # M3
│   │   ├── Arena.tsx           # M4
│   │   ├── NarrativeFactory.tsx# M5
│   │   ├── ControlPanel.tsx    # M6
│   │   ├── DirectorIntervention.tsx # M7
│   │   └── Archive.tsx         # M8
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx
│   │   │   └── TopBar.tsx
│   │   ├── agent/
│   │   │   ├── AgentCard.tsx
│   │   │   ├── PersonaRadar.tsx
│   │   │   └── ThoughtBubble.tsx
│   │   ├── world/
│   │   │   ├── Timeline.tsx
│   │   │   ├── EventFeed.tsx
│   │   │   ├── RelationshipGraph.tsx
│   │   │   └── AgentStatusPanel.tsx
│   │   └── shared/
│   │       ├── StatusDot.tsx
│   │       └── TerminalText.tsx
│   └── mocks/
│       ├── agents.ts
│       ├── thoughts.ts
│       └── events.ts
```

---

### 7.2 设计 Token（暗色控制台风格）

**文件: `tailwind.config.js`**

```javascript
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "bg-primary": "#0a0a0f",
        "bg-secondary": "#12121a",
        "bg-card": "#1a1a26",
        border: "#2a2a3a",
        "text-primary": "#e0e0e0",
        "text-secondary": "#8888aa",
        "accent-green": "#00ff88",
        "accent-blue": "#4488ff",
        "accent-orange": "#ff8844",
        "accent-red": "#ff4466",
        "accent-purple": "#aa44ff",
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        "pulse-green": "pulse-green 1.5s infinite",
        "slide-in": "slide-in 0.3s ease-out",
        "fade-in": "fade-in 0.5s ease-out",
      },
    },
  },
};
```

**文件: `frontend/src/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  @apply bg-bg-primary text-text-primary font-sans;
  margin: 0;
}

/* 自定义滚动条 */
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: #0a0a0f; }
::-webkit-scrollbar-thumb { background: #2a2a3a; border-radius: 3px; }

/* Agent 状态指示灯 */
.status-dot {
  @apply w-2 h-2 rounded-full;
}
.status-dot.active {
  background: #00ff88;
  box-shadow: 0 0 8px #00ff88;
}
.status-dot.thinking {
  background: #4488ff;
  animation: pulse 1.5s infinite;
}
.status-dot.idle {
  background: #8888aa;
}

/* 终端风格文字 */
.terminal-text {
  @apply font-mono text-sm text-text-secondary;
}

@keyframes pulse-green {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

@keyframes slide-in {
  from { transform: translateY(10px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

---

### 7.3 前端开发顺序

**必须按这个顺序，每个阶段可独立用 Mock 数据开发：**

| 步骤 | 内容 | 文件 |
|------|------|------|
| 7.3.1 | App 骨架 + 路由 + Sidebar 导航 (56 菜单) | `App.tsx`, `Sidebar.tsx`, `TopBar.tsx` |
| 7.3.2 | 铸造厂页面 (M1) | `AgentFoundry.tsx`, `AgentCard.tsx`, `PersonaRadar.tsx` |
| 7.3.3 | SSE Hook + 思维流组件 | `useSSE.ts`, `ThoughtBubble.tsx`, `TerminalText.tsx` |
| 7.3.4 | 单人剧场页面 (M2) | `SoloTheater.tsx`, `AgentStatusPanel.tsx` |
| 7.3.5 | 主观察界面 (M3 核心) | `GroupSandbox.tsx`, `Timeline.tsx`, `EventFeed.tsx` |
| 7.3.6 | 关系网络图 | `RelationshipGraph.tsx` |
| 7.3.7 | 竞技场页面 (M4) | `Arena.tsx` |
| 7.3.8 | 叙事页面 (M5) | `NarrativeFactory.tsx` |
| 7.3.9 | 控制台 + 干预台 (M6, M7) | `ControlPanel.tsx`, `DirectorIntervention.tsx` |
| 7.3.10 | 档案馆 (M8) | `Archive.tsx` |

---

### 7.3.2 铸造厂页面（示例级详细规格）

**文件: `frontend/src/pages/AgentFoundry.tsx`**

**组件 Props 接口:**
```typescript
// 无 props——这是独立页面

// 内部状态:
interface FoundryState {
  input: string;                        // 用户输入的描述文字
  loading: boolean;                     // 正在调用 API
  result: AgentResponse | null;         // 创建结果
  error: string | null;
}
```

**布局:**
```
┌──────────────────────────────────────────────────┐
│  铸造厂                              [Agent 列表] │
│                                                  │
│  ┌──────────────────────────────────────────────┐│
│  │                                              ││
│  │  描述你的 Agent...                            ││
│  │  "来自小镇的计算机系新生，内向但野心大"         ││
│  │                                              ││
│  └──────────────────────────────────────────────┘│
│  [✨ 创建 Agent]                                  │
│                                                  │
│  ─── 创建结果 ────────────────────────────────── │
│                                                  │
│  ┌─────────┐  ┌───────────────────────────────┐  │
│  │ Agent 卡片│  │ 人格雷达图                     │  │
│  │ 姓名: 小明│  │  (Recharts RadarChart)         │  │
│  │ MBTI: ...│  │  开放性: ████████░░ 0.7       │  │
│  │ 目标: ...│  │  尽责性: █████████░ 0.85      │  │
│  │          │  │  外向性: ███░░░░░░░ 0.25      │  │
│  │          │  │  ...                           │  │
│  └─────────┘  └───────────────────────────────┘  │
│                                                  │
│  ┌──────────────────────────────────────────────┐│
│  │ 人格画像                                      ││
│  │ "小明是一个来自小镇的年轻人..."               ││
│  └──────────────────────────────────────────────┘│
└──────────────────────────────────────────────────┘
```

**关键交互：**
1. 用户输入描述文字 → 点"创建"
2. 显示 loading spinner (2-5 秒)
3. 结果卡片从下往上滑入 (slide-in 动画)
4. 可同时创建多个 Agent（每个显示在下方列表中）

**Mock 数据:**
```typescript
// frontend/src/mocks/agents.ts
export const MOCK_AGENT_RESPONSE: AgentResponse = {
  id: "mock-1",
  name: "小明",
  persona: {
    mbti: "INTJ-T",
    big_five: { openness: 0.7, conscientiousness: 0.85, extraversion: 0.25, agreeableness: 0.5, neuroticism: 0.6 },
    values: ["成就", "独立", "效率"],
    decision_style: { info_processing: "analytical", risk_preference: "moderate", social_tendency: "independent", stress_response: "adaptive" },
    narrative: "小明是一个来自小镇的年轻人，高考全县第一的成绩让他进入了顶尖大学...",
  },
  background: { hometown: "安徽某县城", family: "父母务农，独生子", education: "中科大计算机系大二", key_events: ["高考全县第一", "大一编程比赛失利"] },
  goals: [{ id: "g1", description: "保研清华", priority: 1, status: "active" }],
  emotional_state: { valence: 0.6, arousal: 0.5, dominance: 0.7, label: "neutral" },
  energy: 85,
  created_at: "2026-07-16T10:00:00Z",
  updated_at: "2026-07-16T10:00:00Z",
};
```

---

### 7.3.4 SSE Hook（关键基础设施）

**文件: `frontend/src/hooks/useSSE.ts`**

```typescript
import { useEffect, useRef, useCallback } from "react";
import { useSSEStore } from "../stores/useSSEStore";
import type { SSEEvent } from "../types/events";

export function useSSE(worldId: string | null) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const { events, appendEvent, clear, setConnected } = useSSEStore();

  const connect = useCallback(() => {
    if (!worldId) return;

    const es = new EventSource(`/api/worlds/${worldId}/stream`);

    es.onopen = () => setConnected(true);
    es.onerror = () => {
      setConnected(false);
      // EventSource 自动重连，不需要手动处理
    };
    es.onmessage = (e) => {
      const event: SSEEvent = JSON.parse(e.data);
      appendEvent(event);
    };

    eventSourceRef.current = es;
  }, [worldId]);

  const disconnect = useCallback(() => {
    eventSourceRef.current?.close();
    setConnected(false);
  }, []);

  useEffect(() => {
    return () => disconnect(); // cleanup
  }, []);

  return { events, connect, disconnect, clear };
}
```

**文件: `frontend/src/stores/useSSEStore.ts`**

```typescript
import { create } from "zustand";
import type { SSEEvent } from "../types/events";

interface SSEStore {
  events: SSEEvent[];
  connected: boolean;
  appendEvent: (e: SSEEvent) => void;
  clear: () => void;
  setConnected: (c: boolean) => void;
}

export const useSSEStore = create<SSEStore>((set) => ({
  events: [],
  connected: false,
  appendEvent: (e) => set((s) => ({ events: [...s.events.slice(-500), e] })), // 最多保留 500 条
  clear: () => set({ events: [] }),
  setConnected: (c) => set({ connected: c }),
}));
```

---

### 7.3.5 主观察界面布局

**文件: `frontend/src/pages/GroupSandbox.tsx`**

```
┌─────────────────────────────────────────────────────────────┐
│  TOP BAR: World Name | Tick #42 | ⏸ Pause | ⏩ Speed 2x   │
├──────────────┬──────────────────────────┬───────────────────┤
│ AGENT PANEL  │                          │ THOUGHT STREAM    │
│ (280px)      │      MAIN STAGE          │ (360px)           │
│              │                          │                   │
│ ┌──────────┐ │   ┌──────────────────┐   │ 🟢 小明 thinking: │
│ │🟢 小明   │ │   │                  │   │ "我注意到..."     │
│ │ 😰 焦虑  │ │   │   TIMELINE       │   │                   │
│ │ GPA: 3.2 │ │   │   ●────●────●    │   │ 🟡 小红 deciding: │
│ │ ⚡ 45%   │ │   │   │         └─?   │   │ "如果A那么B..."   │
│ ├──────────┤ │   │                      │                   │
│ │🟡 小红   │ │   │   EVENT FEED       │   │ 🔵 小刚 acting:  │
│ │ 😤 竞争  │ │   │   Tick 42: 小明... │   │ "我决定..."      │
│ │ GPA: 3.7 │ │   │   Tick 41: 小红... │   │                   │
│ │ ⚡ 72%   │ │   │                      │   │                   │
│ └──────────┘ │   └──────────────────┘   │                   │
├──────────────┴──────────────────────────┴───────────────────┤
│  BOTTOM BAR: Timeline scrubber | ⏮ ⏪ ⏩ ⏭ | Inject btn    │
└─────────────────────────────────────────────────────────────┘
```

**验收标准 (Phase 7):**
- [ ] `npm run dev` → 能看到完整 UI 骨架 + 56 项菜单
- [ ] 铸造厂 Mock 数据 → 完整创建流程
- [ ] SSE Mock → 思维流滚动 + 事件流展示
- [ ] 暗色主题一致性（所有页面统一调色板）

---

## Phase 8: 竞技场 (Arena)

> **目标：** 两个 Agent 在竞技场景中对决，LLM 裁判评分。
> **上游依赖：** Phase 2（Agent 工厂）、Phase 3（世界引擎）、Phase 5（API）
> **可独立测试：** 创建 2 个 Agent → 辩论赛 → 返回评分
> **对应蓝图模块：** M4 竞技场

---

### 8.1 竞技引擎

**文件: `backend/src/engines/arena/engine.py`**

**核心接口：**

```python
from enum import Enum

class ArenaMode(str, Enum):
    DEBATE = "debate"            # 辩论赛：就一个话题正反方辩论
    INTERVIEW = "interview"      # 面试竞争：同一岗位竞争
    PITCH = "pitch"              # 路演：各自陈述，裁判评分

class ArenaResult(BaseModel):
    winner_id: str
    scores: dict[str, float]     # {agent_id: score}
    judge_reasoning: str         # 裁判的评分理由
    transcript: list[dict]       # 完整对话记录

class ArenaEngine:
    def __init__(self, model_client):
        self.model_client = model_client

    async def run_debate(
        self, agent_a: LifeAgent, agent_b: LifeAgent, topic: str, rounds: int = 3
    ) -> ArenaResult:
        """辩论赛模式"""
        # 1. 创建裁判 Agent
        judge = self._create_judge(topic)

        # 2. 创建 GroupChat
        team = RoundRobinGroupChat(
            participants=[agent_a.autogen_agent, agent_b.autogen_agent, judge],
            max_turns=rounds * 2 + 2,  # 各说 N 轮 + 裁判总结
        )

        # 3. 运行
        transcript = []
        async for msg in team.run_stream(task=f"辩论主题: {topic}"):
            transcript.append(msg)

        # 4. 裁判评分
        result = await self._judge_score(judge, transcript)
        return result

    def _create_judge(self, topic: str) -> AssistantAgent:
        return AssistantAgent(
            name="裁判",
            model_client=self.model_client,
            system_message=f"""你是比赛裁判。辩论主题：{topic}
评分标准（每项 1-10 分）：
- 论点质量：论据是否充分、逻辑是否严密
- 表达能力：是否清晰、有说服力
- 应变能力：是否回应了对方观点
- 角色一致性：辩论风格是否符合其人格设定

最后给出 JSON: {{"agent_a_score": 0-40, "agent_b_score": 0-40, "winner": "A或B", "reasoning": "理由"}}""",
        )
```

**验收标准 (Phase 8):**
- [ ] 两个 Agent 辩论 → 完整对话记录 + 评分
- [ ] 评分理由可读
- [ ] 每次结果不同（不是确定性输出）

---

## Phase 9: 打磨与铺量

> **目标：** 56 项功能菜单全部可见、研究报告导出、演示排练。
> **上游依赖：** 所有前置 Phase
> **产出：** 演示就绪产品

---

### 9.1 56 功能菜单铺量策略

每个菜单项对应一个前端路由 + 页面。P0-P1 的 20 个是完整页面，P2 的 19 个是有骨架的功能页面，P3 的 17 个是"建设中"占位页。

**占位页模板:**
```tsx
// frontend/src/pages/Placeholder.tsx
export function Placeholder({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-text-secondary">
      <div className="text-4xl mb-4">🚧</div>
      <h2 className="text-xl font-mono text-text-primary mb-2">{title}</h2>
      <p className="text-sm">{description}</p>
      <p className="text-xs mt-4 text-text-secondary/50">P3 — 演示后可继续开发</p>
    </div>
  );
}
```

### 9.2 研究报告导出

**文件: `backend/src/api/export.py`**

```python
@router.get("/api/export/report/{sim_id}")
async def export_report(sim_id: str):
    """生成实验报告 Markdown → 返回文件下载"""
    events = await event_store.get_by_simulation(sim_id)
    report = build_report_markdown(events)
    return Response(
        content=report,
        media_type="text/markdown",
        headers={"Content-Disposition": f"attachment; filename=experiment-{sim_id}.md"},
    )
```

### 9.3 演示脚本

创建 `docs/demo-script.md`：

```
1. 开场 30s：概念 + 深色 UI 第一印象
2. 铸造厂 1min：创建 2-3 个 Agent
3. 群体沙盒 2min：投放 → 观察互动 → 关系图
4. 叙事工厂 30s：一键故事
5. 竞技场 30s：Agent PK
6. 56 功能滚屏 30s
7. 导出报告 30s：总结
```

---

## 附录: 依赖关系图

```
Phase 0 (类型+配置+DB)
  │
  ├─→ Phase 1 (人格引擎) ──→ Phase 2 (Agent工厂) ──┬─→ Phase 4 (SSE桥接) ──→ Phase 5 (FastAPI) ──→ Phase 7 (前端)
  │                                                  │                                        │
  │                                                  └─→ Phase 8 (竞技场) ──────────────────┘
  │
  └─→ Phase 3 (世界引擎) ──┬─→ Phase 4 (SSE桥接)
                            │
                            └─→ Phase 6 (叙事引擎) ──→ Phase 5 (FastAPI)
                                                            │
                                                            └─→ Phase 9 (打磨铺量)
```

**串行执行顺序（单人开发）：**
```
0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9
```

**4 人并行建议（如果有并行能力）：**
```
全员一起做 Phase 0（1 天）
然后：
  P1 做 Phase 2+4（Agent+SSE）
  P2 做 Phase 7（前端骨架，用 Mock）
  P3 做 Phase 1+6（人格+叙事）
  P4 做 Phase 3（世界引擎）
合并：Phase 5（API，所有人一起联调）
最后：Phase 8 → Phase 9
```

---

## 附录: AI / Vibe Coding 使用指南

### 每个 Phase 的 AI Prompt 结构

```
【上下文】我们在做一个 Agent 社会模拟平台。技术栈: FastAPI + AutoGen + React + SQLite。
          当前 Phase: {N}，前置已完成 Phase: {0..N-1}。
          项目结构见 docs/development-plan.md。

【任务】实现 Phase {N} 的 {具体模块}。
        文件: {精确的文件路径}

【接口约束】
        输入类型: {Pydantic/TS 类型定义，直接从本文档复制}
        输出类型: {Pydantic/TS 类型定义}
        API 端点: {如适用}

【Mock 数据】{直接从本文档复制对应的 Mock}
【验收标准】{直接从本文档复制}
【不要做】{此 Phase 不涉及的范围}
```

### Vibe Coding 注意事项

1. **每个 Phase 独立 Context：** AI 一次只处理一个 Phase 的一个文件。不需要加载整个项目。
2. **类型先行：** 先让 AI 确认理解类型定义，再生成实现。
3. **Mock 驱动：** 先让 AI 写 Mock 和测试，再写实现。Mock 过了再连真 LLM。
4. **小块提交：** 每个文件完成 → git commit。不要攒一大堆再提交。
5. **接口变更 = 破坏性：** 如果 AI 建议改 Phase 0 定义的类型，必须先确认，然后检查所有下游。

---

> **最后更新:** 2026-07-16
> **维护者:** 晓音_Stingray
> **版本:** 1.0
