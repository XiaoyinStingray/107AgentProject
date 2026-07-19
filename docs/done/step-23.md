# Step 23 — 叙事页面 (M5)

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-19 |
| Phase | Phase 7.8 |
| Plan 章节 | [development-plan.md](../development-plan.md) §7.3.8 |
| 状态 | ✅ done |

## 产出

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/mocks/narratives.ts` | 新建 | 类型（NarrativeStyle/NarrativeResult/NarrativeStyleMeta）+ 4 种风格 × 3 个 Mock Agent = 12 份完整 Mock 叙事 + 风格元数据 + getMockNarrative/countWords 工具函数 |
| `frontend/src/pages/NarrativeFactory.tsx` | 新建 | 叙事工厂页面：setup → generating（2s mock 延迟）→ result 三阶段 |
| `frontend/src/components/narrative/narrative-components.test.tsx` | 新建 | 13 个 Vitest 测试：setup/generating/result 三阶段 + mock 工具函数 |
| `frontend/src/App.tsx` | 修改 | `/narratives` 路由从 PlaceholderPage 切换为 `<NarrativeFactory />` |

## 决策记录

- **4 种核心风格 + 3 种 P3 占位：** 后端 NarrativeEngine 仅支持 STORY/DIARY/LETTER/PODCAST 四种风格。menuData.ts M5 模块共 7 项，其中「微电影大纲/自动连载/Agent 自画像」标 P3 占位（disabled + Badge），与 Step 22 Arena 处理未实现模式的模式一致。

- **Mock 叙事库覆盖 3 个 Agent × 4 种风格 = 12 份完整内容：** 为保证 Mock 模式下的真实体验，为小明（INTJ-T 小镇做题家）、小红（ENFP-A 社交蝴蝶）、小刚（ESTJ-A 秩序至上）各写 4 份完整叙事（小说 800-1500 字 / 日记 300-500 字 / 信 500-800 字 / 播客 800-1200 字），内容与人设严格一致。未知 Agent 回退到小明的同风格结果。

- **三阶段流程：** `setup`（选风格 + 选 Agent + 填 target）→ `generating`（2s mock 延迟 + 加载动画）→ `result`（标题 + 正文 + 元数据 + 重新生成/复制/下载按钮）。与 Step 22 Arena 的 setup→debating→judging→result 模式一致。

- **附加参数仅 letter/podcast 显示：** `selectedStyle.needsTarget` 控制收信人/主题输入框的显隐。留空时使用默认值（letter→"未来的自己"，podcast→"小镇做题家的逆袭"）。

- **复制/下载功能：** 复制使用 `navigator.clipboard.writeText`（不可用时静默失败）；下载生成 `.md` 文件（`Blob` + `URL.createObjectURL`），文件名格式 `{agent_name}-{style}-{date}.md`。

- **Agent 来源复用 `useAvailableAgents`：** 与 Arena/SoloTheater/GroupSandbox 一致——Zustand store + MOCK_AGENTS 合并去重。

- **正文用 `<pre whitespace-pre-wrap>` 渲染：** 保留 LLM 返回的换行格式，同时用 `font-sans` 覆盖默认等宽字体，保证中文阅读体验。

## 接口变更

```typescript
// 新增类型（mocks/narratives.ts）——与后端 NarrativeResponse 对齐
export type NarrativeStyle = "story" | "diary" | "letter" | "podcast";
export interface NarrativeResult {
  title: string;
  content: string;
  style: NarrativeStyle;
  agent_id: string;
  agent_name: string;
  generated_at: string;
  word_count: number;
}
export interface NarrativeStyleMeta {
  key: NarrativeStyle;
  label: string;
  emoji: string;
  description: string;
  needsTarget: boolean;
  targetLabel: string;
  targetPlaceholder: string;
  priority: "P1" | "P2" | "P3";
  available: boolean;
}
```

- ⚠️ BREAKING: 修改 Step 16 产出 `App.tsx` 中 `/narratives` 路由（PlaceholderPage → `<NarrativeFactory />`），已回归测试通过。
- 不修改 Phase 0 共享类型。`NarrativeStyle`/`NarrativeResult` 为本步新增，与后端 `NarrativeEngine` 对齐但独立定义在前端 mocks 层。

## 组件树

```text
NarrativeFactory (/narratives)
├── setup
│   ├── 风格 Tab 栏（4 可用 + 3 P3 disabled）
│   │   └── 每个 Tab：emoji + label + description + Badge(P1/P2/P3)
│   ├── Agent 选择器（grid-cols-3）
│   │   └── 每个 Agent：首字母头像 + name + MBTI + narrative 摘要
│   ├── 附加参数（仅 letter/podcast 显示）
│   │   └── target 输入框 + 默认值提示
│   ├── 当前选择摘要卡
│   └── 生成按钮（disabled until agent selected）
├── generating（2s mock 延迟）
│   └── emoji + "正在生成{风格}…" + Agent + target + 三点动画
└── result
    ├── 顶部操作栏（返回配置 + 生成时间 + 字数）
    ├── 叙事正文卡
    │   ├── 标题区（emoji + title + Agent + 风格 + target）
    │   └── 正文（<pre whitespace-pre-wrap>）
    └── 底部操作（重新生成 + 复制 + 下载 .md）
