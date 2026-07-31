# Worker 引擎 — 5 分钟快速开始

## 启动

```bash
# 1. 安装依赖
cd backend && pip install -r requirements.txt

# 2. 设置 API Key
export LLM_API_KEY="your-api-key"
export LLM_BASE_URL="https://api.openai.com/v1"  # 或其他兼容接口
export LLM_MODEL="gpt-4o-mini"

# 3. 启动服务
cd backend/src && python -m uvicorn main:app --reload
```

## 使用 Worker

### Web UI

打开 `http://localhost:5173/worker`（开发模式）或 `http://localhost:8000/`（生产模式），
在终端中输入任务，Agent 会逐行展示执行过程。

### API

```bash
# 执行单 Agent 任务（SSE 流）
curl -N -X POST http://localhost:8000/api/workers/execute \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "worker-default",
    "task": "搜索最新的 AI 开发工具，写一份对比报告保存为 report.md",
    "workspace_type": "local"
  }'

# 查询 Worker 状态
curl http://localhost:8000/api/workers/scheduler/tasks

# 创建定时任务
curl -X POST http://localhost:8000/api/workers/scheduler/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "name": "每日新闻摘要",
    "agent_id": "worker-default",
    "task": "搜索今天的科技头条，写入 news.md",
    "trigger_type": "cron",
    "cron_expr": "daily 08:00"
  }'
```

### Docker

```bash
docker compose up -d
# → http://localhost:8000
```

## 架构概览

```
用户输入任务
    ↓
AgentWorker (状态机: IDLE→PLANNING→DECIDING→EXECUTING→REFLECTING→DONE)
    ↓
5 个工具 (web_search / run_python / write_file / read_file / list_files)
    ↓
WorkspaceProvider (LocalWorkspace 本地 / CloudWorkspace SSH)
    ↓
SSE 事件流 → 前端终端展示
```

## 更多

- 管道协作: 创建管道 → 添加节点 → 设置依赖 → 运行
- 云端工作区: 配置 SSH → 测试连接 → Agent 在远程服务器干活
- 自主调度: 定时任务 + 文件监视 → Agent 自动执行
