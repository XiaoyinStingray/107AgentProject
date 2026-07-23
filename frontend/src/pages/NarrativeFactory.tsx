import { useState, useCallback } from "react";
import Card from "../components/shared/Card";
import Badge from "../components/shared/Badge";
import StatusDot from "../components/shared/StatusDot";
import LoadingSpinner from "../components/shared/LoadingSpinner";
import { useAgents } from "../api/agents";
import { useWorlds } from "../api/worlds";
import {
  useGenerateStory,
  useGenerateDiary,
  useGenerateLetter,
  useGeneratePodcast,
} from "../api/narratives";
import type { NarrativeGenRequest } from "../api/narratives";
import {
  NARRATIVE_STYLES,
  DEFAULT_LETTER_TARGET,
  DEFAULT_PODCAST_TARGET,
} from "../mocks/narratives";
import type { NarrativeStyle, NarrativeResult } from "../mocks/narratives";
import { formatDateTime } from "../utils/formatDate";

/* ================================================================
   Step 34a — 叙事工厂页面 (M5)
   事件日志 → 自然语言叙事（小说/日记/信/播客）。
   story/diary/letter 走真实后端 API，podcast 保留 Mock。
   ================================================================ */

type NarrativePhase = "setup" | "generating" | "result";

export default function NarrativeFactory() {
  const { data: agents = [] } = useAgents();
  const { data: worlds = [] } = useWorlds();

  // === setup 状态 ===
  const [agentId, setAgentId] = useState<string>("");
  const [worldId, setWorldId] = useState<string>("");
  const [styleKey, setStyleKey] = useState<NarrativeStyle>("story");
  const [target, setTarget] = useState<string>("");
  const [phase, setPhase] = useState<NarrativePhase>("setup");
  const [result, setResult] = useState<NarrativeResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 叙事 mutations
  const generateStory = useGenerateStory();
  const generateDiary = useGenerateDiary();
  const generateLetter = useGenerateLetter();
  const generatePodcast = useGeneratePodcast();
  const isPending =
    generateStory.isPending ||
    generateDiary.isPending ||
    generateLetter.isPending ||
    generatePodcast.isPending;

  const selectedAgent = agents.find((a) => a.id === agentId);
  const selectedStyle = NARRATIVE_STYLES.find(
    (s) => s.key === styleKey && s.available,
  );
  const effectiveTarget = target.trim() || getDefaultTarget(styleKey);
  const canGenerate = !!agentId && !!worldId && !!selectedStyle;

  /** 构建通用叙事请求 */
  const buildRequest = useCallback((): NarrativeGenRequest => ({
    agent_id: agentId,
    world_id: worldId,
    target: styleKey === "letter" && effectiveTarget ? effectiveTarget : null,
  }), [agentId, worldId, styleKey, effectiveTarget]);

  const handleGenerate = useCallback(async () => {
    if (!canGenerate || !selectedStyle) return;
    setErrorMsg(null);
    setPhase("generating");

    try {
      const req = buildRequest();
      let apiResult;
      if (styleKey === "story") apiResult = await generateStory.mutateAsync(req);
      else if (styleKey === "diary") apiResult = await generateDiary.mutateAsync(req);
      else if (styleKey === "letter") apiResult = await generateLetter.mutateAsync(req);
      else apiResult = await generatePodcast.mutateAsync(req);

      setResult({
        title: apiResult.title,
        content: apiResult.content,
        style: apiResult.style as NarrativeStyle,
        agent_id: apiResult.agent_id,
        agent_name: selectedAgent?.name ?? apiResult.agent_id,
        generated_at: apiResult.generated_at,
        word_count: apiResult.content.length,
      });
      setPhase("result");
    } catch (cause) {
      setErrorMsg(cause instanceof Error ? cause.message : "叙事生成失败");
      setPhase("setup");
    }
  }, [canGenerate, selectedStyle, styleKey, agentId, buildRequest,
      generateStory, generateDiary, generateLetter, generatePodcast]);

  const handleReset = useCallback(() => {
    setResult(null);
    setErrorMsg(null);
    setPhase("setup");
  }, []);

  const handleRegenerate = useCallback(() => {
    setResult(null);
    setErrorMsg(null);
    handleGenerate();
  }, [handleGenerate]);

  // 复制到剪贴板
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async () => {
    if (!result) return;
    const text = `${result.title}\n\n${result.content}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 剪贴板 API 不可用时静默失败
      setCopied(false);
    }
  }, [result]);

  // 下载为 .md
  const handleDownload = useCallback(() => {
    if (!result) return;
    const text = `# ${result.title}\n\n> 风格：${result.style} | Agent：${result.agent_name} | 生成于 ${result.generated_at}\n\n${result.content}\n`;
    const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${result.agent_name}-${result.style}-${result.generated_at.slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [result]);


  // === generating ===
  if (phase === "generating") {
    return (
      <LoadingSpinner
        icon={selectedStyle?.emoji ?? "✨"}
        title={`正在生成${selectedStyle?.label}…`}
        detail={`${selectedAgent?.name} · ${effectiveTarget || "默认主题"}`}
        fullscreen
      />
    );
  }

  // === result ===
  if (phase === "result" && result) {
    return (
      <div className="h-full overflow-y-auto p-6 animate-fade-in">
        {/* 顶部操作栏 */}
        <div className="flex items-center justify-between mb-6">
          <button
            type="button"
            onClick={handleReset}
            className="text-sm font-mono text-accent-blue hover:text-accent-blue/80 transition-colors"
          >
            ← 返回配置
          </button>
          <div className="flex items-center gap-3 text-xs font-mono text-text-secondary">
            <span>
              生成于 {formatDateTime(result.generated_at)}
            </span>
            <span>·</span>
            <span>{result.word_count} 字</span>
          </div>
        </div>

        {/* 叙事正文 */}
        <Card className="mb-6">
          {/* 标题区 */}
          <div className="flex items-start gap-3 mb-4 pb-4 border-b border-border">
            <span className="text-2xl select-none">
              {selectedStyle?.emoji}
            </span>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-mono text-text-primary mb-1 break-all">
                {result.title}
              </h1>
              <div className="flex items-center gap-2 text-xs font-mono text-text-secondary">
                <StatusDot status="active" label="" />
                <span className="text-accent-green">{result.agent_name}</span>
                <span className="text-text-secondary/50">·</span>
                <span>{styleLabel(result.style)}</span>
                {effectiveTarget && (
                  <>
                    <span className="text-text-secondary/50">·</span>
                    <span className="text-text-secondary/70">
                      {effectiveTarget}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* 正文——保留换行 */}
          <div className="prose prose-invert max-w-none">
            <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-text-primary bg-transparent border-0 p-0 m-0">
              {result.content}
            </pre>
          </div>
        </Card>

        {/* 底部操作 */}
        <div className="flex justify-center gap-3">
          <button
            type="button"
            onClick={handleRegenerate}
            className="px-4 py-2 rounded-lg text-sm font-mono bg-accent-green/10 border border-accent-green/30 text-accent-green hover:bg-accent-green/20 transition-colors"
          >
            🔄 重新生成
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="px-4 py-2 rounded-lg text-sm font-mono bg-bg-card border border-border text-text-secondary hover:text-text-primary hover:border-text-secondary transition-colors"
          >
            {copied ? "✓ 已复制" : "📋 复制"}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="px-4 py-2 rounded-lg text-sm font-mono bg-bg-card border border-border text-text-secondary hover:text-text-primary hover:border-text-secondary transition-colors"
          >
            📥 下载 .md
          </button>
        </div>
      </div>
    );
  }

  // === setup ===
  return (
    <div className="h-full overflow-y-auto p-6 animate-fade-in">
      <h1 className="text-2xl font-mono text-accent-green mb-1">
        M5 叙事工厂
      </h1>
      <p className="text-sm text-text-secondary font-mono mb-6">
        选择 Agent 和叙事风格，把模拟经历转化为小说、日记、信件或播客
      </p>

      {/* 风格选择 */}
      <div className="mb-6">
        <h2 className="text-sm font-mono text-text-primary mb-3">
          📝 叙事风格
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {NARRATIVE_STYLES.map((s) => {
            // P3 占位项复用 story key 但 available=false，因此 available + key 唯一确定选中项
            const isActive = s.available && s.key === styleKey;
            return (
              <button
                key={`${s.label}-${s.priority}`}
                type="button"
                disabled={!s.available}
                onClick={() => s.available && setStyleKey(s.key)}
                className={`
                  text-left p-3 rounded-lg border transition-colors
                  ${!s.available
                    ? "border-border bg-bg-secondary/40 text-text-secondary/40 cursor-not-allowed"
                    : isActive
                      ? "border-accent-green/60 bg-accent-green/5 ring-1 ring-accent-green/20"
                      : "border-border bg-bg-card hover:border-text-secondary/40"
                  }
                `.trim()}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-lg">{s.emoji}</span>
                  <Badge label={s.priority} variant={s.priority} />
                </div>
                <p className="text-sm font-mono text-text-primary">
                  {s.label}
                </p>
                <p className="text-xs text-text-secondary mt-1 line-clamp-2">
                  {s.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Agent 选择 */}
      <div className="mb-6">
        <h2 className="text-sm font-mono text-text-primary mb-3">
          🎭 选择 Agent
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {agents.length === 0 ? (
            <p className="text-xs font-mono text-text-secondary/60 text-center py-6 col-span-3">
              暂无可选 Agent
            </p>
          ) : (
            agents.map((agent) => {
              const isSelected = agent.id === agentId;
              return (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => setAgentId(agent.id)}
                  className={`
                    text-left p-3 rounded-lg border transition-colors
                    ${isSelected
                      ? "border-accent-green/60 bg-accent-green/5 ring-1 ring-accent-green/20"
                      : "border-border bg-bg-card hover:border-text-secondary/40"
                    }
                  `.trim()}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-8 h-8 rounded-full bg-accent-green/10 border border-accent-green/30 flex items-center justify-center text-sm select-none">
                      {agent.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-mono text-sm text-text-primary">
                        {agent.name}
                      </span>
                      <span className="ml-2 text-xs font-mono text-accent-purple/70">
                        {agent.persona.mbti}
                      </span>
                    </div>
                    {isSelected && (
                      <span className="text-xs text-accent-green font-mono">
                        ✓
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-secondary line-clamp-2 pl-10">
                    {agent.persona.narrative}
                  </p>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* World 选择（叙事需要从 World 历史事件中提取素材） */}
      <div className="mb-6">
        <h2 className="text-sm font-mono text-text-primary mb-3">
          🌍 选择实验 World
        </h2>
        {worlds.length === 0 ? (
          <Card>
            <p className="text-xs font-mono text-text-secondary/60 text-center py-4">
              暂无可用的 World——请先在单人剧场或群体沙盒中创建并运行一个实验
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {worlds.map((world) => {
              const isSelected = world.id === worldId;
              return (
                <button
                  key={world.id}
                  type="button"
                  onClick={() => setWorldId(world.id)}
                  className={`
                    text-left p-3 rounded-lg border transition-colors
                    ${isSelected
                      ? "border-accent-green/60 bg-accent-green/5 ring-1 ring-accent-green/20"
                      : "border-border bg-bg-card hover:border-text-secondary/40"
                    }
                  `.trim()}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm select-none">
                      {world.status === "running" ? "🟢" : "⏹️"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="font-mono text-sm text-text-primary">
                        {world.name}
                      </span>
                      <span className="ml-2 text-xs font-mono text-text-secondary/60">
                        Tick {world.current_tick}
                      </span>
                    </div>
                    {isSelected && (
                      <span className="text-xs text-accent-green font-mono">
                        ✓
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-secondary mt-1 pl-7">
                    {world.scenario.name} · {world.agent_ids.length} Agent
                    {world.agent_ids.length > 0 ? "s" : ""}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 附加参数（letter/podcast） */}
      {selectedStyle?.needsTarget && (
        <div className="mb-6 animate-fade-in">
          <h2 className="text-sm font-mono text-text-primary mb-3">
            ✉️ {selectedStyle.targetLabel}
          </h2>
          <Card>
            <input
              type="text"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder={selectedStyle.targetPlaceholder}
              className="w-full bg-bg-secondary border border-border rounded px-3 py-2 text-sm font-mono text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:border-accent-green transition-colors"
            />
            <p className="text-xs text-text-secondary/60 font-mono mt-2">
              💡 留空则使用默认值：
              {styleKey === "letter" ? DEFAULT_LETTER_TARGET : DEFAULT_PODCAST_TARGET}
            </p>
          </Card>
        </div>
      )}

      {/* 当前选择摘要 */}
      {(selectedAgent || selectedStyle || worldId) && (
        <Card className="mb-6">
          <h3 className="text-xs font-mono text-text-secondary mb-2">
            当前选择
          </h3>
          <div className="flex flex-wrap items-center gap-3 text-sm font-mono">
            <span className="text-text-secondary">Agent:</span>
            <span className="text-accent-green">
              {selectedAgent?.name ?? "未选择"}
            </span>
            <span className="text-text-secondary/40">|</span>
            <span className="text-text-secondary">World:</span>
            <span className="text-accent-blue">
              {worlds.find((w) => w.id === worldId)?.name ?? "未选择"}
            </span>
            <span className="text-text-secondary/40">|</span>
            <span className="text-text-secondary">风格:</span>
            <span className="text-accent-blue">
              {selectedStyle?.label ?? "未选择"}
            </span>
            {selectedStyle?.needsTarget && effectiveTarget && (
              <>
                <span className="text-text-secondary/40">|</span>
                <span className="text-text-secondary">
                  {selectedStyle.targetLabel}:
                </span>
                <span className="text-accent-purple">{effectiveTarget}</span>
              </>
            )}
          </div>
        </Card>
      )}

      {/* 错误提示 */}
      {errorMsg && (
        <p role="alert" className="text-sm text-accent-red font-mono mb-4 text-center">
          {errorMsg}
        </p>
      )}

      {/* 生成按钮 */}
      <div className="flex justify-center">
        <button
          type="button"
          disabled={!canGenerate || isPending}
          onClick={handleGenerate}
          className={`
            px-8 py-3 rounded-lg font-mono text-sm transition-all
            ${canGenerate && !isPending
              ? "bg-accent-green text-bg-primary hover:bg-accent-green/90 cursor-pointer"
              : "bg-bg-secondary border border-border text-text-secondary/40 cursor-not-allowed"
            }
          `.trim()}
        >
          {isPending ? "生成中…" : "✨ 生成叙事"}
        </button>
      </div>
    </div>
  );
}

/* ================================================================
   子组件 & 工具函数
   ================================================================ */

/** 风格 key → 中文标签（用于 result 阶段展示） */
function styleLabel(style: NarrativeStyle): string {
  const map: Record<NarrativeStyle, string> = {
    story: "小说",
    diary: "日记",
    letter: "信件",
    podcast: "播客",
  };
  return map[style] ?? style;
}

/** 风格 → 默认 target（letter/podcast 用） */
function getDefaultTarget(style: NarrativeStyle): string {
  if (style === "letter") return DEFAULT_LETTER_TARGET;
  if (style === "podcast") return DEFAULT_PODCAST_TARGET;
  return "";
}

