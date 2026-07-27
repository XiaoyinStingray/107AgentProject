# Step 60 — 对比与盲测

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-27 |
| Phase | Phase 15.3 |
| Plan 章节 | [plan-state3.md](../plan-state3.md) §Step 60 |
| 状态 | ✅ done |

## 产出

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/pages/BenchLab.tsx` | 修改 | +盲测对比（一键随机选两个 Run → 隐藏身份 → 揭盲）+ 手动对比选择器 + OverlayHexagon 叠加雷达图 + CompareView 差值表 |

## 功能

- **盲测对比**：`🔒 盲测对比` 按钮 → 系统随机选两个已完成的 Run → 分配为 Model X / Model Y → 用户不知道哪个是哪个 → 点 `🔓 揭盲` 显示真实身份
- **手动对比**：下拉选择 Run A vs Run B（用户明确知道在比什么）
- **叠加雷达图**：两个六边形叠加同一张 SVG，橙色(A) vs 绿色(B)，400px，带图例
- **差值表**：六维分数逐一对比，优方绿色高亮，差值带符号

## 测试结果

- [x] 前端 239/239（24 files） — ✅
- [x] TypeScript 零错误 — ✅
