import Phaser from "phaser";
import { ITEM_FRAME, DECOR_FRAME, WALL_DECOR_FRAME, BG_FRAME, FG_FRAME } from "../tileset";
import { AgentSprite, AgentSpriteData } from "../sprites/AgentSprite";
import { getDialogue, fetchDialogue } from "../dialogue";
import { AutonomousMover } from "../AutonomousMover";
import { emotionEngine, RANDOM_EVENTS } from "../emotion/EmotionEngine";
import type { EmotionChange, SceneEvent } from "../emotion/EmotionEngine";
import { playbackQueue } from "../audio/DialoguePlaybackQueue";
import type { Emotion } from "../sprites/AgentSprite";

/* ── 多轮对话会话 66-S ── */
interface ConversationSession {
  a: AgentSprite;
  b: AgentSprite;
  nameA: string;
  nameB: string;
  totalRounds: number;     // 2-4
  currentRound: number;    // 0-based
  context: string[];       // 之前轮次的消息（LLM 上下文）
  timer: Phaser.Time.TimerEvent | null;
}

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
  private bgImage: Phaser.GameObjects.Image | null = null;
  private fgImages: Phaser.GameObjects.Image[] = [];
  private weatherTweens: Phaser.Tweens.Tween[] = [];
  private agentSprites: Map<string, AgentSprite> = new Map();
  private pendingAgents: AgentSpriteData[] | null = null;
  private wallMap: number[][] = [];  // 墙壁占位 map，0=可通行
  private dialogueCooldowns: Map<string, number> = new Map();
  private dialogueTimer: Phaser.Time.TimerEvent | null = null;
  private movers: Map<string, AutonomousMover> = new Map();
  private ready = false;
  // 66-S: 多轮对话会话
  private activeSessions: Map<string, ConversationSession> = new Map();
  private busyAgents: Set<string> = new Set();

  constructor() {
    super({ key: "MapScene" });
  }

  /* ================================================================
   * 生命周期
   * ================================================================ */

  create(): void {
    this.input.dragDistanceThreshold = 8;
    this.ready = true;
    this.game.events.on("agent-whisper", (agentId: string) => {
      const sprite = this.agentSprites.get(agentId);
      if (!sprite) return;
      this.tweens.add({
        targets: sprite, alpha: 0.5, duration: 120, yoyo: true, repeat: 2,
      });
    });
    this.startDialogueScanner();

    // ── EmotionEngine 66-S ──
    emotionEngine.onEmotionChange((changes: EmotionChange[]) => {
      changes.forEach((c) => {
        const sprite = this.agentSprites.get(c.agentId);
        if (!sprite) return;
        // 只在情绪类型变化 + 有足够强度时才触发视觉特效
        if (sprite.emotion !== c.emotion) {
          sprite.setEmotion(c.emotion);
        }
        // 随机事件触发全员可见反应
        if (c.trigger === "random" && c.intensity >= 2) {
          this.showAgentBubble(c.agentId, "");
          // 触发粒子爆发
          import("../sprites/AgentSprite").then(() => {
            import("../effects/EmoteBurst").then(({ emoteBurst }) => {
              emoteBurst(this, sprite.x, sprite.y, c.emotion, c.agentId);
            });
          });
        }
      });
    });
    emotionEngine.onRandomEvent((event: SceneEvent) => {
      this.showEventNotification(event);
      // 全员事件 → 每个 Agent 头顶短暂闪一下
      if (event.target === "all") {
        this.agentSprites.forEach((sprite) => {
          this.tweens.add({
            targets: sprite, alpha: 0.4, duration: 150, yoyo: true,
            onComplete: () => sprite.setAlpha(1),
          });
        });
      }
    });

    // 从 GameCanvas registry 读取初始数据（绕过 getScene 时序问题）
    const agents = this.game.registry.get("pendingAgents") as AgentSpriteData[] | undefined;
    if (agents?.length) this.pendingAgents = agents;
    const mapId = (this.game.registry.get("pendingMapId") as string) || "library";

    if (this.mapData) {
      this.buildScene();
    } else {
      this.loadMap(mapId);
    }
  }

  shutdown(): void {
    this.game.events.off("agent-whisper");
    this.dialogueTimer?.destroy();
    this.dialogueCooldowns.clear();
    // 清理活跃会话
    for (const [key, s] of this.activeSessions) {
      s.timer?.destroy();
      this.busyAgents.delete(s.a.agentId);
      this.busyAgents.delete(s.b.agentId);
    }
    this.activeSessions.clear();
    emotionEngine.stop();
    // 66-A: 清空音频队列（场景切换/卸载不残留声音）
    playbackQueue.clear();
    this.destroyScene();
  }

  /* ================================================================
   * 场景加载
   * ================================================================ */

  loadMap(mapId: string): void {
    this.destroyScene();
    emotionEngine.setScene(mapId);

    import(`../../data/scenes/${mapId}.json`)
      .then((m) => {
        this.mapData = (m.default ?? m) as MapData;
        if (this.ready) this.buildScene();
      })
      .catch((err) => {
        console.error(`[MapScene] 加载场景失败: ${mapId}`, err);
      });
  }

  /* ================================================================
   * 场景构建
   * ================================================================ */

  private buildScene(): void {
    if (this.groundLayer) return;
    const d = this.mapData;
    if (!d) return;

    const W = d.width;
    const H = d.height;

    // 0. 背景层 — 场景专属 tileable 墙纸
    if (this.textures.exists("backgrounds")) {
      const bgFrame = BG_FRAME[d.id] ?? 0;
      this.bgImage = this.add.image(W * TILE_S / 2, H * TILE_S / 2, "backgrounds", bgFrame)
        .setDisplaySize(W * TILE_S, H * TILE_S).setDepth(-1);
    }

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

    // 3.5 装饰层（地板花纹 + 墙面挂饰）
    this.placeDecors(d);

    // 4. 天气
    if (d.weather === "sakura" || d.weather === "rain") {
      this.startWeather(d.weather, W, H);
    }

    // 5. Agent 精灵 — 始终消费 pending（修复 BUG-023）
    const agents = this.pendingAgents ?? [];
    this.pendingAgents = null;
    if (agents.length > 0) this.placeAgents(agents);

    // 6. 前景层 — 覆盖在 Agent 上方（吊灯影、树冠等）
    const fgs = (d as any).foregrounds as Array<{ type: string; tileX: number; tileY: number }> | undefined;
    this.fgImages = [];
    if (fgs?.length && this.textures.exists("foregrounds")) {
      fgs.forEach((fg) => {
        const cfg = FG_FRAME[fg.type];
        if (cfg === undefined) return;
        const cx = fg.tileX * TILE_S + TILE_S / 2;
        const cy = fg.tileY * TILE_S + TILE_S / 2;
        const img = this.add.image(cx, cy, "foregrounds", cfg).setAlpha(0.35).setDepth(20);
        this.fgImages.push(img);
      });
    }
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

  /** 放置地板装饰 + 墙面挂饰 */
  private placeDecors(d: MapData): void {
    const decors = (d as any).decors as Array<{ type: string; tileX: number; tileY: number }> | undefined;
    if (!decors?.length) return;

    decors.forEach((item) => {
      const cx = item.tileX * TILE_S + TILE_S / 2;
      const cy = item.tileY * TILE_S + TILE_S / 2;
      const frame = DECOR_FRAME[item.type] ?? WALL_DECOR_FRAME[item.type];
      if (frame !== undefined && this.textures.exists("decors")) {
        const sprite = this.add.image(cx, cy, "decors", frame).setDepth(3);
        this.itemObjects.push(sprite);
      }
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
   * 导演模式（Step 66）— 天气 + 广播
   * ================================================================ */

  setWeather(type: string): void {
    if (!this.mapData) return;
    this.mapData.weather = type as any;
    this.weatherTweens.forEach((t) => t.stop());
    this.weatherTweens = [];
    if (type === "sakura" || type === "rain") {
      this.startWeather(type, this.mapData.width, this.mapData.height);
    }
  }

  getWeather(): string { return this.mapData?.weather ?? "clear"; }

  private _lastMoodAll = 0;
  /** 全员氛围 — 直改 sprite + 500ms 防抖 */
  setAllEmotions(emotion: string): void {
    if (Date.now() - this._lastMoodAll < 500) return;
    this._lastMoodAll = Date.now();
    this.agentSprites.forEach((s) => s.setEmotion(emotion as any));
  }

  /**
   * 增量更新 Agent 精灵（不销毁未变化的 sprite）。
   * 与 placeAgents（全量重建）互补——placeAgents 用于初始化/场景切换，
   * 此方法用于 React state 同步时避免重建卡顿。
   */
  syncAgentsInPlace(data: AgentSpriteData[]): void {
    const incoming = new Map(data.map((d) => [d.agentId, d]));
    // 移除不在新数据中的 sprite
    for (const [id, sprite] of this.agentSprites) {
      if (!incoming.has(id)) {
        sprite.destroy();
        this.agentSprites.delete(id);
        this.movers.get(id)?.destroy();
        this.movers.delete(id);
      }
    }
    // 更新/新增
    for (const d of data) {
      // 66-S: 新 Agent 注册到情绪引擎
      if (!this.agentSprites.has(d.agentId)) {
        emotionEngine.registerAgent(d.agentId, d.name);
      }
      const existing = this.agentSprites.get(d.agentId);
      if (existing) {
        // sprite 位置是实时真值，不从 React state 覆写
        if (existing.emotion !== d.emotion) existing.setEmotion(d.emotion as any);
        if (existing.action !== d.action) existing.setAction(d.action as any);
      } else {
        const sprite = new AgentSprite(this, d);
        sprite.setData("name", d.name);
        this.agentSprites.set(d.agentId, sprite);
        const mover = new AutonomousMover(sprite, this, undefined,
          (tx, ty) => this.isWalkable(tx, ty),
          (tx, ty) => this.isOccupiedByOther(d.agentId, tx, ty),
          { w: this.mapData?.width ?? 16, h: this.mapData?.height ?? 12 },
        );
        // 66-S: 注入物品 + Agent 位置
        mover.setItems((this.mapData?.items ?? []).map((it) => ({ type: it.type, tileX: it.tileX, tileY: it.tileY })));
        mover.setAgentLookup(() =>
          [...this.agentSprites.entries()].map(([id, s]) => ({ agentId: id, tileX: s.tileX, tileY: s.tileY })),
        );
        if (!this.paused) mover.start();
        this.movers.set(d.agentId, mover);
        this.setupAgentInteraction(sprite, d);
      }
    }
  }

  broadcastGodVoice(message: string): void {
    this.agentSprites.forEach((sprite) => {
      import("../sprites/ActionBubble").then(({ ActionBubble }) => {
        const b = new ActionBubble(this, message);
        b.show(sprite);
      });
    });
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
    // 66-A: 暂停音频播放
    playbackQueue.pause();
  }

  resumeSimulation(): void {
    if (!this.paused) return;
    this.paused = false;
    this.movers.forEach((m) => m.start());
    if (this.dialogueTimer) this.dialogueTimer.paused = false;
    // 66-A: 恢复音频播放
    playbackQueue.resume();
  }

  /* ================================================================
   * Agent 精灵管理
   * ================================================================ */

  /** 设置/更新全部 Agent 精灵（从 React prop 同步） */
  setAgents(data: AgentSpriteData[]): void {
    this.pendingAgents = data;
    if (this.ready && this.groundLayer) {
      // 已有精灵 → 增量更新；首次 → 全量创建
      if (this.agentSprites.size > 0) {
        this.syncAgentsInPlace(data);
      } else {
        this.placeAgents(data);
      }
    }
  }

  /** 获取指定 Agent 的精灵（供外部调用 showBubble 等） */
  getAgentSprite(agentId: string): AgentSprite | undefined {
    return this.agentSprites.get(agentId);
  }

  /** 显示 Agent 头顶气泡（直接模式，用于非对话通知） */
  showAgentBubble(agentId: string, message: string): void {
    if (!message) return;
    const sprite = this.agentSprites.get(agentId);
    if (!sprite) return;
    import("../sprites/ActionBubble").then(({ ActionBubble }) => {
      const bubble = new ActionBubble(this, message);
      bubble.show(sprite);
    });
  }

  /**
   * 66-A: 通过串行队列播放对话（气泡 + 拟声）。
   * 替代直接 showAgentBubble，保证：无重叠、分页完整、音频伴音。
   */
  private queueDialogue(
    agentId: string,
    text: string,
    emotion: Emotion,
    onDone?: () => void,
  ): void {
    const sprite = this.agentSprites.get(agentId);
    if (!sprite) { onDone?.(); return; }

    // 跟踪当前活跃气泡（分页更新用）
    let activeBubble: any = null;

    playbackQueue.enqueue({
      agentId,
      name: sprite.getData("name") ?? "",
      text,
      emotion,
      onBubble: (pageText: string, _agentId: string, isFirst: boolean) => {
        if (isFirst || !activeBubble) {
          // 第一页：新建气泡
          import("../sprites/ActionBubble").then(({ ActionBubble }) => {
            const bubble = new ActionBubble(this, pageText);
            bubble.show(sprite);
            activeBubble = bubble;
          });
        } else {
          // 后续页：更新现有气泡文字
          if (activeBubble?.setText) {
            activeBubble.setText(pageText);
          }
        }
      },
      onDone: () => {
        activeBubble = null;
        onDone?.();
      },
    });
  }

  private dragStartX = 0;
  private dragStartY = 0;
  private readonly DRAG_THRESHOLD = 8; // px，小于此值=点击，大于=拖拽

  private placeAgents(data: AgentSpriteData[]): void {
    // 清除旧精灵
    this.agentSprites.forEach((s) => s.destroy());
    this.agentSprites.clear();

    // 66-S: 注册 Agent 到情绪引擎 + 启动情绪循环
    data.forEach((d) => emotionEngine.registerAgent(d.agentId, d.name));
    emotionEngine.setScene(this.mapData?.id ?? "library");
    emotionEngine.stop(); // 重置定时器
    emotionEngine.start();

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
        { w: this.mapData?.width ?? 16, h: this.mapData?.height ?? 12 },
      );
      // 66-S: 注入物品位置 + Agent 位置查询
      mover.setItems((this.mapData?.items ?? []).map((it) => ({ type: it.type, tileX: it.tileX, tileY: it.tileY })));
      mover.setAgentLookup(() =>
        [...this.agentSprites.entries()].map(([id, s]) => ({ agentId: id, tileX: s.tileX, tileY: s.tileY })),
      );
      if (!this.paused) mover.start();
      this.movers.set(d.agentId, mover);

      this.setupAgentInteraction(sprite, d);
    });
  }

  /** 为 Agent sprite 设置点击/拖拽交互（placeAgents 和 syncAgentsInPlace 共用） */
  private setupAgentInteraction(sprite: AgentSprite, d: AgentSpriteData): void {
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
      const MW = (this.mapData?.width ?? 16) * TILE_S;
      const MH = (this.mapData?.height ?? 12) * TILE_S;
      sprite.x = Math.max(TILE_S / 2, Math.min(dragX, MW - TILE_S / 2));
      sprite.y = Math.max(TILE_S / 2, Math.min(dragY, MH - TILE_S / 2));
    });

    // 拖拽结束 → 吸附到最近可通行 tile + 重叠检查 + 通知 React
    sprite.on("dragend", () => {
      const W = this.mapData?.width ?? 16;
      const H = this.mapData?.height ?? 12;
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
  }

  /* ================================================================
   * Agent 对话引擎 — 66-S 多轮升级
   * ================================================================ */

  private static readonly SCAN_INTERVAL = 3000;  // 扫描间隔 ms
  private static readonly PROXIMITY = 5;         // 触发对话的 tile 距离
  private static readonly COOLDOWN = 8000;       // 同对冷却 ms
  private static readonly ROUND_DELAY = 1200;    // 每轮间隔 ms

  private startDialogueScanner(): void {
    this.dialogueTimer?.destroy();
    this.dialogueTimer = this.time.addEvent({
      delay: MapScene.SCAN_INTERVAL,
      loop: true,
      callback: () => this.scanAndDialogue(),
    });
  }

  private scanAndDialogue(): void {
    if (!this.scene.isActive()) return;
    const agents = [...this.agentSprites.values()];
    if (agents.length < 2) return;
    const now = Date.now();

    // ── 66-S: 物品接近检测 → 触发情绪 ──
    for (const sprite of agents) {
      this.checkItemProximity(sprite);
    }

    // 收集可对话的 pair（按距离排序，最近的优先）
    const eligible: Array<{ a: AgentSprite; b: AgentSprite; dist: number; pairKey: string }> = [];

    for (let i = 0; i < agents.length; i++) {
      for (let j = i + 1; j < agents.length; j++) {
        const a = agents[i];
        const b = agents[j];
        // 跳过正在对话的 Agent
        if (this.busyAgents.has(a.agentId) || this.busyAgents.has(b.agentId)) continue;

        const dist = Math.abs(a.tileX - b.tileX) + Math.abs(a.tileY - b.tileY);
        if (dist > MapScene.PROXIMITY) continue;

        const pairKey = [a.agentId, b.agentId].sort().join("|");
        const last = this.dialogueCooldowns.get(pairKey) ?? 0;
        if (now - last < MapScene.COOLDOWN) continue;

        eligible.push({ a, b, dist, pairKey });
      }
    }

    eligible.sort((x, y) => x.dist - y.dist);

    // 每次扫描最多启动 1 个新会话（已有多轮在进行中）
    for (const { a, b, dist, pairKey } of eligible) {
      if (this.activeSessions.size >= 1) break; // 同时最多 1 组对话
      this.dialogueCooldowns.set(pairKey, now);
      this.startConversationSession(a, b, dist);
      break;
    }
  }

  /** 启动多轮对话会话 */
  private startConversationSession(a: AgentSprite, b: AgentSprite, dist: number): void {
    const nameA: string = a.getData("name") ?? "?";
    const nameB: string = b.getData("name") ?? "?";
    const rounds = 2 + Math.floor(Math.random() * 3); // 2-4 轮
    const pairKey = [a.agentId, b.agentId].sort().join("|");

    // 标记忙碌
    this.busyAgents.add(a.agentId);
    this.busyAgents.add(b.agentId);

    // 暂停自主移动
    const ma = this.movers.get(a.agentId);
    const mb = this.movers.get(b.agentId);
    ma?.stop();
    mb?.stop();

    // 面对面
    a.setAction("talk");
    b.setAction("talk");

    const session: ConversationSession = {
      a, b, nameA, nameB,
      totalRounds: rounds,
      currentRound: 0,
      context: [],
      timer: null,
    };

    this.activeSessions.set(pairKey, session);

    // ── 社交共鸣 ──
    emotionEngine.onProximityCheck([{ a: a.agentId, b: b.agentId, dist }]);

    // 立即开始第一轮
    this.advanceConversation(pairKey);
  }

  /** 推进对话一轮（66-A: 通过串行队列播放） */
  private advanceConversation(sessionKey: string): void {
    const session = this.activeSessions.get(sessionKey);
    if (!session) return;

    const { a, b, nameA, nameB, totalRounds, currentRound, context } = session;
    const sceneId = this.mapData?.id ?? "library";
    const isEven = currentRound % 2 === 0;
    const [speaker, listener] = isEven ? [a, b] : [b, a];
    const [spkName, lstName] = isEven ? [nameA, nameB] : [nameB, nameA];

    // 异步取对话（LLM 优先 → mock 兜底）
    fetchDialogue(spkName, lstName, sceneId, context).then((result) => {
      if (!this.scene || !this.activeSessions.has(sessionKey)) return;

      const msg = result.message;
      context.push(msg);

      speaker.setAction("talk");
      listener.setAction("talk");

      // 情绪触发
      emotionEngine.onDialogue(speaker.agentId, msg);

      session.currentRound++;

      // 66-A: 通过串行队列播放（气泡分页 + 拟声），播放完毕后继续下一轮
      this.queueDialogue(
        speaker.agentId,
        msg,
        speaker.emotion ?? "neutral",
        () => {
          // 队列播完 → 继续下一轮或结束会话
          if (!this.activeSessions.has(sessionKey)) return;
          if (session.currentRound < totalRounds) {
            this.advanceConversation(sessionKey);
          } else {
            this.endConversationSession(sessionKey);
          }
        },
      );
    });
  }

  /** 结束对话会话，释放双方 Agent */
  private endConversationSession(sessionKey: string): void {
    const session = this.activeSessions.get(sessionKey);
    if (!session) return;

    const { a, b } = session;

    a.setAction("idle");
    b.setAction("idle");

    // 恢复自主移动
    const ma = this.movers.get(a.agentId);
    const mb = this.movers.get(b.agentId);
    if (!this.paused) {
      ma?.start();
      mb?.start();
    }

    // 稍微互相远离一步（可选：避免立刻又触发对话）
    this.stepApart(a, b);

    // 清理
    this.busyAgents.delete(a.agentId);
    this.busyAgents.delete(b.agentId);
    session.timer?.destroy();
    this.activeSessions.delete(sessionKey);
  }

  /** 对话结束后让双方各退一步（tween 动画，不瞬移） */
  private stepApart(a: AgentSprite, b: AgentSprite): void {
    const dx = a.tileX - b.tileX;
    const dy = a.tileY - b.tileY;
    const W = this.mapData?.width ?? 16;
    const H = this.mapData?.height ?? 12;

    // a 远离 b
    const txA = Math.max(0, Math.min(W - 1, a.tileX + (dx >= 0 ? 1 : -1)));
    const tyA = Math.max(0, Math.min(H - 1, a.tileY + (dy >= 0 ? 1 : -1)));
    if (this.isWalkable(txA, tyA) && !this.isOccupiedByOther(a.agentId, txA, tyA)) {
      a.action = "walk";
      this.tweens.add({
        targets: a,
        x: txA * TILE_S + TILE_S / 2,
        y: tyA * TILE_S + TILE_S / 2,
        duration: 250,
        ease: "Sine.easeInOut",
        onComplete: () => {
          if (!this.scene) return;
          a.tileX = txA; a.tileY = tyA;
          a.setAction("idle");
        },
      });
    }

    // b 远离 a
    const txB = Math.max(0, Math.min(W - 1, b.tileX + (dx >= 0 ? -1 : 1)));
    const tyB = Math.max(0, Math.min(H - 1, b.tileY + (dy >= 0 ? -1 : 1)));
    if (this.isWalkable(txB, tyB) && !this.isOccupiedByOther(b.agentId, txB, tyB)) {
      b.action = "walk";
      this.tweens.add({
        targets: b,
        x: txB * TILE_S + TILE_S / 2,
        y: tyB * TILE_S + TILE_S / 2,
        duration: 250,
        ease: "Sine.easeInOut",
        onComplete: () => {
          if (!this.scene) return;
          b.tileX = txB; b.tileY = tyB;
          b.setAction("idle");
        },
      });
    }
  }

  /** 66-S: 检测 Agent 是否靠近物品，触发物品情绪影响 */
  private checkItemProximity(sprite: AgentSprite): void {
    const items = this.mapData?.items;
    if (!items?.length) return;
    for (const item of items) {
      const dist = Math.abs(sprite.tileX - item.tileX) + Math.abs(sprite.tileY - item.tileY);
      if (dist <= 1) {
        emotionEngine.onNearItem(sprite.agentId, item.type);
        break; // 只触发一次
      }
    }
  }

  /** 66-S: 显示随机事件通知气泡 */
  private showEventNotification(event: SceneEvent): void {
    const W = (this.mapData?.width ?? 16) * TILE_S;
    // 顶部居中通知
    const text = this.add.text(W / 2, 40, event.text, {
      fontSize: "20px",
      fontFamily: "monospace",
      color: "#FFE082",
      backgroundColor: "rgba(0,0,0,0.75)",
      padding: { x: 16, y: 8 },
      align: "center",
    }).setOrigin(0.5).setDepth(50).setAlpha(0);

    this.tweens.add({
      targets: text,
      alpha: 1,
      y: 30,
      duration: 500,
      ease: "Back.easeOut",
      onComplete: () => {
        this.tweens.add({
          targets: text,
          alpha: 0,
          y: 10,
          duration: 800,
          delay: 2500,
          ease: "Sine.easeIn",
          onComplete: () => text.destroy(),
        });
      },
    });
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
    // 杀光所有 tween + timer（防止回调在 scene 销毁后触发）
    this.tweens.killAll();
    this.time.removeAllEvents();

    this.weatherTweens = [];
    this.movers.forEach((m) => m.destroy());
    this.movers.clear();
    this.agentSprites.forEach((s) => { try { s.destroy(); } catch { /* already gone */ } });
    this.agentSprites.clear();
    this.itemObjects.forEach((o) => { try { o.destroy(); } catch { /* already gone */ } });
    this.itemObjects = [];

    if (this.groundLayer) { this.groundLayer.destroy(); this.groundLayer = null; }
    if (this.tilemap) { this.tilemap.destroy(); this.tilemap = null; }
    if (this.bgImage) { this.bgImage.destroy(); this.bgImage = null; }
    this.fgImages.forEach((img) => { try { img.destroy(); } catch { /* already gone */ } });
    this.fgImages = [];
  }
}
