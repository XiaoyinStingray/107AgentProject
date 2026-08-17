/**
 * GraffitiLayer — Step 99c: 涂鸦指令系统（Phaser 原生版）。
 *
 * 使用 Phaser.GameObjects.Graphics 在场景中直接绘制涂鸦，
 * 不再使用 HTML5 Canvas 叠层——彻底解决与 Agent 点击/拖拽的事件冲突。
 *
 * 交互逻辑：
 *   - 涂鸦模式开启时，按住鼠标拖动 = 画线，松手 = 识别形状
 *   - 短点击（<10 个采样点）穿透给 Agent 交互，不触发涂鸦
 *   - 涂鸦模式关闭时，此层完全透明，不影响任何交互
 */

import Phaser from "phaser";

// ── 常量 ──

const TILE = 64;
const MIN_STROKE_LENGTH = 30;   // 40→30 降低最小笔画长度
const MIN_POINTS = 6;           // 10→6 降低最小采样点
const LINE_MAX_DEVIATION = 20;  // 15→20 放宽直线容差
const CIRCLE_CLOSE_DIST = 40;   // 30→40 放宽圆闭合距离
const CIRCLE_MIN_AREA = 600;    // 1000→600 降低最小面积
const CIRCLE_MIN_ROUNDNESS = 0.4; // 0.6→0.4 放宽圆度要求
const CROSS_ANGLE_MIN = 30;
const CROSS_ANGLE_MAX = 150;
const GRAFFITI_FADE_DELAY = 5000;

// ── 类型 ──

export type ShapeType = "line" | "circle" | "cross" | null;

export interface GraffitiResult {
  type: ShapeType;
  lineStart?: { tx: number; ty: number };
  lineEnd?: { tx: number; ty: number };
  center?: { tx: number; ty: number };
  radius?: number;
}

interface Point {
  x: number;
  y: number;
}

// ================================================================
// GraffitiLayer (Phaser-native)
// ================================================================

export class GraffitiLayer {
  private scene: Phaser.Scene;
  private graphics: Phaser.GameObjects.Graphics | null = null;
  private points: Point[] = [];
  private drawing = false;
  private active = false;
  private fadeTimer: Phaser.Time.TimerEvent | null = null;

  private onShape: ((result: GraffitiResult) => void) | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  // ── 生命周期 ──

  /** 启用/禁用涂鸦模式 */
  setActive(active: boolean): void {
    if (this.active === active) return;
    this.active = active;

    if (active) {
      // 创建 Phaser Graphics 用于绘制
      if (!this.graphics) {
        this.graphics = this.scene.add.graphics();
        this.graphics.setDepth(35); // 高于 agent
      }
      this.graphics.setVisible(true);
      // 监听 Phaser 输入事件
      this.scene.input.on("pointerdown", this.onPointerDown, this);
      this.scene.input.on("pointermove", this.onPointerMove, this);
      this.scene.input.on("pointerup", this.onPointerUp, this);
    } else {
      this.clearFade();
      this.clearCanvas();
      if (this.graphics) this.graphics.setVisible(false);
      this.scene.input.off("pointerdown", this.onPointerDown, this);
      this.scene.input.off("pointermove", this.onPointerMove, this);
      this.scene.input.off("pointerup", this.onPointerUp, this);
    }
  }

  isActive(): boolean {
    return this.active;
  }

  onShapeDetected(cb: (result: GraffitiResult) => void): void {
    this.onShape = cb;
  }

  destroy(): void {
    this.setActive(false);
    this.graphics?.destroy();
    this.graphics = null;
  }

  // ── 事件处理 ──

  private onPointerDown = (pointer: Phaser.Input.Pointer): void => {
    // 只在自己 active 时响应
    if (!this.active) return;
    // 检查是否点在了 Agent 精灵上——如果是，不启动涂鸦（让 Agent 交互处理）
    const hit = this.scene.input.hitTestPointer(pointer);
    if (hit.length > 0) return;

    this.clearFade();
    this.clearCanvas();
    this.points = [{ x: pointer.worldX, y: pointer.worldY }];
    this.drawing = true;
  };

