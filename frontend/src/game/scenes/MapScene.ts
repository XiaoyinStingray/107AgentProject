import Phaser from "phaser";
import { ITEM_FRAME } from "../tileset";
import { AgentSprite, AgentSpriteData } from "../sprites/AgentSprite";
import { getDialogue } from "../dialogue";
import { AutonomousMover } from "../AutonomousMover";

/**
 * MapScene — Phaser 原生 tilemap 渲染。
 *
 * 图层（从底到顶）：
 *   1. 地面层 — this.make.tilemap() 单层，数据 = ground + walls 合并
 *   2. 物品阴影层 — 每个物品下方椭圆
 *   3. 物品层 — items spritesheet 帧
 *   4. 天气粒子层 — sakura 飘落
 *   5. Agent 精灵层 — AgentSprite 容器（depth 15）
 *
 * 切换场景：loadMap(mapId) → 销毁旧对象 → 动态 import JSON → 重建
 */

/* —— 类型 —— */

interface MapData {
  id: string;
  name: string;
  width: number;
  height: number;
  indoor?: boolean;
  weather?: "clear" | "sakura" | "rain";
  ground: number[][];
  items: MapItem[];
  spawns: { x: number; y: number }[];
}

interface MapItem {
  id: string;
  type: string;
  tileX: number;
  tileY: number;
  state?: "empty" | "occupied" | "active";
}

/* —— 墙壁 tile 索引（在 "tiles" spritesheet 中帧 6-9） —— */
const WALL_TOP = 0;
const WALL_BOTTOM = 1;
const WALL_LEFT = 2;
const WALL_RIGHT = 3;

const TILE_S = 64; // 像素（2x 高清）
const WALL_OFFSET = 6; // 墙壁帧在 spritesheet 中的偏移

export class MapScene extends Phaser.Scene {
  /* —— 运行时状态 —— */
  private mapData: MapData | null = null;
  private tilemap: Phaser.Tilemaps.Tilemap | null = null;
  private groundLayer: Phaser.Tilemaps.TilemapLayer | null = null;
  private itemObjects: Phaser.GameObjects.GameObject[] = [];
  private weatherTweens: Phaser.Tweens.Tween[] = [];
  private agentSprites: Map<string, AgentSprite> = new Map();
  private pendingAgents: AgentSpriteData[] | null = null;
  private wallMap: number[][] = [];  // 墙壁占位 map，0=可通行
  private dialogueCooldowns: Map<string, number> = new Map();
  private dialogueTimer: Phaser.Time.TimerEvent | null = null;
  private movers: Map<string, AutonomousMover> = new Map();
  private _loadingMap = false;
  private ready = false;

  constructor() {
    super({ key: "MapScene" });
  }

  /* ================================================================
   * 生命周期
   * ================================================================ */

  create(): void {
    this.input.dragDistanceThreshold = 8; // 防止点击时误触发拖拽
    this.ready = true;
    // 监听来自 React 的耳语事件 → Agent 短暂闪烁
    this.game.events.on("agent-whisper", (agentId: string) => {
      const sprite = this.agentSprites.get(agentId);
      if (!sprite) return;
      this.tweens.add({
        targets: sprite, alpha: 0.5, duration: 120, yoyo: true, repeat: 2,
      });
    });
    this.startDialogueScanner();
    if (this.mapData) this.buildScene();
    else this.loadMap("library");
  }

  shutdown(): void {
    this.game.events.off("agent-whisper");
    this.dialogueTimer?.destroy();
    this.dialogueCooldowns.clear();
    this.destroyScene();
  }

  /* ================================================================
   * 场景加载
   * ================================================================ */

  loadMap(mapId: string): void {
    if (this._loadingMap) return;
    this._loadingMap = true;
    this.destroyScene();

    import(`../../data/scenes/${mapId}.json`)
      .then((m) => {
        this.mapData = (m.default ?? m) as MapData;
        if (this.ready) this.buildScene();
        this._loadingMap = false;
      })
      .catch((err) => {
        console.error(`[MapScene] 加载场景失败: ${mapId}`, err);
        this._loadingMap = false;
      });
  }

