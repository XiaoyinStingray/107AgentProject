import { useEffect, useRef, useState } from "react";
import type { SSEEvent, SSEEventType } from "../../types/events";
import type { TimelineProps, TimelineTick } from "../../types/sandbox";

/**
 * 群体沙盒 Tick 时间线（可折叠）。
 * 上方为水平 Tick 节点可视化，下方为按 Tick 聚合的事件摘要（可滚动）。
 * 点击标题栏可折叠/展开摘要区域。
 */
export default function Timeline({
  events,
  selectedTick,
  onSelectTick,
  className = "",
}: TimelineProps) {
  const ticks = groupEventsByTick(events);
  const summaryRef = useRef<HTMLDivElement>(null);
  const [userScrolledUp, setUserScrolledUp] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // 用 wheel/touchstart 检测用户真实滚动交互
  useEffect(() => {
    const el = summaryRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) setUserScrolledUp(true);
      else setUserScrolledUp(false);
    };
    const onTouch = () => setUserScrolledUp(true);
    el.addEventListener("wheel", onWheel, { passive: true });
    el.addEventListener("touchstart", onTouch, { passive: true });
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouch);
    };
  }, []);

  // 新 Tick 到达 → 自动滚底
  useEffect(() => {
    if (userScrolledUp) return;
    const el = summaryRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [ticks.length, userScrolledUp]);

  return (
    <div className={`flex flex-col ${className}`}>
      {/* 标题栏 — 点击折叠/展开 */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setCollapsed((v) => !v)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setCollapsed((v) => !v); }}
        className="flex items-center justify-between shrink-0 w-full cursor-pointer"
      >
        <h2 className="text-xs font-mono text-text-secondary">TIMELINE</h2>
        <span className="flex items-center gap-2">
          {ticks.length > 0 && (
            <span className="text-xs font-mono text-text-secondary/50">{ticks.length} ticks</span>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onSelectTick(null); }}
            className="text-xs font-mono text-accent-blue hover:text-accent-blue/80 transition-colors"
          >
            全部
          </button>
          <span className={`text-text-secondary/40 transition-transform ${collapsed ? "" : "rotate-180"}`}>
            ▼
          </span>
        </span>
      </div>

      {/* 水平 Tick 节点可视化 */}
      {ticks.length === 0 ? (
        !collapsed && (
          <p className="text-xs font-mono text-text-secondary/60 py-4 text-center shrink-0">
            等待 Tick 事件…
          </p>
        )
      ) : (
        !collapsed && (
          <div className="flex items-center overflow-x-auto pb-1 shrink-0">
            {ticks.map((tick, index) => (
              <TimelineNode
                key={tick.tick}
                tick={tick}
                selected={selectedTick === tick.tick}
                isLast={index === ticks.length - 1}
                onSelect={() =>
                  onSelectTick(selectedTick === tick.tick ? null : tick.tick)
                }
              />
            ))}
          </div>
        )
      )}

      {/* 按 Tick 聚合的事件摘要（固定高度，可滚动） */}
      {!collapsed && ticks.length > 0 && (
        <div ref={summaryRef} className="overflow-y-auto mt-2 border-t border-border/40 pt-2 max-h-48">
          {ticks
            .filter((t) => selectedTick === null || t.tick === selectedTick)
            .map((tick) => (
              <TickSummary key={tick.tick} tick={tick} events={events} />
            ))}
        </div>
      )}
    </div>
  );
}

