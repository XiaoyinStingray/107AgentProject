# 人生实验室 · Life Lab

> Agent 社会实验平台。用户创建/部署自主 Agent → Agent 在场景中自主感知、思考、决策、互动 → 用户观察涌现行为。
>
> **一句话：** 你是导演，Agent 是演员。你设定好角色和舞台，按下开始，看他们怎么演。

## 比赛结束前本仓库不允许转public、fork或是上传到其他网站。push时请注意不要携带Claude、Codex等工具配置，有需求可自行添加gitignore。

## 团队成员

| 姓名 | 邮箱 |
|------|------|
| 赵俊宇 | zhaojunyu0515@mail.ustc.edu.cn |
| 刘福康 | lfkustc@mail.ustc.edu.cn |
| 岳雨婷 | yueyuting6@mail.ustc.edu.cn |
| 吴铮 | wuzheng081@mail.ustc.edu.cn |

此项目由以上成员共同维护，旨在为107杯提供参赛项目。

## 项目简介

本项目构建一个基于 **FastAPI + AutoGen + React** 的 AI Agent 社会模拟平台。系统经历 6 个阶段持续迭代：

| 阶段 | 名称 | 核心产出 | 状态 |
|------|------|----------|------|
| State 1 | 骨架搭建 | M1–M8 八大模块 + 前端骨架（Step 00–28） | ✅ 完成 |
| State 2 | 联通 + 补全 | 前后端联通 + 功能补全 + 前端重整（Step 29–50） | ✅ 完成 |
| State 3 | 三大新模块 | Agent Team + LLM Bench + M11 游戏化场景（Step 51–76） | ✅ 完成 |
| State 4 | Agent 内核强化 | 工具真实化 + 上下文连续 + Scratchpad + 场景-Brain 联动（Step 77–85） | ✅ 完成 |
| State 5 | Worker 工作台 | Agent 干活——双轨工作区 + 多 Agent 协作 + 管道编排 + 自主调度（Step 86–97） | ✅ 完成 |
| State 6 | 三线并行 | M11 主动社交 + M12 Worker 进阶 + 零成本推广（Step 98–T14） | 🚧 进行中 |

### 测试线

| 测试 | 覆盖阶段 | 内容 | 状态 |
|------|---------|------|------|
| T1–T2 | State 3 Phase 14 | Team 模块单元 + 集成 + Bug 修补 | ✅ |
| T3–T4 | State 3 Phase 15 | Bench 模块集成 + Bug 修补 | ✅ |
| T5–T6 | State 3 Phase 16 | M11 场景性能 + Bug 修补 | ✅ |
| T7 | State 4 Phase 18 | Agent 内核复活测试（工具真实化 + 上下文连续 + Scratchpad） | ⬜ 未做（开发线） |
| T8 | State 4 Phase 19 | 场景-Brain 联动测试（SSE 驱动 + 动态重规划） | ⬜ 未做（开发线） |
| T9 | State 4 Phase 20 | 记忆固化 + 行为指纹测试 | ⬜ 未做（开发线） |
| T10 | State 5 Phase 23 | Worker 核心测试（引擎 + 工具 + E2E） | ⬜ 未做（开发线） |
| T11 | State 5 Phase 24 | 双轨工作区测试（文件一致性 + SSH 断连恢复） | ⬜ 未做（开发线） |
| T12 | State 5 Phase 25 | 多 Agent + 管道测试（并发 + E2E） | ⬜ 未做（开发线） |
| T14 | State 6 | 三线集成测试（A线全交互 + B线沙盒 + C线Demo） | ⬜ 未做（开发线） |

### 模块总览

| 模块 | 说明 | 核心能力 |
|------|------|---------|
| M1 铸造厂 | Agent 创建 | 自然语言 → 完整人格（MBTI + 大五人格 + 决策风格 + 背景故事） |
| M2 单人剧场 | 单 Agent 观察 | 场景投放、思维流实时展示、Agent 自主决策 |
| M3 群体沙盒 | 多 Agent 互动 | 群体投放、Agent 间对话、关系演化、竞争博弈 |
| M4 竞技场 | Agent 对抗 | 1v1 辩论/面试/路演、LLM 裁判评分、战报生成 |
| M5 叙事工厂 | 事件→故事 | 小说/日记/信/播客脚本，保持 Agent 口吻一致 |
| M6 控制台 | 上帝视角 | 多 Agent 仪表盘、事件热力图、搜索、决策模式识别 |
| M7 干预台 | 导演干预 | 运行时注入事件、干预历史 |
| M8 档案馆 | 沉淀分享 | 精彩回放、实验模板、成就系统、研究报告导出 |
| M9 | Agent Team | 多 Agent 协作——任务分解 + 分工执行 + 复盘报告 |
| M10 | LLM Bench | Agent 评测——批量对战 + 六维雷达 + 排行榜 + 行为指纹 |
| M11 | 游戏化场景 | Phaser 2D 场景——精灵渲染 + 自主移动 + 对话 + 导演模式 |
| M12 | Worker 工作台 | Agent 生产力——搜索 + 代码执行 + 文件产出 + 管道编排 |

