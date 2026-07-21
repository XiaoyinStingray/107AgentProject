# Step 29 — Agent 创建链路打通 + API 层初始化

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-20 |
| Phase | Phase 10.1 |
| Plan 章节 | [plan-state2.md](../plan-state2.md) §Step 29 |
| 状态 | ✅ done |

## 产出

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/api/client.ts` | 新建 | 统一 HTTP 客户端（GET/POST/PUT/DELETE + error handling） |
| `frontend/src/api/queryKeys.ts` | 新建 | React Query key 工厂（agentKeys, worldKeys） |
| `frontend/src/api/agents.ts` | 新建 | `useAgents`, `useAgent`, `useCreateAgent`, `useDeleteAgent` |
| `frontend/src/main.tsx` | 修改 | 包裹 `<QueryClientProvider>` |
| `frontend/src/pages/AgentFoundry.tsx` | 修改 | 切到 React Query `useAgents` + `useCreateAgent`，去掉 Mock |
| `frontend/src/pages/Arena.test.tsx` | 修改 | 加 `QueryClientProvider` 包裹 `render(<App />)` |
| `.env` | 新建 | LLM 配置模板（API Key 待用户填入） |

## 决策记录

- **过渡双写 Zustand：** AgentFoundry 创建成功后同时写入 React Query cache（新架构）和 Zustand `useAgentStore`（旧架构）。原因：其他 6 个页面（SoloTheater、GroupSandbox、Arena、NarrativeFactory、ControlPanel、Archive）仍通过 Zustand 获取 Agent 列表。Step 36 统一切换到 React Query 后移除双写。
- **`@tanstack/react-query` 已预装：** State 1 时已加入 `package.json`（v5.51.0），本步无需新增依赖。
- **Mock 开关从页面级移至全局：** 去掉了 `AgentFoundry` 中 `useApi` 的 `mockData` 参数。Mock 控制将在 Step 36 统一为 `VITE_MOCK_API` 环境变量 + `client.ts` 拦截。
- **`staleTime: 30s`：** Agent 列表缓存 30 秒内不重复请求，创建后 `invalidateQueries` 立即刷新。

## 接口变更

- 无共享 Pydantic model 或 TypeScript 接口变更。
- `useApi` hook 未被删除——其他页面仍在使用（Step 36 统一替换）。
- `useAgentStore`（Zustand）未被删除——仍被 7 个页面消费（Step 36 统一移除服务端数据）。
- ⚠️ **BREAKING：** AgentFoundry 不再 import `MOCK_AGENT_RESPONSE` 和 `useApi`；需 `QueryClientProvider` 存在于组件树中。

## 测试结果

- [x] TypeScript 类型检查 — ✅ 零错误
- [x] 前端全量测试 — ✅ 197 passed（修复 1 个因缺少 QueryClientProvider 导致的测试失败）
- [x] Vite 生产构建 — ✅ 通过

## 已知问题

- BUG-001：React Router v7 Future Flag 警告仍存在（同 Step 28）
- 生产包 710KB，大于 500KB 阈值——Step 38 路由懒加载解决
- `.env` 中 `LLM_API_KEY` 待用户填入才能跑通真 LLM 调用

## 组件树

```text
main.tsx
└── QueryClientProvider (NEW)
    └── App
        └── Layout
            └── AgentFoundry
                ├── useAgents()        ← React Query (NEW)
                ├── useCreateAgent()   ← React Query (NEW)
                └── useAgentStore()    ← Zustand (过渡双写, Step 36 移除)
```

## 对下一步的提示

- Step 30 需要新增 `backend/src/api/narratives.py` 和注册路由到 `main.py`
- 用户需先配置 `.env` 中的 `LLM_API_KEY` 才能验证真实 Agent 创建链路
- `api/queryKeys.ts` 中 worldKeys 已预定义，Step 31 直接用
