import Phaser from "phaser";
import { AgentSprite } from "./sprites/AgentSprite";

/**
 * 自主移动行为配置。
 * 后续可从后端 Agent 人格数据生成，目前按 agentId 映射。
 */
export interface MovementProfile {
  /** 移动间隔范围（ms） */
  intervalMin: number;
  intervalMax: number;
  /** 每次移动最大 tile 范围 */
  maxRange: number;
  /** 不移动的概率（0-1），越高越懒 */
  idleChance: number;
}

/**
 * 性格 → 移动模式映射。
 * 后续 66-S 可从 Agent 人格 OCEAN 数据推导。
 */
const PROFILES: Record<string, MovementProfile> = {
  "agent-1": { intervalMin: 10000, intervalMax: 16000, maxRange: 2, idleChance: 0.5 },  // 小林 INTJ 宅
  "agent-2": { intervalMin: 5000,  intervalMax: 9000,  maxRange: 3, idleChance: 0.15 }, // 小红 ENFP 活跃
  "agent-3": { intervalMin: 6000,  intervalMax: 11000, maxRange: 3, idleChance: 0.25 }, // 小刚 ESTJ 巡视
  "agent-4": { intervalMin: 8000,  intervalMax: 14000, maxRange: 2, idleChance: 0.35 }, // 小雪 INFP 慢悠悠
  "agent-5": { intervalMin: 4000,  intervalMax: 8000,  maxRange: 3, idleChance: 0.1  }, // 阿杰 ENTP 最闹
};

function defaultProfile(): MovementProfile {
  return { intervalMin: 6000, intervalMax: 12000, maxRange: 3, idleChance: 0.3 };
}

/**
 * 物品位置信息（由 MapScene 注入）
 */
export interface ItemPosition {
  type: string;
  tileX: number;
  tileY: number;
}

/**
 * 自主移动器 — 每个 Agent 实例化一个。
 *
 * 行为循环（66-S 升级）：
 *   1. 按 interval 随机调度下次移动
 *   2. decideTarget() 混合三种策略：
 *      a. 物品寻求（30%）— 走向最近的物品
 *      b. 社交接近（25%）— 走向最近的 Agent
 *      c. 随机漫游（45%）— 在 maxRange 内随机走
 *   3. Emotion 影响：angry→快速、sad/tired→缓慢
 *   4. 循环
 */
export class AutonomousMover {
  private sprite: AgentSprite;
  private profile: MovementProfile;
  private scene: Phaser.Scene;
  private timer: Phaser.Time.TimerEvent | null = null;
  private active = false;

  /** 66-S: 物品位置列表（由 MapScene 定时更新） */
  private items: ItemPosition[] = [];
  /** 66-S: 获取其他 Agent 的位置（回调，避免循环引用） */
  private getOtherAgents: (() => Array<{ agentId: string; tileX: number; tileY: number }>) | null = null;

  /**
   * @param sprite   要驱动的 Agent 精灵
   * @param scene    Phaser 场景（用于 timer + tweens）
   * @param profile  移动行为配置（可选，默认从 agentId 查表）
   * @param isWalkable  可通行判定函数
   * @param isOccupied  重叠检测函数
   * @param mapBounds  地图宽高 {w, h}
   */
  constructor(
    sprite: AgentSprite,
    scene: Phaser.Scene,
    profile?: MovementProfile,
    private isWalkable: (tx: number, ty: number) => boolean = () => true,
    private isOccupied: (tx: number, ty: number) => boolean = () => false,
    private mapBounds: { w: number; h: number } = { w: 12, h: 8 },
  ) {
    this.sprite = sprite;
    this.scene = scene;
    this.profile = profile ?? PROFILES[sprite.agentId] ?? defaultProfile();
  }

  /** 启动自主移动 */
  start(): void {
    if (this.active) return;
    this.active = true;
    this.scheduleNext();
  }

  /** 停止自主移动 */
  stop(): void {
    this.active = false;
    this.timer?.destroy();
    this.timer = null;
  }

  /** 更新配置（供后续动态调整） */
  updateProfile(profile: Partial<MovementProfile>): void {
    this.profile = { ...this.profile, ...profile };
  }

  /** 66-S: 更新场景物品列表 */
  setItems(items: ItemPosition[]): void {
    this.items = items;
  }

  /** 66-S: 设置获取其他 Agent 位置的回调 */
  setAgentLookup(fn: () => Array<{ agentId: string; tileX: number; tileY: number }>): void {
    this.getOtherAgents = fn;
  }

  /* ================================================================
   * 内部
   * ================================================================ */

  private scheduleNext(): void {
    if (!this.active) return;
    const delay = this.profile.intervalMin +
      Math.random() * (this.profile.intervalMax - this.profile.intervalMin);
    this.timer = this.scene.time.delayedCall(delay, () => {
      this.tick();
      this.scheduleNext();
    });
  }

