# Step 27 — 56 菜单铺量 + 报告导出

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-19 |
| Phase | Phase 9.1 |
| Plan 章节 | [development-plan.md](../development-plan.md) §9.1, §9.2 |
| 状态 | ✅ done |

## 产出

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/api/export.py` | 新建 | 报告导出 API：`build_report_markdown()` 纯函数 + `GET /api/export/report/{world_id}` (Markdown) + `GET /api/export/report/{world_id}/json` (JSON) + `_ascii_slug()` 文件名安全化 |
| `backend/src/main.py` | 修改 | 挂载 `export_router` |
| `backend/tests/test_export.py` | 新建 | 12 个 pytest 测试：报告生成纯函数 (6) + Markdown 端点 (4) + JSON 端点 (2) |
| `frontend/src/pages/Archive.tsx` | 修改 | ExportPanel 升级为双模式（API 世界导出 + Mock Agent 导出），新增 `useAvailableWorlds` hook |

## 决策记录

- **56 菜单占位已完成，无需额外路由：** Step 16–25 已实现的 `PlaceholderPage` + Sidebar hash 导航覆盖了全部 56 项菜单。P3 项点击后展示功能名称 + emoji + 优先级 + "建设中" 占位。本步无需新增路由或组件。

- **报告导出以 world_id 为参数：** Plan §5.1 定义 `/api/export/report/{sim_id}`。实际实现使用 `world_id`（而非 sim_id），因为事件按世界组织，当前架构中 world 即模拟实例。

- **文件名使用 ASCII slug：** 中文世界名无法直接放入 `Content-Disposition` header（latin-1 编码限制）。使用 `_ascii_slug()` 将中文转为 MD5 短摘要 + ASCII 前缀，保证文件名安全且唯一。

- **前端 ExportPanel 双模式：** API 模式（从 `/api/worlds` 获取世界列表 → 调用导出 API）+ Mock 模式（原有 Agent 级 Mock 导出）。无后端时自动降级到 Mock 模式。

- **事件来源为内存 WorldEngine：** 当前导出 API 从 `_active_worlds` 注册表读取事件（内存）。如世界未运行或已清理，返回 404。后续可升级为从 SQLite events 表查询。

## 接口变更

```python
# 新增路由（api/export.py）
router = APIRouter(prefix="/api/export", tags=["export"])

@router.get("/report/{world_id}")         # → Markdown 文件下载
@router.get("/report/{world_id}/json")    # → JSON 文件下载

# 新增函数
def build_report_markdown(world_id, world_name, events, agent_names, scenario_name="") -> str
def _ascii_slug(text, max_len=20) -> str
```

- 无 BREAKING 变更。所有新增路由为本步独有。
- 不影响任何已完成步骤的代码。

## 测试结果

- [x] 验收标准 1：占位页模板——所有 56 项菜单可导航 — ✅ 通过（Sidebar + PlaceholderPage 已有基础设施）
- [x] 验收标准 2：研究报告导出 API — ✅ 通过（12 个新测试全绿）
  - `build_report_markdown()` 生成合法 Markdown
  - Markdown 端点返回 `text/markdown` + `Content-Disposition: attachment`
  - JSON 端点返回 `application/json` + 完整事件数据
  - 404 场景：世界不存在 / 无事件
- [x] 全量后端测试：`194 passed`（12 新增 + 182 已有），无回归
- [x] TypeScript 编译：`tsc --noEmit` 无错误
- [x] 全量前端测试：`171 passed`（8 个测试文件），无回归

## 已知问题

- 报告导出依赖内存中的 WorldEngine 事件。模拟结束后如果进程重启，事件丢失。后续可从 SQLite events 表恢复。
- 前端 `useAvailableWorlds` 的 fetch 在 Vitest 测试中触发 `act(...)` 警告（不影响测试结果）。
- BUG-002（Sidebar hash 跳转无效）仍未修复——P3 占位页通过 hash 展示功能名，但已有页面不响应 hash。

## 对下一步的提示

- **Step 28（演示脚本 + 最终联调）：** 所有 56 菜单可见，报告导出 API 就绪。演示流程可参考 Plan §9.3：
  1. 开场 → Dashboard
  2. 铸造厂 → 创建 2-3 个 Agent
  3. 群体沙盒 → 投放 → 观察 → 关系图
  4. 叙事工厂 → 一键故事
  5. 竞技场 → Agent PK
  6. 56 功能滚屏
  7. 档案馆 → 导出报告
- 导出 API 的 `build_report_markdown()` 可被 Step 28 的演示脚本直接调用生成示例报告。
