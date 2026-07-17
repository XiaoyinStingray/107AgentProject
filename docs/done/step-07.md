# Step 07 — 记忆检索器

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-17 |
| Phase | Phase 2.3 |
| Plan 章节 | [development-plan.md](../development-plan.md) §2.3 |
| 状态 | ✅ done |

## 产出

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/models/memory.py` | 修改 | 新增 `Memory` ORM 模型（SQLAlchemy） |
| `backend/src/engines/agent_factory/memory.py` | 新建 | MemoryRetriever + `_extract_keywords` |
| `backend/src/engines/agent_factory/__init__.py` | 修改 | 导出 MemoryRetriever |
| `backend/tests/test_memory_retriever.py` | 新建 | 14 个测试：关键词提取、写入、检索、删除 |

## 决策记录

- **ORM 模型放 `models/memory.py`：** 和已有的 Pydantic `MemoryCreate`/`MemoryResponse` 放一起。`Base.metadata.create_all` 自动发现并建表。选择 C（不改 Phase 0 包结构）。

- **P0 检索策略：** `\W+` 正则切分 → 过滤停用词和短词 → SQL LIKE 匹配 keywords 和 content 字段 → 按 importance DESC + created_at DESC 排序。不做 jieba 分词（P0 简化，中文按标点自然切分效果够用）。

- **双重回退：** (1) context 无有效关键词 → 直接返回最近记忆；(2) 关键词搜索无结果 → 回退到最近记忆。确保任何情况下都不返回空列表。

- **raw SQL 而非 ORM：** 关键词数量动态变化，用 `text()` + 字符串拼接比 SQLAlchemy ORM 的 `or_()` 更简洁。`keywords.replace("'", "''")` 做基本的 SQL 注入防护。

- **ORM `created_at` default：** 用 `default=lambda: ...`（SQLAlchemy Column 语义，每 INSERT 执行一次），而非 `default_factory`（dataclass 语义，会导致 ArgumentError）。

## 接口变更

```python
# 新增
class MemoryRetriever:
    def __init__(self, session: AsyncSession)
    async def add_memory(agent_id, content, type_?, importance?) -> MemoryResponse
    async def retrieve(agent_id, context, top_k?) -> list[MemoryResponse]
    async def get_recent(agent_id, limit?) -> list[MemoryResponse]
    async def delete_by_agent(agent_id) -> int

# ORM 模型
class Memory(Base):  # 表名: memories
```

## 测试结果

- [x] 中文关键词提取（标点切分）— ✅
- [x] 停用词过滤 — ✅
- [x] 去重 + 最小长度过滤 — ✅
- [x] `add_memory` 持久化 + 关键词自动提取 — ✅
- [x] `retrieve` 关键词搜索 + 按 importance 排序 — ✅
- [x] `retrieve` top_k 限制 + agent_id 过滤 — ✅
- [x] `retrieve` 无关键词/无结果回退到 recent — ✅
- [x] `get_recent` 时间降序 + limit — ✅
- [x] `delete_by_agent` 清空指定 agent — ✅

```
62 passed in 0.78s (14 new + 48 existing, 0 regressions)
```

## 已知问题

- `memory.py` 中的 `\W` 分隔符对无标点连续中文无效（如"今天天气很好"→一个词"今天天气很好"）。P2 加 jieba 分词可解决。
- `created_at` 使用 ISO 字符串而非 SQLite datetime 类型，排序依赖词法序（ISO 格式天然满足），但范围查询（BETWEEN）可能有问题。

## 对下一步的提示

- **Phase 2 完成。** Step 08 进入 Phase 3（世界引擎），依赖本 Phase 的全部产出。
- `MemoryRetriever` 已就绪，WorldEngine.tick() 中可以直接使用 `await retriever.retrieve(agent.id, context)` 获取相关记忆。
- ORM 表 `memories` 已在数据库中就绪，`init_db()` 启动时自动建表。
