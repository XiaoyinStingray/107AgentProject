/**
 * ProactiveChat — Step 99/99d: 主动搭话对话弹窗。
 *
 * Agent 发起→用户选择回复→Agent 回应→2-3 轮收尾。
 * 支持 LLM 生成的情绪化选项 + 自定义输入。
 */

import { useState, useCallback, useRef } from "react";
import type { AgentSpriteData } from "../../game/sprites/AgentSprite";

// ── 类型 ──

export interface ChatOption {
  id: "A" | "B" | "C";
  label: string;
  tone: "友善" | "冷淡" | "挑衅";
  userText: string;
  agentReaction: string;
  agentEmotion: string;
}

interface ChatRound {
  speaker: "agent" | "user";
  text: string;
  optionUsed?: ChatOption["id"] | "custom";
}

interface Props {
  agent: AgentSpriteData;
  topic: string;
  options: ChatOption[];
  onEnd: (history: ChatRound[]) => void;
  /** LLM 生成 Agent 对自定义输入的反应 */
  onCustomReply?: (userText: string) => Promise<{ agentReaction: string; agentEmotion: string }>;
}

// ── 组件 ──

export default function ProactiveChat({
  agent, topic, options, onEnd, onCustomReply,
}: Props) {
  const [rounds, setRounds] = useState<ChatRound[]>([
    { speaker: "agent", text: topic },
  ]);
  const [currentRound, setCurrentRound] = useState(0);
  const [selectedOption, setSelectedOption] = useState<ChatOption | null>(null);
  const [agentResponding, setAgentResponding] = useState(false);
  const roundsRef = useRef<ChatRound[]>([{ speaker: "agent", text: topic }]);

  // 自定义输入
  const [customMode, setCustomMode] = useState(false);
  const [customText, setCustomText] = useState("");
  const customInputRef = useRef<HTMLInputElement>(null);

  const maxRounds = 3;

  // 用户选择了一个选项
  const handleSelect = useCallback((option: ChatOption) => {
    setSelectedOption(option);
    const withUser: ChatRound[] = [
      ...roundsRef.current,
      { speaker: "user" as const, text: option.userText, optionUsed: option.id },
    ];
    roundsRef.current = withUser;
    setRounds(withUser);

    setAgentResponding(true);
    setTimeout(() => {
      const withAgent: ChatRound[] = [
        ...roundsRef.current,
        { speaker: "agent" as const, text: option.agentReaction },
      ];
      roundsRef.current = withAgent;
      setRounds(withAgent);
      setAgentResponding(false);
      setSelectedOption(null);

      const nextRound = currentRound + 1;
      setCurrentRound(nextRound);

      // 达到最大轮数——不自动关闭，等用户手动退出
    }, 800 + Math.random() * 700);
  }, [currentRound]);

  // 自定义输入提交
  const handleCustomSubmit = useCallback(async () => {
    const text = customText.trim();
    if (!text || text.length > 80) return;

    const withUser: ChatRound[] = [
      ...roundsRef.current,
      { speaker: "user" as const, text, optionUsed: "custom" as const },
    ];
    roundsRef.current = withUser;
    setRounds(withUser);
    setCustomMode(false);
    setCustomText("");

    setAgentResponding(true);
    let reaction = "嗯…好的。";
    let emotion = "neutral";

    if (onCustomReply) {
      try {
        const res = await onCustomReply(text);
        reaction = res.agentReaction;
        emotion = res.agentEmotion;
      } catch {
        // LLM 失败，用默认回复
      }
    }

    setTimeout(() => {
      const withAgent: ChatRound[] = [
        ...roundsRef.current,
        { speaker: "agent" as const, text: reaction },
      ];
      roundsRef.current = withAgent;
      setRounds(withAgent);
      setAgentResponding(false);

      const nextRound = currentRound + 1;
      setCurrentRound(nextRound);

      // 达到最大轮数——不自动关闭，等用户手动退出
    }, 800 + Math.random() * 700);
  }, [currentRound, customText, onCustomReply]);

  // 主动结束
  const handleEnd = useCallback(() => {
    onEnd(rounds);
  }, [rounds, onEnd]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="w-[420px] max-w-[95vw] rounded-2xl border border-accent-orange/30 bg-bg-primary shadow-2xl overflow-hidden">
        {/* 头部 */}
        <div className="px-5 py-3 border-b border-border flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-xl shrink-0"
            style={{ backgroundColor: agent.color + "22", border: `2px solid ${agent.color}` }}
          >
            {agent.emoji}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-mono text-text-primary font-semibold truncate">
              {agent.name}
            </p>
            <p className="text-[10px] font-mono text-text-secondary">
              第 {currentRound + 1}/{maxRounds} 轮
            </p>
          </div>
          <button
            type="button"
            onClick={handleEnd}
            className="text-text-secondary hover:text-text-primary transition-colors text-lg"
            title="结束对话"
          >
            ✕
          </button>
        </div>

        {/* 对话区 */}
        <div className="px-5 py-4 space-y-3 max-h-[300px] overflow-y-auto">
          {rounds.map((round, i) => (
            <div
              key={i}
              className={`flex gap-2 ${round.speaker === "user" ? "justify-end" : "justify-start"}`}
            >
              {round.speaker === "agent" && (
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 mt-0.5"
                  style={{ backgroundColor: agent.color + "22" }}
                >
                  {agent.emoji}
                </div>
              )}
              <div
                className={`max-w-[75%] px-3 py-2 rounded-xl text-sm font-mono ${
                  round.speaker === "agent"
                    ? "bg-bg-secondary text-text-primary rounded-tl-sm"
                    : "bg-accent-orange/15 text-text-primary rounded-tr-sm border border-accent-orange/20"
                }`}
              >
                <p className="text-xs leading-relaxed">{round.text}</p>
                {round.speaker === "user" && round.optionUsed && (
                  <p className="text-[10px] text-text-secondary mt-1">
                    {round.optionUsed === "A" ? "😊 友善" :
                     round.optionUsed === "B" ? "😐 冷淡" :
                     round.optionUsed === "C" ? "😤 挑衅" : "✏️ 自定义"}
                  </p>
                )}
              </div>
              {round.speaker === "user" && (
                <div className="w-8 h-8 rounded-full bg-bg-secondary flex items-center justify-center text-sm shrink-0 mt-0.5">
                  👤
                </div>
              )}
            </div>
          ))}

          {agentResponding && (
            <div className="flex gap-2 justify-start">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0"
                style={{ backgroundColor: agent.color + "22" }}
              >
                {agent.emoji}
              </div>
              <div className="px-3 py-2 rounded-xl bg-bg-secondary rounded-tl-sm">
                <span className="text-xs text-text-secondary font-mono animate-pulse">
                  正在输入...
                </span>
              </div>
            </div>
          )}
        </div>

        {/* 选项区 */}
        {currentRound < maxRounds && !selectedOption && !agentResponding && !customMode && (
          <div className="px-5 py-3 border-t border-border space-y-1.5">
            <p className="text-[10px] font-mono text-text-secondary mb-1">选择你的回复：</p>
            {options.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleSelect(opt)}
                className="w-full text-left px-3 py-2 rounded-lg border border-border bg-bg-secondary/50 hover:border-accent-orange/30 hover:bg-accent-orange/5 transition-colors group"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg-primary text-text-secondary group-hover:text-accent-orange transition-colors">
                    {opt.id === "A" ? "😊" : opt.id === "B" ? "😐" : "😤"} {opt.tone}
                  </span>
                  <span className="text-xs font-mono text-text-primary">
                    {opt.label}
                  </span>
                </div>
              </button>
            ))}
            <button
              type="button"
              onClick={() => { setCustomMode(true); setTimeout(() => customInputRef.current?.focus(), 50); }}
              className="w-full text-left px-3 py-2 rounded-lg border border-dashed border-border/60 bg-bg-secondary/30 hover:border-accent-green/40 hover:bg-accent-green/5 transition-colors group"
            >
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg-primary text-text-secondary group-hover:text-accent-green transition-colors">
                  ✏️ 自定义
                </span>
                <span className="text-xs font-mono text-text-secondary group-hover:text-text-primary">
                  输入你想说的话…
                </span>
              </div>
            </button>
          </div>
        )}

        {/* 自定义输入框 */}
        {customMode && !agentResponding && (
          <div className="px-5 py-3 border-t border-border space-y-2">
            <p className="text-[10px] font-mono text-text-secondary">
              ✏️ 输入你想对 {agent.name} 说的话（最多 80 字）：
            </p>
            <div className="flex gap-2">
              <input
                ref={customInputRef}
                type="text"
                value={customText}
                onChange={(e) => setCustomText(e.target.value.slice(0, 80))}
                onKeyDown={(e) => { if (e.key === "Enter") handleCustomSubmit(); }}
                placeholder="输入你的回复…"
                className="flex-1 px-3 py-2 rounded-lg border border-border bg-bg-secondary text-sm font-mono text-text-primary placeholder:text-text-secondary/40 outline-none focus:border-accent-green/40"
                maxLength={80}
              />
              <button
                type="button"
                onClick={handleCustomSubmit}
                disabled={!customText.trim()}
                className="px-4 py-2 rounded-lg border border-accent-green/30 bg-accent-green/10 text-accent-green text-xs font-mono hover:bg-accent-green/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
              >
                发送
              </button>
            </div>
            <button
              type="button"
              onClick={() => { setCustomMode(false); setCustomText(""); }}
              className="text-[10px] font-mono text-text-secondary hover:text-text-primary transition-colors"
            >
              返回选项
            </button>
          </div>
        )}

        {/* 对话结束 */}
        {currentRound >= maxRounds && !agentResponding && (
          <div className="px-5 py-3 border-t border-border space-y-2">
            <p className="text-xs text-text-secondary font-mono text-center">
              {agent.name} 结束了对话
            </p>
            <button
              type="button"
              onClick={handleEnd}
              className="w-full py-2 rounded-lg border border-accent-orange/40 bg-accent-orange/10 text-accent-orange text-sm font-mono hover:bg-accent-orange/20 transition-colors"
            >
              关闭对话
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