```

## 测试结果

- [x] 前端 Layer 1：Vitest `25 passed`（12 原有 + 13 新增）
  - setup 阶段：风格 Tab 渲染（含 P3 占位）、生成按钮禁用逻辑、P3 disabled、target 输入框显隐
  - generating/result 阶段：生成流程、返回配置、重新生成
  - mock 工具函数：getMockNarrative 匹配/回退、countWords、NARRATIVE_STYLES 结构、3 Agent × 4 风格覆盖
- [x] TypeScript：`npx tsc --noEmit` 无错误
- [x] 生产构建：`npx vite build` 通过（623 kB，chunk 体积警告为已有问题）
- [x] Step 16 回归：`/narratives` 路由从占位页切换为真实组件，其余路由不受影响
- [x] 后端测试回归：未修改后端代码，无需重跑

## 视觉走查

- [x] 暗色主题一致——所有色彩使用 design token（bg-bg-card / text-accent-green / border-border 等）
- [x] 1280px 不炸——grid-cols-2 md:grid-cols-4 风格 Tab + grid-cols-1 md:grid-cols-3 Agent 选择器自适应
- [x] Mock 模式可独立浏览——无需后端，12 份预置叙事覆盖 3 Agent × 4 风格
- [x] setup → generating → result 三阶段动画流畅（fade-in + pulse 加载点）
- [x] letter/podcast 的收信人/主题输入框正确显隐
- [x] 复制/下载功能可用（剪贴板 API + Blob 下载）

## 已知问题

- 后端 `/api/narratives/*` 端点在 plan §5.1 路由表中列出但尚未实现，当前完全依赖 Mock 数据。后端接入后需将 `getMockNarrative` 替换为真实 API 调用。
- Mock 叙事内容固定——同一 Agent + 同一风格每次"重新生成"返回相同内容（仅时间戳刷新）。接真实 NarrativeEngine 后每次生成会有 LLM 随机性。
- Vite 构建产物 623 kB，超过 500 kB 提示阈值（已有问题，同 Step 20–22）。
- BUG-001（React Router Future Flag 警告）仍存在，不影响功能。

## 对下一步的提示

- **Step 24（控制台 + 干预台 M6/M7）：** 依赖 Step 20（主观察界面），可直接开始。
- **后端叙事 API：** 当 `/api/narratives/story|diary|letter|podcast` 端点实现后，将 `NarrativeFactory` 中的 `getMockNarrative` 调用替换为 `useApi` hook 的 POST 请求。接口应接收 `{ agent_id, style, events, persona, target? }`，返回 `NarrativeResult`。
- **事件来源：** 当前 Mock 不依赖真实事件流。接真实 API 后，需从 `/api/worlds/{id}/events` 拉取该 Agent 参与的事件列表作为叙事输入。
- `NarrativeStyle`/`NarrativeResult` 类型已定义，后端对齐即可直接复用。
