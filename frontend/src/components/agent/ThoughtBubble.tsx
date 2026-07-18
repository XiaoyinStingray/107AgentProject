import type { SSEEvent } from "../../types/events";

interface ThoughtBubbleProps {
  event: SSEEvent;
  /** 同一 Agent 连续消息时不重复显示头像区域 */
  compact?: boolean;
}

/* ================================================================
   群聊气泡——每条 SSE 事件渲染为一个带 Agent 头像 + 阶段标签
   的消息卡片。不同事件类型有不同配色。

   布局规则：
   - thought_stream / agent_action → 靠左（Agent 自己在思考/行动）
   - agent_message → 靠左（发言方视角）
   - world_event → 居中（世界级事件）
   - tick_boundary → 全宽分隔线
   ================================================================ */

export default function ThoughtBubble({ event, compact = false }: ThoughtBubbleProps) {
  // Tick 边界：分隔线
  if (event.type === "tick_boundary") {
    return (
      <div className="flex items-center gap-2 my-3">
        <div className="flex-1 h-px bg-border" />
        <span className="text-sm font-mono text-text-secondary/60 shrink-0">
          Tick #{event.tick}
        </span>
        <div className="flex-1 h-px bg-border" />
      </div>
    );
  }

  // 世界事件：居中横幅
  if (event.type === "world_event") {
    return (
      <div className="flex justify-center my-2">
        <div className="
          bg-accent-orange/5 border border-accent-orange/20 rounded-lg
          px-4 py-2 max-w-md text-center
        ">
          <span className="text-sm font-mono text-accent-orange/70 mr-1">
            🌐 事件
          </span>
          <span className="text-sm text-text-primary">
            {event.description ?? event.message ?? ""}
          </span>
        </div>
      </div>
    );
  }

  // 普通消息气泡
  const config = BUBBLE_CONFIG[event.type] ?? BUBBLE_CONFIG.fallback;
  const agentName = event.agent_name ?? event.agent_id ?? "Unknown";
  const bodyText = event.content ?? event.message ?? event.description ?? "";

  return (
    <div className={`${compact ? "mt-0.5" : "mt-3"} animate-slide-in`}>
      {/* Agent 头部（compact 模式下隐藏） */}
      {!compact && (
        <div className="flex items-center gap-1.5 mb-1">
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: config.dotColor }}
          />
          <span className="text-sm font-mono text-text-primary">{agentName}</span>
          <span className="text-sm font-mono text-text-secondary/70">
            · {config.icon} {config.label}
          </span>
        </div>
      )}

      {/* 消息体 */}
      <div
        className={`
          rounded-lg px-3 py-2 max-w-lg
          border text-sm leading-relaxed
          ${config.bg} font-mono text-text-primary
        `.trim()}
      >
        {/* 行动类消息展示 action + target */}
        {event.type === "agent_action" && (
          <span className="text-accent-green/70 mr-1">
            → {event.action ?? ""}
            {event.target ? `(${event.target})` : ""}
            {event.message ? `: ` : ""}
          </span>
        )}
        {bodyText}
        {/* subtext 灰色小字显示在下方 */}
        {event.subtext && (
          <p className="text-text-secondary/80 text-sm mt-1 italic leading-snug">
            {event.subtext}
          </p>
        )}
      </div>
    </div>
  );
}

const BUBBLE_CONFIG: Record<
  string,
  { icon: string; label: string; bg: string; dotColor: string }
> = {
  thought_stream: {
    icon: "💭",
    label: "思考",
    bg: "bg-accent-blue/15 border-accent-blue/30",
    dotColor: "#4488ff",
  },
  agent_message: {
    icon: "💬",
    label: "对话",
    bg: "bg-accent-purple/15 border-accent-purple/30",
    dotColor: "#aa44ff",
  },
  agent_action: {
    icon: "⚡",
    label: "行动",
    bg: "bg-accent-green/15 border-accent-green/30",
    dotColor: "#00ff88",
  },
  fallback: {
    icon: "📋",
    label: "事件",
    bg: "bg-bg-card border-border",
    dotColor: "#8888aa",
  },
};