  private tick(): void {
    // 概率跳过
    if (Math.random() < this.profile.idleChance) return;
    // 正在拖拽中不抢移动
    if (this.sprite.action === "walk") return;

    const target = this.decideTarget();
    if (!target) return;

    // ── 66-S: 情绪影响移动速度 ──
    let duration = 350;
    switch (this.sprite.emotion) {
      case "angry":   duration = 220; break; // 快速
      case "excited": duration = 260; break;
      case "anxious": duration = 280; break;
      case "sad":     duration = 450; break; // 缓慢
      case "tired":   duration = 500; break; // 最慢
      case "confused":duration = 320; break; // 犹豫
    }

    // 动画移动
    this.sprite.action = "walk";
    const px = target.tx * 64 + 32;
    const py = target.ty * 64 + 32;
    this.scene.tweens.add({
      targets: this.sprite,
      x: px, y: py,
      duration,
      ease: "Sine.easeInOut",
      onComplete: () => {
        if (!this.scene || !this.active) return;
        this.sprite.tileX = target.tx;
        this.sprite.tileY = target.ty;
        this.sprite.setAction("idle");
        this.scene.game.events.emit("agent-moved", this.sprite.agentId, target.tx, target.ty);
      },
    });
  }

  /**
   * 决定移动目标 — 66-S 混合策略。
   *
   * 权重分配（按 Agent 人格可调）：
   *   - 物品寻求 25%：走向最近物品
   *   - 社交接近 40%：走向最近其他 Agent（提高，促进对话触发）
   *   - 随机漫游 35%：在 maxRange 内随机走
   */
  private decideTarget(): { tx: number; ty: number } | null {
    const roll = Math.random();

    // ── 25%: 物品寻求 ──
    if (roll < 0.25 && this.items.length > 0) {
      const target = this.seekNearestItem();
      if (target) return target;
    }

    // ── 40%: 社交接近（优先于随机漫游）──
    if (roll < 0.65 && this.getOtherAgents) {
      const others = this.getOtherAgents()
        .filter((a) => a.agentId !== this.sprite.agentId);
      if (others.length > 0) {
        const target = this.seekNearestAgent(others);
        if (target) return target;
      }
    }

    // ── 35%: 随机漫游 ──
    return this.randomWander();
  }

  /** 社交接近的搜索范围（tile），超过则随机漫游。66-S: 从 maxRange 扩大至全图 */
  private seekNearestAgent(
    others: Array<{ agentId: string; tileX: number; tileY: number }>,
  ): { tx: number; ty: number } | null {
    const { tileX: ox, tileY: oy } = this.sprite;
    const { w, h } = this.mapBounds;

    // 找全图最近的 Agent（不限距离）
    let best: { tileX: number; tileY: number } | null = null;
    let bestDist = Infinity;
    for (const o of others) {
      const dist = Math.abs(ox - o.tileX) + Math.abs(oy - o.tileY);
      if (dist < bestDist && dist >= 2) { // 不贴太近
        bestDist = dist;
        best = o;
      }
    }
    if (!best) return null;

    // 走向对方方向 1-3 tile
    const dx = Math.sign(best.tileX - ox);
    const dy = Math.sign(best.tileY - oy);
    const step = Math.min(3, Math.max(1, Math.floor(bestDist / 2)));
    for (let s = step; s >= 1; s--) {
      const tx = ox + dx * s;
      const ty = oy + dy * s;
      if (tx >= 0 && tx < w && ty >= 0 && ty < h &&
          this.isWalkable(tx, ty) && !this.isOccupied(tx, ty)) {
        return { tx, ty };
      }
    }
    return null;
  }

  /** 66-S: 走向最近物品的相邻 tile */
  private seekNearestItem(): { tx: number; ty: number } | null {
    const { tileX: ox, tileY: oy } = this.sprite;
    const { w, h } = this.mapBounds;
    const range = this.profile.maxRange;

    // 找范围内最近的物品
    let best: ItemPosition | null = null;
    let bestDist = Infinity;
    for (const item of this.items) {
      const dist = Math.abs(ox - item.tileX) + Math.abs(oy - item.tileY);
      if (dist <= range && dist < bestDist) {
        bestDist = dist;
        best = item;
      }
    }
    if (!best || bestDist <= 1) return null; // 已在物品旁边

    // 走向物品方向 1-2 tile
    const dx = Math.sign(best.tileX - ox);
    const dy = Math.sign(best.tileY - oy);
    const step = Math.min(2, Math.max(1, Math.floor(bestDist / 2)));
    for (let s = step; s >= 1; s--) {
      const tx = ox + dx * s;
      const ty = oy + dy * s;
      if (tx >= 0 && tx < w && ty >= 0 && ty < h &&
          this.isWalkable(tx, ty) && !this.isOccupied(tx, ty)) {
        return { tx, ty };
      }
    }
    return null;
  }

  /** 在 maxRange 内随机选可通行 tile（原逻辑） */
  private randomWander(): { tx: number; ty: number } | null {
    const { tileX: ox, tileY: oy } = this.sprite;
    const { w, h } = this.mapBounds;
    const range = this.profile.maxRange;

    for (let attempt = 0; attempt < 20; attempt++) {
      const tx = ox + Math.floor(Math.random() * (range * 2 + 1)) - range;
      const ty = oy + Math.floor(Math.random() * (range * 2 + 1)) - range;
      if (tx < 0 || tx >= w || ty < 0 || ty >= h) continue;
      if (tx === ox && ty === oy) continue;
      if (!this.isWalkable(tx, ty)) continue;
      if (this.isOccupied(tx, ty)) continue;
      return { tx, ty };
    }
    return null;
  }

  /** 销毁，释放定时器 */
  destroy(): void {
    this.stop();
  }
}
