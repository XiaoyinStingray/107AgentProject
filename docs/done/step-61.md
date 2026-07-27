# Step 61 — 排行榜与趋势

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-27 |
| Phase | Phase 15.4 |
| Plan 章节 | [plan-state3.md](../plan-state3.md) §Step 61 |
| 状态 | ✅ done |

## 产出

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/pages/BenchLab.tsx` | 修改 | +LeaderboardTable（排行榜表，按维度排序 + 模型筛选）+ TrendView（SVG 折线趋势 + 退化检测） |

## 功能

- **排行榜**：按综合分或任意六维排序，可按模型筛选，显示所有评测的排名和分数
- **趋势**：选模型 + 维度 → SVG 折线图展示分数随时间变化；连续 3 次下降自动标注 ⚠️ 退化警告
- 纯前端，数据来自已有 `bench_runs` 表

## 测试结果

- [x] 前端 239/239（24 files） — ✅
- [x] TypeScript 零错误 — ✅
