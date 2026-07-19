import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import Card from "../components/shared/Card";
import Badge from "../components/shared/Badge";
import StatusDot from "../components/shared/StatusDot";
import { MOCK_AGENTS } from "../mocks/agents";
import { useAgentStore } from "../stores/useAgentStore";
import {
  NARRATIVE_STYLES,
  DEFAULT_LETTER_TARGET,
  DEFAULT_PODCAST_TARGET,
  getMockNarrative,
  pickAgentName,
} from "../mocks/narratives";
import type { NarrativeStyle, NarrativeResult } from "../mocks/narratives";
import type { AgentResponse } from "../types/agent";

/* ================================================================
   Step 23 — 叙事工厂页面 (M5)
   事件日志 → 自然语言叙事（小说/日记/信/播客）。
   前端 Mock 模式——后端 /api/narratives/* 尚未实现。
   ================================================================ */

type NarrativePhase = "setup" | "generating" | "result";

const GENERATING_DELAY = 2000; // Mock 生成延迟 ms

export default function NarrativeFactory() {
  const agents = useAvailableAgents();

  // === setup 状态 ===
  const [agentId, setAgentId] = useState<string>("");
  const [styleKey, setStyleKey] = useState<NarrativeStyle>("story");
  const [target, setTarget] = useState<string>("");
  const [phase, setPhase] = useState<NarrativePhase>("setup");
  const [result, setResult] = useState<NarrativeResult | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedAgent = agents.find((a) => a.id === agentId);
  const selectedStyle = NARRATIVE_STYLES.find(
    (s) => s.key === styleKey && s.available,
  );
  const effectiveTarget = target.trim() || getDefaultTarget(styleKey);
  const canGenerate = !!agentId && !!selectedStyle;

  // 清理 timer
  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handleGenerate = useCallback(() => {
    if (!canGenerate || !selectedStyle) return;
    clearTimer();
    setPhase("generating");
    timerRef.current = setTimeout(() => {
      const mock = getMockNarrative(agentId, styleKey);
      // 注入用户填写的 target 到 letter/podcast 的标题/内容（简化处理：仅作为元信息）
      setResult({
        ...mock,
        agent_name: pickAgentName(agents, agentId),
      });
      setPhase("result");
    }, GENERATING_DELAY);
  }, [canGenerate, selectedStyle, agentId, styleKey, agents, clearTimer]);

  const handleReset = useCallback(() => {
    clearTimer();
    setResult(null);
    setPhase("setup");
  }, [clearTimer]);

  const handleRegenerate = useCallback(() => {
    // 重新生成——重新走 mock 流程（结果内容不变，时间戳刷新）
    if (!canGenerate) return;
    clearTimer();
    setResult(null);
    setPhase("generating");
    timerRef.current = setTimeout(() => {
      const mock = getMockNarrative(agentId, styleKey);
      setResult({
        ...mock,
        agent_name: pickAgentName(agents, agentId),
      });
      setPhase("result");
    }, GENERATING_DELAY);
  }, [canGenerate, agentId, styleKey, agents, clearTimer]);

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

  // 组件卸载时清理
  useEffect(() => clearTimer, [clearTimer]);

  // === generating ===
  if (phase === "generating") {
    return (
      <div className="h-full flex items-center justify-center animate-fade-in">
        <div className="text-center">
          <div className="text-5xl mb-4 animate-pulse">
            {selectedStyle?.emoji ?? "✨"}
          </div>
          <h2 className="text-lg font-mono text-text-primary mb-2">
            正在生成{selectedStyle?.label}…
          </h2>
          <p className="text-sm text-text-secondary font-mono">
            {selectedAgent?.name} · {effectiveTarget || "默认主题"}
          </p>
          <div className="mt-6 flex justify-center gap-1">
            <span className="w-2 h-2 rounded-full bg-accent-green/60 animate-pulse" />
            <span className="w-2 h-2 rounded-full bg-accent-green/40 animate-pulse [animation-delay:200ms]" />
            <span className="w-2 h-2 rounded-full bg-accent-green/20 animate-pulse [animation-delay:400ms]" />
          </div>
        </div>
      </div>
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
              生成于 {formatTime(result.generated_at)}
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
      {(selectedAgent || selectedStyle) && (
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

      {/* 生成按钮 */}
      <div className="flex justify-center">
        <button
          type="button"
          disabled={!canGenerate}
          onClick={handleGenerate}
          className={`
            px-8 py-3 rounded-lg font-mono text-sm transition-all
            ${canGenerate
              ? "bg-accent-green text-bg-primary hover:bg-accent-green/90 cursor-pointer"
              : "bg-bg-secondary border border-border text-text-secondary/40 cursor-not-allowed"
            }
          `.trim()}
        >
          ✨ 生成叙事
        </button>
      </div>
    </div>
  );
}

/* ================================================================
   子组件 & 工具函数
   ================================================================ */

/** Agent 来源——Zustand store + MOCK_AGENTS 合并去重（与 Arena/SoloTheater 同模式） */
function useAvailableAgents(): AgentResponse[] {
  const createdAgents = useAgentStore((s) => s.agents);
  return useMemo(() => {
    const byId = new Map<string, AgentResponse>();
    [...MOCK_AGENTS, ...createdAgents].forEach((a) => byId.set(a.id, a));
    return [...byId.values()];
  }, [createdAgents]);
}

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

/** ISO 时间 → 可读格式 */
function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
  } catch {
    return iso;
  }
}