  private onPointerMove = (pointer: Phaser.Input.Pointer): void => {
    if (!this.drawing || !this.active) return;
    // 只记录移动时的点
    if (!pointer.isDown) {
      this.drawing = false;
      this.finishStroke();
      return;
    }
    this.points.push({ x: pointer.worldX, y: pointer.worldY });
    this.drawStroke();
  };

  private onPointerUp = (_pointer: Phaser.Input.Pointer): void => {
    if (!this.drawing) return;
    this.drawing = false;
    this.finishStroke();
  };

  // ── 笔画完成 → 识别 ──

  private finishStroke(): void {
    if (this.points.length < MIN_POINTS) {
      this.showUnrecognized();
      this.clearAfterDelay();
      return;
    }

    const smoothed = this.smoothPoints(this.points);
    const totalLength = this.strokeLength(smoothed);
    if (totalLength < MIN_STROKE_LENGTH) {
      this.showUnrecognized();
      this.clearAfterDelay();
      return;
    }

    const result = this.recognizeShape(smoothed);
    if (result.type) {
      this.onShape?.(result);
      this.drawResult(result);
    } else {
      this.showUnrecognized();
    }

    this.clearAfterDelay();
  }

  /** 识别失败时显示淡灰色提示 */
  private showUnrecognized(): void {
    const g = this.graphics;
    if (!g || this.points.length < 2) return;
    // 用淡灰色重绘笔画，表示未识别
    g.clear();
    g.lineStyle(2, 0x888888, 0.3);
    g.beginPath();
    g.moveTo(this.points[0].x, this.points[0].y);
    for (let i = 1; i < this.points.length; i++) {
      g.lineTo(this.points[i].x, this.points[i].y);
    }
    g.strokePath();
  }

  // ── Phaser Graphics 绘制 ──

  private drawStroke(): void {
    const g = this.graphics;
    if (!g || this.points.length < 2) return;
    g.clear();
    g.lineStyle(3, 0xFFB450, 0.7);
    g.beginPath();
    g.moveTo(this.points[0].x, this.points[0].y);
    for (let i = 1; i < this.points.length; i++) {
      g.lineTo(this.points[i].x, this.points[i].y);
    }
    g.strokePath();
  }

  private drawResult(result: GraffitiResult): void {
    const g = this.graphics;
    if (!g) return;

    if (result.type === "line" && result.lineStart && result.lineEnd) {
      const x1 = result.lineStart.tx * TILE + TILE / 2;
      const y1 = result.lineStart.ty * TILE + TILE / 2;
      const x2 = result.lineEnd.tx * TILE + TILE / 2;
      const y2 = result.lineEnd.ty * TILE + TILE / 2;
      // 光轨效果
      g.lineStyle(5, 0x64FF96, 0.9);
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.strokePath();
      // 发光
      g.lineStyle(10, 0x64FF96, 0.2);
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.strokePath();
    } else if (result.type === "circle" && result.center) {
      const cx = result.center.tx * TILE + TILE / 2;
      const cy = result.center.ty * TILE + TILE / 2;
      const r = (result.radius ?? 3) * TILE;
      g.lineStyle(3, 0x64C8FF, 0.9);
      g.strokeCircle(cx, cy, r);
      g.lineStyle(8, 0x64C8FF, 0.15);
      g.strokeCircle(cx, cy, r);
    } else if (result.type === "cross" && result.center) {
      const cx = result.center.tx * TILE + TILE / 2;
      const cy = result.center.ty * TILE + TILE / 2;
      const s = 40;
      g.lineStyle(3, 0xFF6464, 0.9);
      g.beginPath(); g.moveTo(cx - s, cy - s); g.lineTo(cx + s, cy + s); g.strokePath();
      g.beginPath(); g.moveTo(cx + s, cy - s); g.lineTo(cx - s, cy + s); g.strokePath();
    }
  }

  private clearCanvas(): void {
    this.graphics?.clear();
  }

  private clearFade(): void {
    if (this.fadeTimer) {
      this.fadeTimer.destroy();
      this.fadeTimer = null;
    }
  }