  /* ================================================================
   * 场景构建
   * ================================================================ */

  private buildScene(): void {
    const d = this.mapData;
    if (!d) return;

    const W = d.width;
    const H = d.height;

    // 1. 生成合并图层数据（地面 0-5 + 墙壁 6-9）
    const layerData = this.buildLayerData(d);

    // 2. 创建 tilemap
    this.tilemap = this.make.tilemap({
      data: layerData,
      tileWidth: TILE_S,
      tileHeight: TILE_S,
      width: W,
      height: H,
    });

    const tileset = this.tilemap.addTilesetImage("tiles", "tiles", TILE_S, TILE_S, 0, 0);
    if (!tileset) {
      console.error("[MapScene] tileset 'tiles' 未找到——BootScene 可能未生成贴图");
      return;
    }

    this.groundLayer = this.tilemap.createLayer(0, tileset, 0, 0);
    if (!this.groundLayer) return;

    // 3. 物品
    this.placeItems(d);

    // 4. 天气
    if (d.weather === "sakura" || d.weather === "rain") {
      this.startWeather(d.weather, W, H);
    }

    // 5. Agent 精灵 — 始终消费 pending（修复 BUG-023 首次加载不显示）
    const agents = this.pendingAgents ?? [];
    this.pendingAgents = null;
    if (agents.length > 0) this.placeAgents(agents);
  }

  /* ================================================================
   * 图层数据生成：ground + walls 合并
   * ================================================================ */

  private buildLayerData(d: MapData): number[][] {
    const W = d.width;
    const H = d.height;
    const data: number[][] = [];

    // 计算墙壁位置（存下来给拖拽判定用）
    this.wallMap = this.computeWallMap(d);

    for (let r = 0; r < H; r++) {
      data[r] = [];
      for (let c = 0; c < W; c++) {
        const w = this.wallMap[r][c];
        if (w >= 0) {
          data[r][c] = WALL_OFFSET + w; // 6-9
        } else {
          data[r][c] = (d.ground[r]?.[c]) ?? 0;
        }
      }
    }
    return data;
  }

