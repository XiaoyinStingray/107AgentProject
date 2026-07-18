# Bug 记录

> 测试发现的问题集中记录在这里；修复并确认完成后，再更新文档并删除对应记录。

---

## BUG-001：React Router 加载页面时产生 Future Flag 控制台警告

- **状态**：待处理
- **优先级**：P2（不阻塞功能，但污染测试控制台）
- **发现日期**：2026-07-18
- **环境**：前端 Vite，`http://127.0.0.1:5173/`
- **复现步骤**：
  1. 启动前端开发服务器。
  2. 访问 `/`、`/agents` 或 `/debug/sse` 等任意路由。
  3. 查看浏览器控制台 warning。
- **实际结果**：每次路由加载出现两条 React Router Future Flag warning：`v7_startTransition` 与 `v7_relativeSplatPath`。
- **期望结果**：测试控制台无框架升级提示，或项目显式配置对应 future flags 后不再重复提示。
- **影响范围**：不影响当前页面渲染与交互，但会干扰控制台错误筛查。
- **关联位置**：`frontend/src/App.tsx` 的 `BrowserRouter` 路由入口。
