import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { ChevronDown, GripVertical, Map, RotateCcw } from "lucide-react";
import { MiniMap } from "@xyflow/react";

const POSITION_STORAGE_KEY = "lifelab.pipeline.minimap.position";
const COLLAPSED_STORAGE_KEY = "lifelab.pipeline.minimap.collapsed";
const EDGE_GAP = 12;
const KEYBOARD_STEP = 12;

interface Point {
  x: number;
  y: number;
}

interface Size {
  width: number;
  height: number;
}

interface DraggableMiniMapProps {
  nodeColor?: ComponentProps<typeof MiniMap>["nodeColor"];
}

interface DragState {
  startX: number;
  startY: number;
  origin: Point;
}

export function clampMiniMapPosition(
  position: Point,
  mapSize: Size,
  containerSize: Size,
): Point {
  return {
    x: Math.min(
      Math.max(EDGE_GAP, position.x),
      Math.max(EDGE_GAP, containerSize.width - mapSize.width - EDGE_GAP),
    ),
    y: Math.min(
      Math.max(EDGE_GAP, position.y),
      Math.max(EDGE_GAP, containerSize.height - mapSize.height - EDGE_GAP),
    ),
  };
}

function readStoredPosition(): Point | null {
  try {
    const raw = localStorage.getItem(POSITION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Point>;
    return Number.isFinite(parsed.x) && Number.isFinite(parsed.y)
      ? { x: Number(parsed.x), y: Number(parsed.y) }
      : null;
  } catch {
    return null;
  }
}

function readStoredCollapsed(): boolean {
  try {
    const stored = localStorage.getItem(COLLAPSED_STORAGE_KEY);
    if (stored !== null) return stored === "true";
  } catch {
    // Fall through to the responsive default.
  }
  return typeof window.matchMedia === "function"
    && window.matchMedia("(max-width: 767px)").matches;
}

export default function DraggableMiniMap({ nodeColor }: DraggableMiniMapProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const positionRef = useRef<Point | null>(null);
  const [position, setPosition] = useState<Point | null>(() => readStoredPosition());
  const [collapsed, setCollapsed] = useState(() => readStoredCollapsed());

  positionRef.current = position;

  const getContainer = () =>
    wrapperRef.current?.closest(".react-flow") as HTMLElement | null;

  const measurePosition = (): Point | null => {
    const wrapper = wrapperRef.current;
    const container = getContainer();
    if (!wrapper || !container) return null;
    const wrapperRect = wrapper.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    return {
      x: wrapperRect.left - containerRect.left,
      y: wrapperRect.top - containerRect.top,
    };
  };

  const commitPosition = (next: Point) => {
    positionRef.current = next;
    setPosition(next);
    try {
      localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Position persistence is optional.
    }
  };

  const clampToContainer = (next: Point): Point => {
    const wrapper = wrapperRef.current;
    const container = getContainer();
    if (!wrapper || !container) return next;
    return clampMiniMapPosition(
      next,
      { width: wrapper.offsetWidth, height: wrapper.offsetHeight },
      { width: container.clientWidth, height: container.clientHeight },
    );
  };

  const handleMouseDown = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const origin = positionRef.current ?? measurePosition();
    if (!origin) return;
    event.preventDefault();
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      origin,
    };
    commitPosition(clampToContainer(origin));
  };

  const handleKeyboardMove = (event: KeyboardEvent<HTMLButtonElement>) => {
    const deltaByKey: Record<string, Point> = {
      ArrowLeft: { x: -KEYBOARD_STEP, y: 0 },
      ArrowRight: { x: KEYBOARD_STEP, y: 0 },
      ArrowUp: { x: 0, y: -KEYBOARD_STEP },
      ArrowDown: { x: 0, y: KEYBOARD_STEP },
    };
    const delta = deltaByKey[event.key];
    if (!delta) return;
    const origin = positionRef.current ?? measurePosition();
    if (!origin) return;
    event.preventDefault();
    commitPosition(clampToContainer({
      x: origin.x + delta.x,
      y: origin.y + delta.y,
    }));
  };

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      try {
        localStorage.setItem(COLLAPSED_STORAGE_KEY, String(next));
      } catch {
        // Collapsed state persistence is optional.
      }
      return next;
    });
  };

  const resetPosition = () => {
    positionRef.current = null;
    setPosition(null);
    try {
      localStorage.removeItem(POSITION_STORAGE_KEY);
    } catch {
      // Position persistence is optional.
    }
  };

  useEffect(() => {
    const handleMouseMove = (event: globalThis.MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      event.preventDefault();
      commitPosition(clampToContainer({
        x: drag.origin.x + event.clientX - drag.startX,
        y: drag.origin.y + event.clientY - drag.startY,
      }));
    };
    const handleMouseUp = () => {
      dragRef.current = null;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const container = getContainer();
    if (!wrapper || !container || typeof ResizeObserver === "undefined") return;

    const keepInBounds = () => {
      const current = positionRef.current;
      if (!current) return;
      const next = clampToContainer(current);
      if (next.x !== current.x || next.y !== current.y) commitPosition(next);
    };
    const observer = new ResizeObserver(keepInBounds);
    observer.observe(container);
    observer.observe(wrapper);
    keepInBounds();
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={wrapperRef}
      data-testid="draggable-minimap"
      className="nodrag nopan absolute z-20 overflow-hidden rounded-md border border-border bg-bg-secondary shadow-lg"
      style={position
        ? { left: position.x, top: position.y }
        : { right: EDGE_GAP, bottom: EDGE_GAP }}
    >
      <div className="flex h-8 items-center border-b border-border/70 bg-bg-primary/95">
        <button
          type="button"
          aria-label="拖动小地图"
          title="拖动小地图"
          onMouseDown={handleMouseDown}
          onKeyDown={handleKeyboardMove}
          className="flex h-8 w-8 cursor-move items-center justify-center text-text-muted hover:text-text-primary"
        >
          <GripVertical size={14} />
        </button>
        {!collapsed && <div className="flex-1" />}
        {!collapsed && (
          <button
            type="button"
            aria-label="恢复小地图默认位置"
            title="恢复默认位置"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={resetPosition}
            className="flex h-8 w-8 items-center justify-center text-text-muted hover:text-text-primary"
          >
            <RotateCcw size={13} />
          </button>
        )}
        <button
          type="button"
          aria-label={collapsed ? "展开小地图" : "折叠小地图"}
          title={collapsed ? "展开小地图" : "折叠小地图"}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={toggleCollapsed}
          className="flex h-8 w-8 items-center justify-center text-text-muted hover:text-text-primary"
        >
          {collapsed ? <Map size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>
      {!collapsed && (
        <MiniMap
          pannable
          zoomable
          nodeColor={nodeColor}
          className="!m-0 !rounded-none !border-0 !bg-bg-secondary"
          style={{ position: "relative", width: 188, height: 112, right: "auto", bottom: "auto" }}
        />
      )}
    </div>
  );
}