/** 单个 Tick 的事件摘要行 */
function TickSummary({ tick, events }: { tick: TimelineTick; events: SSEEvent[] }) {
  const tickEvents = events.filter((e) => e.tick === tick.tick);
  // 按事件类型聚合计数
  const typeCounts = new Map<string, number>();
  tickEvents.forEach((e) => {
    typeCounts.set(e.type, (typeCounts.get(e.type) ?? 0) + 1);
  });

  return (
    <div className="mb-2">
      <div className="flex items-center gap-2 px-1">
        <span className="text-xs font-mono text-text-secondary font-semibold">
          Tick #{tick.tick}
        </span>
        <span className="text-xs font-mono text-text-secondary/50">
          {tick.eventCount} 事件
        </span>
        {tick.hasConflict && (
          <span className="text-xs font-mono text-accent-red/70">⚔️ 冲突</span>
        )}
        {tick.hasRelationshipChange && (
          <span className="text-xs font-mono text-accent-purple/70">🔗 关系变化</span>
        )}
      </div>
      <div className="flex flex-wrap gap-1 px-1 mt-1">
        {[...typeCounts.entries()].map(([type, count]) => (
          <span
            key={type}
            className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${TYPE_BADGE[type as SSEEventType] ?? "bg-bg-secondary/40 text-text-secondary/60"}`}
          >
            {TYPE_LABEL[type as SSEEventType] ?? type} ×{count}
          </span>
        ))}
      </div>
    </div>
  );
}

function groupEventsByTick(events: TimelineProps["events"]): TimelineTick[] {
  const grouped = new Map<number, TimelineTick>();

  events.forEach((event) => {
    const current = grouped.get(event.tick) ?? {
      tick: event.tick,
      eventCount: 0,
      hasRelationshipChange: false,
      hasConflict: false,
    };
    current.eventCount += 1;
    current.hasRelationshipChange ||= event.type === "relationship_change";
    current.hasConflict ||= event.type === "conflict_detected";
    grouped.set(event.tick, current);
  });

  return [...grouped.values()].sort((a, b) => a.tick - b.tick);
}

function TimelineNode({
  tick,
  selected,
  isLast,
  onSelect,
}: {
  tick: TimelineTick;
  selected: boolean;
  isLast: boolean;
  onSelect: () => void;
}) {
  const variant = tick.hasConflict
    ? "conflict"
    : tick.hasRelationshipChange
    ? "relationship_change"
    : "tick_boundary";
  const colors = TIMELINE_COLORS[variant];

  return (
    <div className="flex items-center min-w-fit">
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className="flex flex-col items-center gap-1 px-2 group"
      >
        <span
          className={`w-3 h-3 rounded-full border-2 ${colors.dot} ${
            selected ? "ring-2 ring-accent-blue/40" : ""
          } group-hover:scale-125 transition-transform`}
        />
        <span
          className={`text-xs font-mono ${
            selected ? "text-accent-blue" : "text-text-secondary"
          }`}
        >
          #{tick.tick}
        </span>
        <span className="text-xs font-mono text-text-secondary/60">
          {tick.eventCount} ev
        </span>
      </button>
      {!isLast && <span className={`w-8 h-px ${colors.line}`} />}
    </div>
  );
}

const TIMELINE_COLORS: Record<
  Extract<SSEEventType, "relationship_change" | "tick_boundary"> | "conflict",
  { dot: string; line: string }
> = {
  relationship_change: {
    dot: "border-accent-purple bg-accent-purple/30",
    line: "bg-accent-purple/40",
  },
  conflict: {
    dot: "border-accent-red bg-accent-red/30",
    line: "bg-accent-red/40",
  },
  tick_boundary: {
    dot: "border-accent-blue bg-accent-blue/30",
    line: "bg-border",
  },
};

const TYPE_LABEL: Partial<Record<SSEEventType, string>> = {
  agent_message: "发言",
  agent_action: "行动",
  world_event: "世界",
  relationship_change: "关系",
  conflict_detected: "冲突",
  tick_boundary: "Tick",
  thought_stream: "思考",
};

const TYPE_BADGE: Partial<Record<SSEEventType, string>> = {
  agent_message: "bg-accent-green/10 text-accent-green/80",
  agent_action: "bg-accent-orange/10 text-accent-orange/80",
  world_event: "bg-accent-purple/10 text-accent-purple/80",
  relationship_change: "bg-accent-purple/10 text-accent-purple/80",
  conflict_detected: "bg-accent-red/10 text-accent-red/80",
  tick_boundary: "bg-bg-secondary/60 text-text-secondary/60",
  thought_stream: "bg-accent-blue/10 text-accent-blue/80",
};
