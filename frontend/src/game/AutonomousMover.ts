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
 * MBTI 维度 → 移动模式映射。
 * E/I → 活动频率, N/S → 探索范围, T/F+P/J → 行为倾向
 * 不使用硬编码 agentId，所有 Agent 按人格推导。
 */
const MBTI_PROFILES: Record<string, MovementProfile> = {
  // 内向思考型：低频、小范围、高发呆
  I_T_: { intervalMin: 9000, intervalMax: 16000, maxRange: 2, idleChance: 0.45 },
  // 内向感受型：中低频、小范围
  I_F_: { intervalMin: 7000, intervalMax: 13000, maxRange: 2, idleChance: 0.35 },
  // 外向思考型：高频、大范围
  E_T_: { intervalMin: 4000, intervalMax: 9000, maxRange: 3, idleChance: 0.15 },
  // 外向感受型：最高频、大范围
  E_F_: { intervalMin: 3500, intervalMax: 8000, maxRange: 3, idleChance: 0.1 },
  // 兜底
  _default: { intervalMin: 6000, intervalMax: 12000, maxRange: 3, idleChance: 0.3 },
};

function profileFromMBTI(mbti: string): MovementProfile {
  const key = (mbti.slice(0, 1) === "E" ? "E_" : "I_") + (["T", "F"].includes(mbti.slice(2, 3)) ? mbti.slice(2, 3) + "_" : "T_");
  return MBTI_PROFILES[key] ?? MBTI_PROFILES._default;
}

/** 旧 mock agent-1~5 的兼容映射（agentId→MBTI），新 Agent 不受影响 */
const FALLBACK_MBTI: Record<string, string> = {
  "agent-1": "INTJ", "agent-2": "ENFP", "agent-3": "ESTJ",
  "agent-4": "INFP", "agent-5": "ENTP",
};

function hashAgentId(id: string): number {
  let h = 5381;
  for (let i = 0; i < id.length; i++) h = ((h << 5) + h + id.charCodeAt(i)) | 0;
  return Math.abs(h);
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

  /** State 4 Step 81: SSE 驱动模式——外部命令队列 */
  private sseDriven = false;
  private commandQueue: Array<{ tileX: number; tileY: number }> = [];

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
    // 66-A: MBTI 推导移动模式，兼容旧 mock agentId
    if (profile) {
      this.profile = profile;
    } else {
      const mbtiHint = FALLBACK_MBTI[sprite.agentId];
      if (mbtiHint) {
        this.profile = profileFromMBTI(mbtiHint);
      } else {
        // 新 Agent：agentId hash → 偏 I 或偏 E → 选对应 profile
        const h = hashAgentId(sprite.agentId);
        const mbtiFake = h % 2 === 0 ? "INTJ" : "ENFP";
        this.profile = profileFromMBTI(mbtiFake);
      }
    }
  }

  /** 启动自主移动 */
  start(): void {
    if (this.active) return;
    this.active = true;
    if (this.commandQueue.length > 0 && this.sprite.action !== "walk") {
      this.executeNextCommand();
    }
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

  /** State 4 Step 81: 切换到 SSE 驱动模式——停止自主决策，只执行外部命令 */
  setSseDriven(enabled: boolean): void {
    this.sseDriven = enabled;
    if (enabled) {
      this.commandQueue = [];
      // 不停止 timer——保留作为 SSE 断线时的 fallback
    }
  }

  /** State 4 Step 81: 外部推送移动命令（来自 SSE move_to 事件） */
  pushCommand(tileX: number, tileY: number): void {
    this.commandQueue.push({ tileX, tileY });
    // 限制队列长度防堆积
    if (this.commandQueue.length > 5) {
      this.commandQueue = this.commandQueue.slice(-3);
    }
    // 立即尝试执行（如果当前不在移动中）
    if (this.active && this.sprite.action !== "walk") {
      this.executeNextCommand();
    }
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
    // 正在拖拽中不抢移动
    if (this.sprite.action === "walk") return;

    // State 4 Step 81: SSE 驱动模式——优先执行命令队列
    if (this.sseDriven && this.commandQueue.length > 0) {
      this.executeNextCommand();
      return;
    }

    // Fallback: 本地自主决策（SSE 断线或无命令时）
    if (Math.random() < this.profile.idleChance) return;

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

  /** State 4 Step 81: 执行下一个 SSE 命令 */
  private executeNextCommand(): void {
    const cmd = this.commandQueue.shift();
    if (!cmd) return;

    this.sprite.action = "walk";
    const px = cmd.tileX * 64 + 32;
    const py = cmd.tileY * 64 + 32;
    const duration = 300;
    this.scene.tweens.add({
      targets: this.sprite,
      x: px, y: py,
      duration,
      ease: "Sine.easeInOut",
      onComplete: () => {
        if (!this.scene || !this.active) return;
        this.sprite.tileX = cmd.tileX;
        this.sprite.tileY = cmd.tileY;
        this.sprite.setAction("idle");
        this.scene.game.events.emit("agent-moved", this.sprite.agentId, cmd.tileX, cmd.tileY);
        // 队列中还有命令则继续执行
        if (this.commandQueue.length > 0) {
          this.scene.time.delayedCall(100, () => this.executeNextCommand());
        }
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
