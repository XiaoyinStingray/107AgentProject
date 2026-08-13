import type { SSEEvent } from "../../types/events";

interface ThoughtBubbleProps {
  event: SSEEvent;
  /** 同一 Agent 连续消息时不重复显示头像区域 */
  compact?: boolean;
  /** 点击回调——用于决策回放展开 */
  onClick?: (event: SSEEvent) => void;
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

export default function ThoughtBubble({ event, compact = false, onClick }: ThoughtBubbleProps) {
  // 基础设施事件：不渲染
  if (event.type === "connected" || event.type === "paused" || event.type === "error") {
    return null;
  }

  // 会话结束
  if (event.type === "session_end") {
    return (
      <div className="flex items-center gap-3 my-4">
        <div className="flex-1 h-px bg-accent-green/30" />
        <span className="text-sm font-mono text-accent-green/70 shrink-0">
          独白结束 · 共 {event.tick} 个片段
        </span>
        <div className="flex-1 h-px bg-accent-green/30" />
      </div>
    );
  }

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
  const isInjected = !!event.data?.injected;
  // 使用 || 而非 ?? ——空字符串也应回退到默认值
  const agentName = event.agent_name || event.agent_id || "Unknown";
  const targetNames: string[] = isInjected ? ((event.data?.target_names as string[]) ?? []) : [];
  const bodyText = resolveBodyText(event);

  // 无内容的事件不渲染空泡
  if (!bodyText) {
    return null;
  }

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
          {isInjected && targetNames.length > 0 && (
            <span className="text-sm font-mono text-accent-orange/80">
              → {targetNames.join(", ")}
            </span>
          )}
        </div>
      )}

      {/* 消息体 */}
      <div
        onClick={() => onClick?.(event)}
        className={`
          rounded-lg px-3 py-2 max-w-lg
          border text-sm leading-relaxed
          ${config.bg} font-mono text-text-primary
          ${onClick ? "cursor-pointer hover:brightness-110 transition-all" : ""}
        `.trim()}
      >
        {/* 行动类消息展示 action + target */}
        {event.type === "agent_action" && (
          <span className="text-accent-green/70 mr-1">
            → {event.action ?? ""}
            {event.target ? `(${event.target})` : ""}
            {bodyText ? `: ` : ""}
          </span>
        )}
        {/* 对话类消息展示 target（注入消息的目标 Agent） */}
        {event.type === "agent_message" && event.target && (
          <span className="text-accent-purple/70 mr-1">
            → {event.target}：
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
    icon: "",
    label: "对话",
    bg: "bg-accent-purple/15 border-accent-purple/30",
    dotColor: "#aa44ff",
  },
  agent_action: {
    icon: "",
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

/**
 * 从 SSEEvent 中提取可展示正文。
 * - agent_action：优先从 data 取有意义字段，避免显示原始函数调用
 * - 其他类型：content → message → description
 * - 清除残留的工具调用语法（乱码防护）
 */
function resolveBodyText(event: SSEEvent): string {
  if (event.type === "agent_action") {
    const d = event.data ?? {};
    // 优先从 data 中取有意义的字段
    const thought = typeof d.thought === "string" ? d.thought : "";
    const msg = typeof d.content === "string" ? d.content : "";
    if (thought) return stripInternalMarkers(thought);
    if (msg) return stripInternalMarkers(msg);
    // 回退到 event.description（后端 _build_action_description 生成的可读描述）
    const desc = typeof event.description === "string" ? event.description : "";
    if (desc) return stripInternalMarkers(desc);
    return "";
  }
  const raw = event.content ?? event.message ?? event.description ?? "";
  return stripInternalMarkers(raw);
}

/** 清除残留的 "调用工具：xxx({...})" 语法 + 内部终止标记 [END_TICK] + DSML 标签 */
function stripInternalMarkers(text: string): string {
  let cleaned = text.replace(/^调用工具:\s*\w+\(.*\)\s*$/s, "").trim();
  cleaned = cleaned.replace(/\[END_TICK\]/g, "").trim();
  // 清除 DSML 标签：支持 <||DSML||...>、< ||DSML|| ... >、</ ||DSML|| ...> 等格式
  cleaned = cleaned.replace(/<\/?\s*\|\|DSML\|\|[^>]*>/g, "").trim();
  cleaned = cleaned.replace(/<\/?\s*\|\|DSML\|\|/g, "").trim();
  cleaned = cleaned.replace(/\|\|DSML\|\|\s*>/g, "").trim();
  cleaned = cleaned.replace(/\|\|DSML\|\|/g, "").trim();
  return cleaned;
}
