# Step 00 — 项目目录初始化

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-17 |
| Phase | Phase 0.1 |
| Plan 章节 | [development-plan.md](../development-plan.md) §0.1 |
| 状态 | ✅ done |

## 产出

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/main.py` | 新建 | FastAPI app + `/health` 端点 |
| `backend/src/__init__.py` | 新建 | 包初始化 |
| `backend/src/models/__init__.py` | 新建 | 占位（Step 01 填充） |
| `backend/src/engines/__init__.py` | 新建 | 引擎包入口 |
| `backend/src/engines/persona/__init__.py` | 新建 | 占位 |
| `backend/src/engines/agent_factory/__init__.py` | 新建 | 占位 |
| `backend/src/engines/world/__init__.py` | 新建 | 占位 |
| `backend/src/engines/narrative/__init__.py` | 新建 | 占位 |
| `backend/src/engines/arena/__init__.py` | 新建 | 占位 |
| `backend/src/api/__init__.py` | 新建 | 占位 |
| `backend/src/llm/__init__.py` | 新建 | 占位 |
| `backend/tests/__init__.py` | 新建 | 测试包 |
| `backend/tests/conftest.py` | 新建 | pytest fixtures |
| `backend/data/.gitkeep` | 新建 | SQLite 数据目录占位 |
| `frontend/package.json` | 新建 | React + Vite + TailwindCSS 依赖 |
| `frontend/index.html` | 新建 | 入口 HTML（JetBrains Mono + Inter 字体） |
| `frontend/vite.config.ts` | 新建 | Vite 配置 + `/api` 代理到 8000 |
| `frontend/tsconfig.json` | 新建 | TypeScript 严格模式 |
| `frontend/tailwind.config.js` | 新建 | 暗色控制台调色板 |
| `frontend/postcss.config.js` | 新建 | PostCSS + Tailwind |
| `frontend/src/main.tsx` | 新建 | React 入口 |
| `frontend/src/App.tsx` | 新建 | 路由 + Home 页 |
| `frontend/src/index.css` | 新建 | Tailwind 指令 + 自定义样式 |
| `frontend/src/components/layout/Layout.tsx` | 新建 | 顶栏 + 底栏 + Outlet 布局 |
| `.gitignore` | 修改 | 添加 `backend/data/*.db` 排除规则 |

## 决策记录

- **Python >= 3.12：** conda 创建 `lifelab` 环境（Python 3.12）。路径 `E:\application\anaconda\envs\lifelab\python.exe`。
- **Vite 代理：** `/api` 请求代理到 `localhost:8000`，开发时前后端同源无 CORS 问题。
- **布局组件：** 先做了顶栏+底栏+Outlet 的基础 Layout，后续页面可以直接嵌套。
- **npm 依赖：** `recharts` 有 deprecation warning（建议升 v3），暂不处理——v2 够用。

## 接口变更

无。共享类型留到 Step 01 定义。

## 测试结果

- [x] `/health` 返回 `200 {"status": "ok", "version": "0.1.0"}` — ✅ 通过
- [x] `npx tsc --noEmit` 零错误 — ✅ 通过
- [x] `npx vite build` 构建成功（773ms） — ✅ 通过
- [x] Python 依赖全部安装成功（含 autogen-agentchat 0.7.5） — ✅ 通过

## 已知问题

- `fastapi.testclient` 触发 `StarletteDeprecationWarning: Using httpx with starlette.testclient is deprecated` ——不影响功能，后续关注 starlette 更新。
- `recharts@2.x` deprecation warning ——不影响功能，P3 再升级 v3。

## 对下一步的提示

- Step 01 需要在 `backend/src/models/agent.py` 中定义完整的 Pydantic 模型。
- Plan 中已提供完整的类型定义，直接复制即可。
- conda 环境名 `lifelab`，手动激活用 `conda activate lifelab`；非交互式用 `E:\application\anaconda\envs\lifelab\python.exe`。
- `frontend/src/types/*.gitkeep` 需要在 Step 02 替换为 `.ts` 文件。