  /**
   * 计算墙壁 map：-1 表示无墙，0-3 表示墙壁类型。
   * 室内场景在四周边界生成墙壁，spawn 点留空作为门。
   */
  private computeWallMap(d: MapData): number[][] {
    const W = d.width;
    const H = d.height;
    const wall: number[][] = Array.from({ length: H }, () => Array(W).fill(-1));

    if (!d.indoor) return wall;

    // 收集门位置
    const doorSet = new Set<string>();
    (d.spawns ?? []).forEach((s) => doorSet.add(`${s.x},${s.y}`));

    const isDoor = (c: number, r: number): boolean => doorSet.has(`${c},${r}`);

    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        if (isDoor(c, r)) continue;

        if (r === 0 && c === 0)       wall[r][c] = WALL_TOP;    // 左上角
        else if (r === 0 && c === W - 1) wall[r][c] = WALL_TOP; // 右上角
        else if (r === H - 1 && c === 0) wall[r][c] = WALL_BOTTOM; // 左下角
        else if (r === H - 1 && c === W - 1) wall[r][c] = WALL_BOTTOM; // 右下角
        else if (r === 0)              wall[r][c] = WALL_TOP;
        else if (r === H - 1)          wall[r][c] = WALL_BOTTOM;
        else if (c === 0)              wall[r][c] = WALL_LEFT;
        else if (c === W - 1)          wall[r][c] = WALL_RIGHT;
      }
    }

    return wall;
  }

  /* ================================================================
   * 物品放置
   * ================================================================ */

  private placeItems(d: MapData): void {
    (d.items ?? []).forEach((item) => {
      const cx = item.tileX * TILE_S + TILE_S / 2;
      const cy = item.tileY * TILE_S + TILE_S / 2;
      const frame = ITEM_FRAME[item.type];

      // 阴影
      const shadow = this.add.ellipse(cx + 1, cy + 3, TILE_S * 0.7, TILE_S * 0.25, 0x000000, 0.18);
      shadow.setDepth(1);
      this.itemObjects.push(shadow);

      if (frame !== undefined && this.textures.exists("items")) {
        const sprite = this.add.image(cx, cy, "items", frame).setDepth(2);
        this.itemObjects.push(sprite);
      }
      // 若类型无对应帧，静默跳过（不渲染 emoji）
    });
  }

  /* ================================================================
   * 天气特效
   * ================================================================ */

  private startWeather(type: string, mapW: number, mapH: number): void {
    const W = mapW * TILE_S;
    const H = mapH * TILE_S;
    const count = type === "rain" ? 35 : 20;

    for (let i = 0; i < count; i++) {
      const isRain = type === "rain";
      const px = Math.random() * W;
      const py = Math.random() * H * 0.6;

      const particle = isRain
        ? this.add.rectangle(px, py, 1, 6, 0x8899CC, 0.5).setDepth(10)
        : this.add.circle(px, py, 2.5, 0xF8BBD0, 0.65).setDepth(10);

      this.itemObjects.push(particle);

      const tw = this.tweens.add({
        targets: particle,
        y: py + H * 0.8,
        x: px + (Math.random() - 0.5) * (isRain ? 15 : 70),
        alpha: isRain ? 0.15 : 0,
        duration: isRain ? 1200 + Math.random() * 800 : 3500 + Math.random() * 2500,
        repeat: -1,
        delay: Math.random() * (isRain ? 1500 : 4000),
      });
      this.weatherTweens.push(tw);
    }
  }

  /* ================================================================
   * 暂停/继续（Step 65 存档系统）
   * ================================================================ */

  private paused = false;

  isPaused(): boolean { return this.paused; }

  pauseSimulation(): void {
    if (this.paused) return;
    this.paused = true;
    this.movers.forEach((m) => m.stop());
    if (this.dialogueTimer) this.dialogueTimer.paused = true;
    // 取消所有进行中的 tween（停止移动动画）
    this.tweens.killTweensOf(this.agentSprites);
  }

  resumeSimulation(): void {
    if (!this.paused) return;
    this.paused = false;
    this.movers.forEach((m) => m.start());
    if (this.dialogueTimer) this.dialogueTimer.paused = false;
  }

  /* ================================================================
   * Agent 精灵管理
   * ================================================================ */

  /** 设置/更新全部 Agent 精灵（从 React prop 同步） */
  setAgents(data: AgentSpriteData[]): void {
    if (!this.ready || !this.mapData) {
      this.pendingAgents = data;
      return;
    }
    this.placeAgents(data);
  }

  /** 获取指定 Agent 的精灵（供外部调用 showBubble 等） */
  getAgentSprite(agentId: string): AgentSprite | undefined {
    return this.agentSprites.get(agentId);
  }

  /** 显示 Agent 头顶气泡 */
  showAgentBubble(agentId: string, message: string): void {
    const sprite = this.agentSprites.get(agentId);
    if (!sprite) return;
    // 动态 import 避免循环依赖
    import("../sprites/ActionBubble").then(({ ActionBubble }) => {
      const bubble = new ActionBubble(this, message);
      bubble.show(sprite);
    });
  }

  private dragStartX = 0;
  private dragStartY = 0;
  private readonly DRAG_THRESHOLD = 8; // px，小于此值=点击，大于=拖拽

  private placeAgents(data: AgentSpriteData[]): void {
    // 清除旧精灵
    this.agentSprites.forEach((s) => s.destroy());
    this.agentSprites.clear();

    data.forEach((d) => {
      const sprite = new AgentSprite(this, d);
      sprite.setData("name", d.name);
      this.agentSprites.set(d.agentId, sprite);

      // 自主移动器
      const mover = new AutonomousMover(
        sprite,
        this,
        undefined,
        (tx, ty) => this.isWalkable(tx, ty),
        (tx, ty) => this.isOccupiedByOther(d.agentId, tx, ty),
        { w: this.mapData?.width ?? 12, h: this.mapData?.height ?? 8 },
      );
      if (!this.paused) mover.start();
      this.movers.set(d.agentId, mover);

      // 交互区域 = 圆半径
      const r = 36;
      sprite.setInteractive(
        new Phaser.Geom.Circle(0, 0, r),
        Phaser.Geom.Circle.Contains,
      );
      sprite.input!.cursor = "pointer";
      this.input.setDraggable(sprite);

      // pointerdown → 记录起始位置 + tile
      sprite.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
        this.dragStartX = pointer.x;
        this.dragStartY = pointer.y;
        sprite.setData("startTileX", d.tileX);
        sprite.setData("startTileY", d.tileY);
      });

      // pointerup → 点击 vs 双击 vs 拖拽
      sprite.on("pointerup", (pointer: Phaser.Input.Pointer) => {
        const dx = pointer.x - this.dragStartX;
        const dy = pointer.y - this.dragStartY;
        if (Math.abs(dx) >= this.DRAG_THRESHOLD || Math.abs(dy) >= this.DRAG_THRESHOLD) return;
        // 双击判定：300ms 内两次点击 = 双击；超时 = 单击
        const lastClick: number = sprite.getData("lastClick") ?? 0;
        const pendingTimer: Phaser.Time.TimerEvent | null = sprite.getData("clickTimer") ?? null;
        const now = Date.now();
        if (lastClick && now - lastClick < 300) {
          // 双击：取消挂起的单击定时器
          pendingTimer?.remove();
          sprite.setData("clickTimer", null);
          sprite.setData("lastClick", 0);
          this.game.events.emit("agent-doubleclicked", d.agentId);
        } else {
          sprite.setData("lastClick", now);
          const timer = this.time.delayedCall(310, () => {
            if (sprite.getData("lastClick") === now) {
              sprite.setData("clickTimer", null);
              this.game.events.emit("agent-clicked", d.agentId);
            }
          });
          sprite.setData("clickTimer", timer);
        }
      });

      // 拖拽中 → 跟随指针，限制在场景边界内
      sprite.on("drag", (_ptr: Phaser.Input.Pointer, dragX: number, dragY: number) => {
        const MW = (this.mapData?.width ?? 12) * TILE_S;
        const MH = (this.mapData?.height ?? 8) * TILE_S;
        sprite.x = Math.max(TILE_S / 2, Math.min(dragX, MW - TILE_S / 2));
        sprite.y = Math.max(TILE_S / 2, Math.min(dragY, MH - TILE_S / 2));
      });

      // 拖拽结束 → 吸附到最近可通行 tile + 重叠检查 + 通知 React
      sprite.on("dragend", () => {
        const W = this.mapData?.width ?? 12;
        const H = this.mapData?.height ?? 8;
        let tx = Math.round(sprite.x / TILE_S);
        let ty = Math.round(sprite.y / TILE_S);
        tx = Math.max(0, Math.min(tx, W - 1));
        ty = Math.max(0, Math.min(ty, H - 1));
        // 墙壁/重叠 → 弹回起始 tile
        if (!this.isWalkable(tx, ty) || this.isOccupiedByOther(d.agentId, tx, ty)) {
          tx = sprite.getData("startTileX") ?? d.tileX;
          ty = sprite.getData("startTileY") ?? d.tileY;
        }
        sprite.setTile(tx, ty);
        this.game.events.emit("agent-moved", d.agentId, tx, ty);
      });
    });
  }

  /* ================================================================
   * Agent 对话引擎（Mock — 64c）
   * ================================================================ */

  private static readonly SCAN_INTERVAL = 4000;  // 扫描间隔 ms
  private static readonly PROXIMITY = 2;         // 触发对话的 tile 距离
  private static readonly COOLDOWN = 8000;       // 同对冷却 ms

  private startDialogueScanner(): void {
    this.dialogueTimer?.destroy();
    this.dialogueTimer = this.time.addEvent({
      delay: MapScene.SCAN_INTERVAL,
      loop: true,
      callback: () => this.scanAndDialogue(),
    });
  }

  private scanAndDialogue(): void {
    const agents = [...this.agentSprites.values()];
    if (agents.length < 2) return;
    const now = Date.now();

    for (let i = 0; i < agents.length; i++) {
      for (let j = i + 1; j < agents.length; j++) {
        const a = agents[i];
        const b = agents[j];
        const dist = Math.abs(a.tileX - b.tileX) + Math.abs(a.tileY - b.tileY);
        if (dist > MapScene.PROXIMITY) continue;

        const pairKey = [a.agentId, b.agentId].sort().join("|");
        const last = this.dialogueCooldowns.get(pairKey) ?? 0;
        if (now - last < MapScene.COOLDOWN) continue;
        this.dialogueCooldowns.set(pairKey, now);

        // 随机选 speaker
        const [speaker, listener] = Math.random() < 0.5 ? [a, b] : [b, a];
        const line = getDialogue(
          speaker.getData("name") ?? "",
          listener.getData("name") ?? "",
          this.mapData?.id ?? "library",
        );

        // speaker 说话
        this.showAgentBubble(speaker.agentId, line);

        // 对方 1.2s 后回复
        const replyLine = getDialogue(
          listener.getData("name") ?? "",
          speaker.getData("name") ?? "",
          this.mapData?.id ?? "library",
        );
        this.time.delayedCall(1200, () => {
          this.showAgentBubble(listener.agentId, replyLine);
        });

        return; // 每次扫描只触发一对对话
      }
    }
  }

  /* ================================================================
   * 可通行判定
   * ================================================================ */

  /** 某 tile 是否已被其他 Agent 占据 */
  private isOccupiedByOther(selfId: string, tx: number, ty: number): boolean {
    for (const [id, sprite] of this.agentSprites) {
      if (id === selfId) continue;
      if (sprite.tileX === tx && sprite.tileY === ty) return true;
    }
    return false;
  }

  /** 某 tile 是否可放置 Agent（非墙壁/非门） */
  private isWalkable(tx: number, ty: number): boolean {
    if (!this.wallMap.length) return true; // 无墙壁数据（室外场景）
    const row = this.wallMap[ty];
    if (!row) return true;
    return row[tx] < 0; // -1 = 无墙壁
  }

  /** 从不可通行的 (tx,ty) 向外搜索最近的可通行 tile */
  private nearestWalkable(tx: number, ty: number, W: number, H: number): [number, number] {
    for (let d = 1; d < Math.max(W, H); d++) {
      for (let dx = -d; dx <= d; dx++) {
        for (const dy of [-d, d]) {
          const nx = tx + dx;
          const ny = ty + dy;
          if (nx >= 0 && nx < W && ny >= 0 && ny < H && this.isWalkable(nx, ny)) {
            return [nx, ny];
          }
        }
      }
      for (let dy = -d + 1; dy <= d - 1; dy++) {
        for (const dx of [-d, d]) {
          const nx = tx + dx;
          const ny = ty + dy;
          if (nx >= 0 && nx < W && ny >= 0 && ny < H && this.isWalkable(nx, ny)) {
            return [nx, ny];
          }
        }
      }
    }
    return [tx, ty]; // fallback
  }

  /* ================================================================
   * 清理
   * ================================================================ */

  private destroyScene(): void {
    // 停止天气动画
    this.weatherTweens.forEach((t) => t.stop());
    this.weatherTweens = [];

    // 销毁自主移动器 + Agent 精灵
    this.movers.forEach((m) => m.destroy());
    this.movers.clear();
    this.agentSprites.forEach((s) => s.destroy());
    this.agentSprites.clear();

    // 销毁物品对象
    this.itemObjects.forEach((o) => o.destroy());
    this.itemObjects = [];

    // 销毁 tilemap 图层
    if (this.groundLayer) {
      this.groundLayer.destroy();
      this.groundLayer = null;
    }
    if (this.tilemap) {
      this.tilemap.destroy();
      this.tilemap = null;
    }
  }
}
