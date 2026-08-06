/**
 * GuidePage — 📖 使用教程。M1–M12 完整功能指南，带交互动画。
 */
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

/* ── 模块数据 ── */

interface Feature {
  emoji: string; label: string; desc: string;
  id?: number;
  anchor?: string;    // 同页锚点
  redirect?: string;  // 跳转其他路由
}

interface ModuleGuide {
  emoji: string; title: string; subtitle: string; route: string;
  overview: string; features: Feature[];
  color: string; colorBg: string; colorBorder: string;
}

const MODULES: ModuleGuide[] = [
  {
    emoji: "🎭", title: "M1 铸造厂", subtitle: "Agent Foundry", route: "/agents",
    color: "#a78bfa", colorBg: "rgba(167,139,250,0.08)", colorBorder: "rgba(167,139,250,0.25)",
    overview: "用自然语言创建 Agent——AI 自动生成完整人格档案，包括 MBTI、五大人格、背景故事和决策风格。",
    features: [
      { emoji: "🎭", label: "创建 Agent", desc: "输入角色描述（如「来自小镇的计算机系新生，内向但野心大」），LLM 自动生成完整人格——MBTI 类型、五大人格特质、背景故事、核心价值观和决策偏好。", id: 1, anchor: "foundry" },
      { emoji: "🔄", label: "Agent Remix", desc: "选择一个已有 Agent，调整性格参数（更外向/更激进），生成变体版本。适合做 A/B 对比实验。", id: 6, anchor: "item-6" },
      { emoji: "🎯", label: "目标系统", desc: "为 Agent 设定短期和长期目标。Agent 的每一步决策都会受到目标的驱动，完成度影响情绪和能量。", id: 4, anchor: "foundry" },
      { emoji: "📦", label: "模板库", desc: "预设角色模板（哲学家、创业者、艺术家…），一键创建，无需从零描述。也可以保存自己的模板供复用。", id: 7, anchor: "item-7" },
    ],
  },
  {
    emoji: "🎬", title: "M2 单人剧场", subtitle: "Solo Theater", route: "/theater",
    color: "#f472b6", colorBg: "rgba(244,114,182,0.08)", colorBorder: "rgba(244,114,182,0.25)",
    overview: "把 Agent 投放到场景中，实时观察它的每一步思考、每一次情绪波动——就像看一场思维直播。",
    features: [
      { emoji: "🎬", label: "场景投放", desc: "选择 Agent + 场景（图书馆/教室/实验室/艺术中心/宿舍/樱花大道），Agent 进入后自主感知环境并开始行动。", id: 8 },
      { emoji: "👁️", label: "思维流实时展示", desc: "以时间线形式展示 Agent 的完整思考过程——它看到了什么、想到了什么、为什么做这个决定。", id: 9 },
      { emoji: "⏸️", label: "暂停 / 干预", desc: "运行中随时暂停，注入自定义事件（如「有人敲门」「收到神秘信件」），观察 Agent 如何应对突发情况。", id: 14 },
      { emoji: "🔍", label: "决策回放", desc: "像视频播放器一样回放 Agent 的历史决策。拖动时间轴查看任意时刻的完整上下文和思维状态。", id: 13 },
    ],
  },
  {
    emoji: "🏘️", title: "M3 群体沙盒", subtitle: "Group Sandbox", route: "/sandbox",
    color: "#34d399", colorBg: "rgba(52,211,153,0.08)", colorBorder: "rgba(52,211,153,0.25)",
    overview: "投放多个 Agent 到同一场景——看他们如何对话、竞争、合作、冲突，观察社会关系的自然演化。",
    features: [
      { emoji: "🏘️", label: "群体投放", desc: "选择多个 Agent（最多 8 个）投放到同一场景。Agent 会自动发现彼此，根据人格和情绪产生互动。", id: 15 },
      { emoji: "💬", label: "Agent 间实时对话", desc: "两个 Agent 靠近时自动展开多轮对话。内容由 LLM 实时生成，基于各自的人格、情绪和关系历史。", id: 16 },
      { emoji: "🌐", label: "关系网络图", desc: "可视化 Agent 之间的关系——好友、对手、陌生人。连线粗细表示互动频率，颜色表示关系性质。", id: 20 },
    ],
  },
  {
    emoji: "🥊", title: "M4 竞技场", subtitle: "Arena", route: "/arena",
    color: "#f87171", colorBg: "rgba(248,113,113,0.08)", colorBorder: "rgba(248,113,113,0.25)",
    overview: "让 Agent 正面对决——辩论赛、创业路演、面试问答。LLM 裁判打分，自动生成详细战报。",
    features: [
      { emoji: "🥊", label: "1v1 对抗", desc: "两个 Agent + 一个辩题，三轮交锋后由 LLM 裁判评分并给出胜负理由和金句摘录。", id: 22, anchor: "duel" },
      { emoji: "🏟️", label: "大乱斗", desc: "多个 Agent 在同一主题下自由发言、互评互驳。适合观察群体讨论中的涌现行为和意见领袖。", id: 23, anchor: "battle" },
      { emoji: "📋", label: "战报生成", desc: "每场竞技结束自动生成详细战报——论点对比、逻辑评分、金句摘录、胜负分析。", id: 24, anchor: "report" },
      { emoji: "🎯", label: "盲测模式", desc: "隐藏 Agent 名称，只看发言内容来评判。消除品牌偏见，更客观地评估能力。", id: 25, redirect: "/bench#compare" },
      { emoji: "🔄", label: "复盘对比", desc: "并列展示两个 Agent 的完整发言记录，逐轮对比论点优劣和逻辑漏洞。", id: 26, anchor: "review" },
      { emoji: "🏆", label: "排行榜", desc: "按胜率、平均分、金句数等多维度排名。支持按领域（辩论/路演/面试）分类查看。", id: 27, redirect: "/bench#leaderboard" },
      { emoji: "🧪", label: "A/B 测试", desc: "同一辩题、不同 Agent 配对，批量运行后对比各 Agent 的表现差异。", id: 28, redirect: "/bench#compare" },
    ],
  },
  {
    emoji: "📖", title: "M5 叙事工厂", subtitle: "Narrative Factory", route: "/narratives",
    color: "#fbbf24", colorBg: "rgba(251,191,36,0.08)", colorBorder: "rgba(251,191,36,0.25)",
    overview: "把 Agent 的经历转化为文学作品。7 种体裁——从小说到播客脚本，从日记到微电影大纲。",
    features: [
      { emoji: "📖", label: "小说化叙事", desc: "将 Agent 在场景中的经历转化为第三人称小说。保持 Agent 的口吻和视角一致性，适合生成长篇故事。", id: 29, anchor: "story" },
      { emoji: "✉️", label: "未来的信", desc: "Agent 以第一人称给未来的自己写信——反思过去的选择，表达对未来的期待和恐惧。", id: 30, anchor: "letter" },
      { emoji: "💬", label: "平行对话", desc: "将两个 Agent 的对话转化为剧本格式——包含舞台指示、语气标注和情绪提示。", id: 31, anchor: "parallel" },
      { emoji: "🎙️", label: "播客脚本", desc: "将 Agent 经历转化为播客脚本——主持人串词、嘉宾发言、音效提示，适合录制或分享。", id: 32, anchor: "podcast" },
      { emoji: "🎬", label: "微电影大纲", desc: "提取 Agent 经历中最具戏剧性的时刻，生成微电影分镜大纲——镜头、对白、情绪提示。", id: 33, anchor: "microfilm" },
      { emoji: "📔", label: "自动连载", desc: "设定更新频率后，系统自动将 Agent 的最新经历追加到连载故事中，形成持续更新的长篇。", id: 34, anchor: "serial" },
      { emoji: "🎨", label: "Agent 自画像", desc: "Agent 用第一人称描述自己——性格、喜好、恐惧、梦想。一份文学化的自我剖析。", id: 35, anchor: "selfportrait" },
    ],
  },
  {
    emoji: "📊", title: "M6 控制台", subtitle: "Control Panel", route: "/control",
    color: "#60a5fa", colorBg: "rgba(96,165,250,0.08)", colorBorder: "rgba(96,165,250,0.25)",
    overview: "上帝视角监控全局——仪表盘总览、事件热力图、Agent 搜索、群体动力学报告、决策模式识别。",
    features: [
      { emoji: "📊", label: "多 Agent 仪表盘", desc: "一屏总览所有 Agent 的关键指标——情绪分布、能量水平、活动频率、对话次数和关系状态。", id: 36, anchor: "dashboard" },
      { emoji: "🗺️", label: "事件热力图", desc: "以热力图展示场景中各区域的事件密度——哪里最热闹、哪里最冷清，一目了然。", id: 37, anchor: "heatmap" },
      { emoji: "🔍", label: "Agent 搜索", desc: "按名称、MBTI 类型、情绪状态、活动类型等多条件筛选和搜索 Agent。", id: 38, anchor: "search" },
      { emoji: "📊", label: "群体动力学报告", desc: "分析群体层面的涌现行为——领导力形成、从众效应、信息传播路径、小团体分化。", id: 21, anchor: "dynamics" },
      { emoji: "🧠", label: "决策模式识别", desc: "分析 Agent 的决策模式——理性派还是感性派、冒险家还是保守者。以雷达图展示。", id: 39, anchor: "decisions" },
    ],
  },
  {
    emoji: "💉", title: "M7 干预台", subtitle: "Director Intervention", route: "/intervention",
    color: "#c084fc", colorBg: "rgba(192,132,252,0.08)", colorBorder: "rgba(192,132,252,0.25)",
    overview: "导演模式——向运行中的场景注入事件，观察 Agent 如何应对突发情况，记录干预历史。",
    features: [
      { emoji: "💉", label: "事件注入", desc: "在 Agent 运行中注入自定义事件——「有人敲门」「收到神秘信件」「突然停电」。支持定时和条件触发。", id: 43 },
      { emoji: "📋", label: "干预历史", desc: "完整记录所有干预操作的时间线和效果——Agent 的反应、情绪变化以及后续行为轨迹。", id: 48 },
    ],
  },
  {
    emoji: "📦", title: "M8 档案馆", subtitle: "Archive", route: "/archive",
    color: "#f97316", colorBg: "rgba(249,115,22,0.08)", colorBorder: "rgba(249,115,22,0.25)",
    overview: "沉淀与分享——保存精彩回放和实验模板，解锁成就，一键导出专业研究报告。",
    features: [
      { emoji: "🧪", label: "实验模板", desc: "保存当前实验配置（Agent 组合 + 场景 + 参数）为模板，下次一键复现。支持浏览社区共享模板。", id: 52, anchor: "templates" },
      { emoji: "🎬", label: "精彩回放", desc: "标记并保存 Agent 互动中的精彩片段——有趣的对话、意外的行为、戏剧性的转折时刻。", id: 51, anchor: "highlights" },
      { emoji: "🎖️", label: "成就系统", desc: "Agent 达成特定条件时解锁成就——如「首次对话」「关系突破」「竞技连胜」「百步思考」。", id: 54, anchor: "achievements" },
      { emoji: "📄", label: "研究报告导出", desc: "一键导出为 Markdown/PDF 格式的研究报告——包含数据图表、Agent 档案和关键事件时间线。", id: 55, anchor: "export" },
    ],
  },
  {
    emoji: "👥", title: "M9 Agent Team", subtitle: "Agent Team", route: "/team",
    color: "#2dd4bf", colorBg: "rgba(45,212,191,0.08)", colorBorder: "rgba(45,212,191,0.25)",
    overview: "多个 Agent 组成团队协作——自动任务分解、分工执行、复盘报告。像一个小型 AI 项目组。",
    features: [
      { emoji: "👥", label: "团队组建", desc: "选择 2-5 个 Agent 组成团队。系统根据各 Agent 的性格和能力自动分配角色——领导、分析师、执行者、记录员。" },
      { emoji: "📋", label: "任务分解", desc: "输入一个大目标，LLM 自动分解为可执行的子任务链，并按 Agent 能力智能分配。支持并行和串行模式。" },
      { emoji: "⚡", label: "分工执行", desc: "每个 Agent 独立执行自己的子任务，完成后自动流转到下一阶段，全程实时监控进度。" },
      { emoji: "📊", label: "复盘报告", desc: "任务完成后自动生成复盘报告——各成员贡献度、协作效率、关键决策点和改进建议。" },
      { emoji: "🔄", label: "角色演化", desc: "多次协作后 Agent 的角色会根据实际表现动态调整——优秀的分析者可能被提拔为领导。" },
    ],
  },
  {
    emoji: "🔬", title: "M10 LLM Bench", subtitle: "Benchmark Lab", route: "/bench",
    color: "#818cf8", colorBg: "rgba(129,140,248,0.08)", colorBorder: "rgba(129,140,248,0.25)",
    overview: "科学评测 Agent 能力——批量对战、六维雷达图、排行榜、行为指纹。找到最强的 Agent。",
    features: [
      { emoji: "⚔️", label: "Agent 实时 PK", desc: "两个 Agent 实时对战，你可以观看完整的辩论/对话过程。适合快速对比 Agent 的口才和逻辑能力。", id: 62, redirect: "/duel" },
      { emoji: "📊", label: "批量评测", desc: "选择多个 Agent + 多个测试用例，自动运行全部配对并统计结果。适合大规模能力评估。", id: 63, anchor: "runs" },
      { emoji: "📈", label: "排行榜", desc: "按胜率、逻辑性、创造力、知识广度、表达力、稳定性六大维度排名。支持筛选领域和时间范围。", id: 64, anchor: "leaderboard" },
      { emoji: "🧬", label: "行为指纹", desc: "为每个 Agent 生成独特的行为指纹——统计不同场景下的决策模式，形成可对比的多维雷达图。" },
      { emoji: "📉", label: "劣化追踪", desc: "长期追踪 Agent 表现变化——是否因为记忆积累或 prompt 漂移导致能力下降？及时预警。" },
      { emoji: "📋", label: "自定义测试套件", desc: "创建自己的测试用例库——设定辩题、评分标准、裁判规则。适合针对性评估特定能力。" },
    ],
  },
  {
    emoji: "🎮", title: "M11 游戏化场景", subtitle: "Game Scene", route: "/scene",
    color: "#fb923c", colorBg: "rgba(251,146,60,0.08)", colorBorder: "rgba(251,146,60,0.25)",
    overview: "科大风 2D RPG——Agent 以像素精灵形态在校园地图上自主移动、对话、互动。点击 Agent 即可「耳语」指令。",
    features: [
      { emoji: "🗺️", label: "6 个科大风场景", desc: "图书馆、教室、实验室、艺术中心、宿舍、樱花大道。每张地图有独特的互动道具和氛围。" },
      { emoji: "🚶", label: "自主移动", desc: "Agent 在地图上自主走动——探索场景、靠近感兴趣的物品、接近其他 Agent 发起互动。" },
      { emoji: "💬", label: "Agent 间对话", desc: "两个 Agent 靠近时自动展开多轮对话，内容基于各自人格和当前情绪实时生成。" },
      { emoji: "👂", label: "耳语指令", desc: "点击 Agent 输入文字——Agent 收到你的「耳语」。社交指令（「找小明聊天」）或场景指令（「去弹钢琴」）均可。" },
      { emoji: "💭", label: "主动搭话", desc: "Agent 会主动找你聊天！根据场景和心情发起话题，你可以选择友善/冷淡/挑衅三种态度回应，也可以自定义输入。" },
      { emoji: "😊", label: "情绪系统", desc: "7 种情绪（开心/悲伤/愤怒/兴奋/惊讶/恐惧/平静）实时影响行为——悲伤的 Agent 更少社交，兴奋的 Agent 更活跃。" },
      { emoji: "💾", label: "存档系统", desc: "随时保存场景状态（Agent 位置、情绪、对话历史），下次精确恢复。支持多存档槽位。", id: 57, anchor: "checkpoints" },
      { emoji: "🎬", label: "导演模式", desc: "暂停场景后手动摆放 Agent、调整情绪、注入事件——像一个沙盒导演，完全掌控剧情走向。", id: 58, anchor: "director" },
      { emoji: "🎨", label: "涂鸦 + 绘文字", desc: "向场景投掷绘文字（🎉💖🔥），或在画布上涂鸦——Agent 会看到并对你的涂鸦做出反应。" },
    ],
  },
  {
    emoji: "💻", title: "M12 Worker 工作台", subtitle: "Agent Worker", route: "/worker",
    color: "#06b6d4", colorBg: "rgba(6,182,212,0.08)", colorBorder: "rgba(6,182,212,0.25)",
    overview: "Agent 不止会聊天——它能搜索网页、执行 Python、读写文件、产出报告。像一个真正的 AI 员工。",
    features: [
      { emoji: "⚡", label: "终端工作台", desc: "输入任务描述 → Agent 自主执行——搜索、分析、编码、产出。每一步决策实时展示。支持 5 种角色切换（分析师/写手/审稿人/执行者/通用）。", id: 59 },
      { emoji: "🏆", label: "产出纪念墙", desc: "展示所有已完成任务的产出——报告、图表、代码。像作品集一样浏览和下载，直观看到 Agent 的工作成果。", id: 65, redirect: "/showcase" },
      { emoji: "🔗", label: "图形化管线编辑器", desc: "拖拽式编排多节点工作流——串联 Agent 形成生产线（采集→分析→写作→审查→发布）。支持回边（审查不通过→回到分析重做）和分支（通过→发布，不通过→驳回）。每个节点可选专属角色和 8 种特殊工具。", id: 60, redirect: "/pipeline-editor" },
      { emoji: "📁", label: "文件浏览器", desc: "查看 Agent 工作区中的所有文件——中间产物、历史快照、最终产出。支持下载、预览和删除操作。", id: 61 },
      { emoji: "🔀", label: "决策分叉", desc: "在关键节点让 Agent 生成 2-3 个不同方案，你选择后继续执行。适合需要人工判断的探索性任务。", id: 66, redirect: "/worker" },
      { emoji: "🛠️", label: "14 种工具", desc: "基础 6 种（搜索/Python/读写文件/列文件/安装包）+ 特殊 8 种（思维导图/图表/时间线/摘要/翻译/数据画像/代码审查/大纲）。可精确控制每个任务启用的工具集。" },
      { emoji: "⚙️", label: "参数设置", desc: "全局调整 Agent 行为——思考温度、决策随机性、最大步数、超时、搭话频率。所有调整即时生效并持久化。" },
    ],
  },
];

