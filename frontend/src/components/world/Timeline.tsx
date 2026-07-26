import type { SSEEventType } from "../../types/events";
import type { TimelineProps, TimelineTick } from "../../types/sandbox";

/**
 * 群体沙盒 Tick 时间线。
 * 后续实现负责聚合事件、展示 Tick 标记，并将选中的 Tick 通知父组件。
 */
export default function Timeline({
  events,
  selectedTick,
  onSelectTick,
  className = "",
}: TimelineProps) {
  const ticks = groupEventsByTick(events);

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-mono text-text-secondary">TIMELINE</h2>
        <button
          type="button"
          onClick={() => onSelectTick(null)}
          className="text-xs font-mono text-accent-blue hover:text-accent-blue/80 transition-colors"
        >
          全部
        </button>
      </div>

      {ticks.length === 0 ? (
        <p className="text-xs font-mono text-text-secondary/60 py-4 text-center">
          等待 Tick 事件…
        </p>
      ) : (
        <div className="flex items-center overflow-x-auto pb-1">
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
      )}
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