## 技术栈

| 层 | 技术 |
|----|------|
| Web 框架 | FastAPI (Python 3.12+) |
| Agent 编排 | AutoGen 0.7+ |
| 数据库 | SQLite + aiosqlite |
| 前端框架 | React 18 + Vite + TypeScript |
| 样式 | TailwindCSS |
| 状态管理 | React Query (TanStack Query) + Zustand |
| 图表 | Recharts |
| 图标 | Lucide Icons |
| 实时通信 | SSE (Server-Sent Events) |
| LLM | OpenAI 兼容 API（DeepSeek / GLM / OpenAI 均可） |

## 快速开始

### 环境要求

- Python 3.12+
- Node.js 18+
- npm

### 安装

```bash
# 克隆仓库
git clone https://github.com/XiaoyinStingray/107AgentProject && cd 107AgentProject

# Python 环境
conda create -n lifelab python=3.12
conda activate lifelab
pip install -r requirements.txt

# 前端依赖
cd frontend
npm install
cd ..
```

### 配置

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑 .env 填入 LLM 配置
# LLM_API_KEY=你的API Key
# LLM_BASE_URL=https://api.deepseek.com/v1
# LLM_MODEL=deepseek-chat
```

### 启动

```bash
# 终端 1：启动后端
python run.py
# → http://127.0.0.1:8000
# 健康检查: http://127.0.0.1:8000/health → {"status":"ok"}
# API 文档: http://127.0.0.1:8000/docs

# 终端 2：启动前端
cd frontend
npm run dev
# → http://127.0.0.1:5173
```

### 验证

打开 `http://127.0.0.1:5173/agents`，输入 Agent 描述（如"来自小镇的计算机系新生，内向但野心大"），点击创建——应返回 LLM 生成的真实人格。

## 仓库结构

```
├── backend/                     # 后端服务
│   ├── src/
│   │   ├── main.py              # FastAPI 应用入口
│   │   ├── config.py            # 配置管理（pydantic-settings）
│   │   ├── db.py                # SQLite + aiosqlite
│   │   ├── models/              # Pydantic 类型定义
│   │   ├── api/                 # REST API 路由
│   │   │   ├── agents.py        # /api/agents CRUD
│   │   │   ├── worlds.py        # /api/worlds 管理 + SSE
│   │   │   ├── sse.py           # SSE 事件推送
│   │   │   └── export.py        # 研究报告导出
│   │   ├── engines/             # 核心引擎
│   │   │   ├── persona/         # 人格引擎（自然语言 → Persona JSON）
│   │   │   ├── agent_factory/   # Agent 工厂（LifeAgent + AutoGen 封装）
│   │   │   ├── world/           # 世界引擎（Tick 调度 + 关系演化）
│   │   │   ├── narrative/       # 叙事引擎（事件 → 小说/日记/信/播客）
│   │   │   └── arena/           # 竞技引擎（1v1 辩论 + 裁判评分）
│   │   └── llm/                 # LLM 客户端工厂
│   ├── tests/                   # 后端单元测试
│   └── data/                    # SQLite 数据文件（gitignore）
├── frontend/                    # 前端应用
│   └── src/
│       ├── main.tsx             # 应用入口 + QueryClientProvider
│       ├── App.tsx              # 路由 + 布局
│       ├── api/                 # API 调用层（React Query hooks）
│       ├── pages/               # 8 个模块页面
│       ├── components/          # 共享 UI 组件
│       ├── hooks/               # 共享 hooks（useSSE, useApi）
│       ├── stores/              # Zustand stores
│       ├── types/               # TypeScript 类型定义
│       └── mocks/               # Mock 数据
├── docs/                        # 项目文档
│   ├── agent-lab-blueprint.md   # 工程蓝图
│   ├── development-plan.md      # State 1 计划
│   ├── plan-state2.md           # State 2 计划
│   ├── STEP.md                  # 开发流程规范
│   └── done/                    # 步骤完成记录
├── run.py                       # 后端一键启动脚本
├── requirements.txt             # Python 依赖
├── .env.example                 # 环境变量模板
└── README.md
```