  private clearAfterDelay(): void {
    this.clearFade();
    this.fadeTimer = this.scene.time.delayedCall(GRAFFITI_FADE_DELAY, () => {
      this.clearCanvas();
      this.points = [];
    });
  }

  // ── 几何（不变）──

  private smoothPoints(pts: Point[]): Point[] {
    if (pts.length < 3) return pts;
    const result: Point[] = [];
    for (let i = 0; i < pts.length; i++) {
      const start = Math.max(0, i - 2);
      const end = Math.min(pts.length - 1, i + 2);
      let sx = 0, sy = 0, count = 0;
      for (let j = start; j <= end; j++) { sx += pts[j].x; sy += pts[j].y; count++; }
      result.push({ x: sx / count, y: sy / count });
    }
    return result;
  }

  private strokeLength(pts: Point[]): number {
    let len = 0;
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i].x - pts[i - 1].x;
      const dy = pts[i].y - pts[i - 1].y;
      len += Math.sqrt(dx * dx + dy * dy);
    }
    return len;
  }

  private recognizeShape(pts: Point[]): GraffitiResult {
    const lineResult = this.checkLine(pts);
    if (lineResult) return lineResult;
    const circleResult = this.checkCircle(pts);
    if (circleResult) return circleResult;
    const crossResult = this.checkCross(pts);
    if (crossResult) return crossResult;
    return { type: null };
  }

  private checkLine(pts: Point[]): GraffitiResult | null {
    const start = pts[0];
    const end = pts[pts.length - 1];
    if (Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2) < 60) return null;
    for (let i = 1; i < pts.length - 1; i++) {
      if (this.pointToLineDist(pts[i], start, end) > LINE_MAX_DEVIATION) return null;
    }
    return {
      type: "line",
      lineStart: { tx: Math.round(start.x / TILE), ty: Math.round(start.y / TILE) },
      lineEnd: { tx: Math.round(end.x / TILE), ty: Math.round(end.y / TILE) },
    };
  }

  private checkCircle(pts: Point[]): GraffitiResult | null {
    const start = pts[0], end = pts[pts.length - 1];
    if (Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2) > CIRCLE_CLOSE_DIST) return null;
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
    }
    area = Math.abs(area) / 2;
    if (area < CIRCLE_MIN_AREA) return null;
    const perimeter = this.strokeLength(pts);
    if ((4 * Math.PI * area) / (perimeter * perimeter) < CIRCLE_MIN_ROUNDNESS) return null;
    const radiusTiles = Math.max(1, Math.round(Math.sqrt(area / Math.PI) / TILE));
    return { type: "circle", center: { tx: Math.round(cx / TILE), ty: Math.round(cy / TILE) }, radius: radiusTiles };
  }

  private checkCross(pts: Point[]): GraffitiResult | null {
    const mid = Math.floor(pts.length / 2);
    if (mid < 5) return null;
    const s1 = pts[0], e1 = pts[mid], s2 = pts[mid], e2 = pts[pts.length - 1];
    let angleDiff = Math.abs(
      Math.atan2(e1.y - s1.y, e1.x - s1.x) - Math.atan2(e2.y - s2.y, e2.x - s2.x)
    ) * 180 / Math.PI;
    if (angleDiff > 180) angleDiff = 360 - angleDiff;
    if (angleDiff < CROSS_ANGLE_MIN || angleDiff > CROSS_ANGLE_MAX) return null;
    const ix = (s1.x + e1.x + s2.x + e2.x) / 4;
    const iy = (s1.y + e1.y + s2.y + e2.y) / 4;
    return { type: "cross", center: { tx: Math.round(ix / TILE), ty: Math.round(iy / TILE) } };
  }

  private pointToLineDist(p: Point, a: Point, b: Point): number {
    const dx = b.x - a.x, dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.sqrt((p.x - a.x) ** 2 + (p.y - a.y) ** 2);
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
    return Math.sqrt((p.x - (a.x + t * dx)) ** 2 + (p.y - (a.y + t * dy)) ** 2);
  }
}
