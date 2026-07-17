# Step 02 — 配置 + 数据库 + 前端 TS 类型

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-17 |
| Phase | Phase 0.3 |
| Plan 章节 | [development-plan.md](../development-plan.md) §0.3 + §0.4 |
| 状态 | ✅ done |

## 产出

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/config.py` | 新建 | pydantic-settings，从 `.env` / 默认值读取 |
| `backend/src/db.py` | 新建 | SQLAlchemy async engine + session + Base + init_db() |
| `frontend/src/types/agent.ts` | 新建 | BigFive, Persona, Goal, AgentCreate, AgentResponse 等 |
| `frontend/src/types/world.ts` | 新建 | Scenario, WorldCreate, WorldResponse |
| `frontend/src/types/events.ts` | 新建 | SimEvent, ThoughtEvent, AgentMessageEvent, AgentActionEvent |
| `frontend/src/types/.gitkeep` | 删除 | 已被 `.ts` 文件替代 |
| `backend/src/db.py` | 修 bug | 相对 import `.config` → 绝对 import `config` |

## 决策记录

- **相对 import 问题：** 项目用 `PYTHONPATH=backend/src` + 绝对 import 的方式运行。`from .config`（相对）在脚本模式失败，统一改为 `from config`（绝对）。所有 `backend/src/` 下的模块内部互相引用都用绝对 import。
- **Base + init_db() 前置：** Plan 只写了 engine+session，实际 add 了 `DeclarativeBase` 基类和 `init_db()` 函数。后续 Phase 定义 ORM 模型只需要继承 `Base`，不需要回头改 db.py。
- **`check_same_thread=False`：** SQLite 默认禁止多线程，aiosqlite 的 async 访问需要显式关闭此检查。

## 接口变更

无破坏性变更。`config.py` 和 `db.py` 是新增基础设施模块。

### 当前后端 import 规范（记录备忘）

```
所有 backend/src/ 下的 .py 文件：
  import 自己包内模块 → 绝对 import，如：
    from config import settings
    from db import get_db, Base
    from models import Persona, AgentResponse

运行方式：
  PYTHONPATH=backend/src python -c "from main import app"
  PYTHONPATH=backend/src uvicorn main:app
```

## 测试结果

- [x] `config.py` settings 加载 + 默认值 — ✅
- [x] `db.py` engine + session 创建 — ✅
- [x] `Base` 声明基类 — ✅
- [x] `init_db()` + SQLite SELECT 1 — ✅
- [x] `tsc --noEmit` 零错误 — ✅
- [x] `vite build` 构建成功 — ✅

## 已知问题

无。

## 对下一步的提示

- **Phase 0 完成。** Step 03 开始 Phase 1：Persona Engine（`engines/persona/builder.py`）。
- Persona Builder 需要 LLM client，但 Phase 0 还没初始化。Step 03 需要先在 `llm/__init__.py` 或 `llm/client.py` 中创建 LLM client 工厂。
- 测试时用 Mock LLM 返回固定 JSON，不需要真 API key。