/* ── 入场动画 hook ── */
function useAnimatedEntry(index: number, delay = 80) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), index * delay);
    return () => clearTimeout(timer);
  }, [index, delay]);
  return { ref, visible };
}

/* ── 子组件 ── */

/** 根据 feature 的 anchor/redirect/id 生成正确的跳转路径 */
function featureLink(mod: ModuleGuide, f: Feature): string | null {
  if (f.redirect) return f.redirect;
  if (f.anchor) return `${mod.route}#${f.anchor}`;
  return mod.route;
}

function ModuleCard({ mod, index }: { mod: ModuleGuide; index: number }) {
  const navigate = useNavigate();
  const { ref, visible } = useAnimatedEntry(index, 60);
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      ref={ref}
      className={`rounded-2xl border overflow-hidden transition-all duration-500 ease-out
        ${visible ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-8 scale-95"}`}
      style={{ background: mod.colorBg, borderColor: mod.colorBorder }}
    >
      {/* 头部 */}
      <div
        className="px-5 py-4 flex items-center gap-4 cursor-pointer hover:brightness-110 transition-all duration-200 group"
        style={{ background: `linear-gradient(135deg, ${mod.colorBg}, transparent)` }}
        onClick={() => navigate(mod.route)}
        role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter") navigate(mod.route); }}
      >
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0 shadow-lg group-hover:scale-110 group-hover:shadow-xl transition-all duration-300"
          style={{ background: `${mod.color}20`, boxShadow: `0 0 20px ${mod.color}20` }}
        >
          {mod.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h2 className="text-base font-mono font-bold text-text-primary">{mod.title}</h2>
            <span className="text-[11px] font-mono text-text-muted/40 tracking-wide">{mod.subtitle}</span>
          </div>
          <p className="text-sm font-mono text-text-secondary/80 leading-relaxed">{mod.overview}</p>
        </div>
        <div className="flex flex-col items-center gap-1 shrink-0">
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full text-text-muted/50" style={{ background: `${mod.color}15` }}>
            {mod.features.length} 项功能
          </span>
          <span className="text-text-muted/20 text-lg group-hover:translate-x-1 transition-transform duration-200">→</span>
        </div>
      </div>

      {/* 功能列表 */}
      <div className="border-t overflow-hidden" style={{ borderColor: mod.colorBorder }}>
        {mod.features.slice(0, expanded ? mod.features.length : 3).map((f, i) => {
          const link = featureLink(mod, f);
          return (
            <div
              key={i}
              className={`px-5 py-3 flex items-start gap-3 transition-all duration-150 ${link ? "cursor-pointer hover:brightness-110" : ""}`}
              style={{ background: i % 2 === 0 ? "transparent" : `${mod.color}08` }}
              onClick={(e) => { e.stopPropagation(); if (link) navigate(link); }}
              role={link ? "button" : undefined}
              tabIndex={link ? 0 : undefined}
              onKeyDown={(e) => { if (e.key === "Enter" && link) navigate(link); }}
            >
              <span className="text-lg shrink-0 mt-0.5">{f.emoji}</span>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-mono font-semibold text-text-primary">{f.label}</span>
                <p className="text-[13px] font-mono text-text-secondary/70 leading-relaxed mt-0.5">{f.desc}</p>
              </div>
              {link && <span className="text-text-muted/20 text-sm shrink-0 mt-1">→</span>}
            </div>
          );
        })}
        {mod.features.length > 3 && (
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            className="w-full px-5 py-2 text-center text-xs font-mono text-text-muted/50 hover:text-text-secondary transition-colors"
            style={{ background: `${mod.color}05` }}
          >
            {expanded ? `收起 ▲` : `展开全部 ${mod.features.length} 项 ▼`}
          </button>
        )}
      </div>
    </div>
  );
}

