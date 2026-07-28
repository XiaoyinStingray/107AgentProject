# Step 63b — 场景后端 API

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-28 |
| Phase | Phase 16.2 |
| Plan 章节 | [plan-state3.md](../plan-state3.md) §Step 63b |
| 状态 | ✅ done |

## 产出

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/engines/scene/__init__.py` | **新建** | 包初始化 |
| `backend/src/engines/scene/engine.py` | **新建** | SceneEngine：内存存储 + `get_state`/`update_state`/`add_agent`/`remove_agent` |
| `backend/src/api/scenes.py` | **新建** | `GET/POST /api/scenes/{id}/state` + `POST/DELETE /api/scenes/{id}/agents` |
| `backend/src/main.py` | 修改 | 注册 scenes router |
| `frontend/src/api/scenes.ts` | **新建** | `useSceneState` / `useSyncSceneState` React Query hooks |
| `frontend/src/api/queryKeys.ts` | 修改 | +`sceneKeys` |
| `frontend/src/pages/GameScene.tsx` | 修改 | 后台 `useEffect` 同步 Agent 状态到后端 API |

## 技术决策

1. **SceneEngine 纯内存**：无 SQLite 表，进程重启后清空。后续 Step 65（时间轴/快照）可接入 SceneSnapshot 持久化。
2. **双写模式**：localStorage 为即时主存储，后台 `useEffect` 异步 POST 到后端 API。API 失败不影响用户体验。
3. **RESTful 端点**：`GET state` 读、`POST state` 全量替换、`POST agents` 追加、`DELETE agents/{id}` 移除。
4. **数据类型对齐**：后端 `AgentSpriteData` dataclass 与前端 `AgentSpriteData` TypeScript interface 字段名一致（camelCase）。

## 测试结果

- [x] 前端 239/239（24 files）✅
- [x] TypeScript 零错误 ✅
- [x] 后端 316/316 ✅
