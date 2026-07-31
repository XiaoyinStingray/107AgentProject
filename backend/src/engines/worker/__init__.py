"""
Worker 引擎 — State 5: 从"会聊天的 Agent"到"能干活的 Agent"。

Phase 22 (本层) 只定义抽象接口和协议，不写实现代码。
Phase 23 起引用本层的 Protocol/ABC/数据类/状态机实现具体功能。

模块结构:
    workspace.py  — WorkspaceProvider ABC + FileInfo / SandboxResult
    events.py     — Worker SSE 事件 Schema (10 种事件类型)
    tools.py      — ToolSpec 注册接口 (5 个工具规格)
    prompts.py    — Agent 决策 prompt 模板 + JSON 协议
    engine.py     — AgentWorker 状态机驱动决策循环 (Phase 23 实现)
    sandbox.py    — Python 子进程安全沙盒 (Phase 23 实现)
    scheduler.py  — 自主调度器 Cron + 文件监视器 (Phase 26 实现)
"""