/* ── 主页面 ── */

export default function GuidePage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-b from-bg-primary via-bg-primary to-bg-secondary/30">
      <div className="max-w-4xl mx-auto px-6 py-10 animate-fade-in">
        {/* Hero */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent-green/5 border border-accent-green/20 mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse" />
            <span className="text-xs font-mono text-accent-green/80">12 个模块 · 59 个功能点</span>
          </div>
          <h1 className="text-3xl font-mono font-bold text-text-primary mb-3">
            📖 使用教程
          </h1>
          <p className="text-base font-mono text-text-secondary/70 max-w-xl mx-auto leading-relaxed">
            从创建第一个 Agent 到让它自主完成复杂任务，
            <br />
            每个模块都有明确的分工和丰富的功能。
          </p>

          {/* 路径引导 */}
          <div className="flex flex-wrap items-center justify-center gap-2.5 mt-6">
            <span
              className="text-xs font-mono px-3 py-1.5 rounded-full cursor-pointer hover:scale-105 transition-transform"
              style={{ background: "rgba(52,211,153,0.12)", color: "#34d399", border: "1px solid rgba(52,211,153,0.25)" }}
              onClick={() => navigate("/agents")}
            >
              🟢 新手: M1 → M2 → M11 → M12
            </span>
            <span className="text-text-muted/30 text-xs">·</span>
            <span
              className="text-xs font-mono px-3 py-1.5 rounded-full cursor-pointer hover:scale-105 transition-transform"
              style={{ background: "rgba(251,146,60,0.12)", color: "#fb923c", border: "1px solid rgba(251,146,60,0.25)" }}
              onClick={() => navigate("/sandbox")}
            >
              🟠 进阶: M3 → M4 → M5 → M6 → M7 → M8
            </span>
            <span className="text-text-muted/30 text-xs">·</span>
            <span
              className="text-xs font-mono px-3 py-1.5 rounded-full cursor-pointer hover:scale-105 transition-transform"
              style={{ background: "rgba(129,140,248,0.12)", color: "#818cf8", border: "1px solid rgba(129,140,248,0.25)" }}
              onClick={() => navigate("/team")}
            >
              🟣 深度: M9 → M10 → M12
            </span>
          </div>
        </div>

        {/* 卡片网格 */}
        <div className="space-y-4">
          {MODULES.map((mod, i) => (
            <ModuleCard key={mod.title} mod={mod} index={i} />
          ))}
        </div>

        {/* 底部 */}
        <div className="mt-12 text-center pb-8">
          <div className="inline-flex items-center gap-2 text-sm font-mono text-text-muted/40">
            <span>←</span>
            <span>侧边栏随时可进入各个模块</span>
            <span>→</span>
          </div>
          <p className="text-xs font-mono text-text-muted/30 mt-2">
            点击卡片头部跳转模块 · 点击功能行跳转到对应锚点 · 每个模块卡片可展开查看全部功能
          </p>
        </div>
      </div>
    </div>
  );
}
