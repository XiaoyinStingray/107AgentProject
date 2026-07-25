# Step 45 — 档案馆功能 (#51, #52, #54)

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-25 |
| Phase | Phase 12.7 |
| Plan 章节 | [plan-state2.md](../plan-state2.md) §Step 45 |
| 状态 | ✅ done |

## 产出

### #51 精彩回放 — simulations 持久化 + 实时追踪

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/models/simulation_orm.py` | **新建** | SimulationRow SQLite ORM |
| `backend/src/api/simulations.py` | **修改** | async + SQLite 持久化；响应富化 world_name/agent_count/event_count；list 跳过已删 world |
| `backend/src/db.py` | **修改** | 注册 simulation_orm |
| `backend/src/api/worlds.py` | **修改** | `create_simulation`/`finish_simulation` 调用加 await |
| `backend/src/api/sse.py` | **修改** | `_finish_engine_simulation` 加 async；引擎重建时恢复 simulation_id |
| `frontend/src/api/simulations.ts` | **修改** | SimulationResponse 加 world_name/agent_count/event_count |
| `frontend/src/pages/Archive.tsx` | **修改** | HighlightsPanel：`useSimulations()` 真实数据；点击展开在线展示事件列表（不跳转沙盒）；运行中模拟每 10s 自动轮询 + 🔄 刷新按钮 |

### #52 实验模板 — 真实场景数据

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/pages/Archive.tsx` | **修改** | TemplatesPanel：`useScenarios()` 真实场景；双按钮（🎭 单人 → /theater，👥 多人 → /sandbox + 预选 Agent 数） |

### #54 成就系统 — 后端计算

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/api/achievements.py` | **新建** | GET /api/achievements — 从 SQLite 统计 agents/worlds/simulations/arenas 计数 |
| `backend/src/main.py` | **修改** | 注册 achievements router |
| `frontend/src/api/achievements.ts` | **修改** | Mock → 真实 API 调用 |

### 附带修复

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/api/worlds.py` | **修改** | `_restore_simulation_id()` — 4 个引擎重建路径 + reset 端点恢复 simulation_id；`finish_world` 新端点（单人结束保留数据）；events 端点注入 agent_name；pause 端点主动 cancel group token |
| `backend/src/api/export.py` | **修改** | `_collect_events()` 加 SQLite fallback；两处调用加 await |
| `backend/src/engines/world/streaming.py` | **修改** | solo tick polling 暂停检测 + group tick CancellationToken 暂停中断 |
| `frontend/src/hooks/useSSE.ts` | **修改** | `replayMissedEvents` 字段映射完全对齐 `sse.py:_event_to_dict`（含 message/subtext/tone/action/target/agent_name） |
| `frontend/src/api/export.ts` | **修改** | `useExportReport()` 匹配真实 GET API（返回 blob） |
| `frontend/src/api/worlds.ts` | **修改** | +`useFinishWorld` |
| `frontend/src/pages/SoloTheater.tsx` | **修改** | +⏹ 结束按钮；`useLocation` 读取模板预选场景 |
| `frontend/src/pages/GroupSandbox.tsx` | **修改** | 模板 agentCount 预选 Agent 数 |
| `frontend/src/components/world/SandboxSetup.tsx` | **修改** | 场景 key 修复（`scenario.id ?? name`） |
| `frontend/src/components/archive/archive-components.test.tsx` | **修改** | 测试适配新 hooks + 双按钮 |

### bugs.md 更新

| Bug | 状态 |
|-----|------|
| BUG-004 成就 Mock | ✅ 修复 |
| BUG-007 回放 Mock + 跳转错误 | ✅ 修复 |
| BUG-008 模板 Mock | ✅ 修复 |
| BUG-009 ExportPanel 裸 fetch | ✅ 修复 |
| BUG-015 导出只读内存 | ✅ 修复 |
| BUG-018 群组暂停延迟 | ✅ 修复 |
| BUG-019 侧边栏跳转 | 📝 已记录 |
| BUG-020 REST/SSE 字段不一致 | ✅ 修复 |

## 接口变更

- `SimulationRecord`（后端）：+`world_name`, `agent_count`, `event_count`（可选，向后兼容）
- `SimulationResponse`（前端）：同上
- 新增端点：`POST /api/worlds/{id}/finish`、`GET /api/achievements`
- `GET /api/worlds/{id}/events`：响应中 `data.agent_name` 新增（不破坏 SimEvent 结构）
- `create_simulation`/`finish_simulation`：sync → async（4 个调用处已加 await）

## 测试结果

- [x] 后端 256/258 passed（2 个预存 OpenAI 凭证失败）
- [x] 前端 227/227 passed（20 test files）
- [x] TypeScript 零错误
- [x] 人工验收：新 World 创建 → 模拟 → 暂停恢复 → 历史对话正常 → 结束 → 精彩回放有记录且可实时追踪

## 已知问题

- 旧 World（Step 45 前创建的）simulation 记录不兼容，需删除重建
- BUG-019 侧边栏跳转（预存，不在本步范围）
- 关系成就（和平使者/宿敌）保持 0%——关系分数无持久化表

## 对下一步的提示

- Step 46（竞技场增强）已完成，Step 45 收尾后可继续 Step 47（LLM 成本与性能优化）
- `docs/plan-state2.md` Step 45 状态需更新为 ✅
