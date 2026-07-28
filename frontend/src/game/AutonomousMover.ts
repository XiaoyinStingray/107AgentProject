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
 * 自主移动器 — 每个 Agent 实例化一个。
 *
 * 行为循环：
 *   1. 按 interval 随机调度下次移动
 *   2. decideTarget() 在 maxRange 内选随机可通行 tile
 *   3. moveToTile() 执行移动动画
 *   4. 循环
 */
export class AutonomousMover {
  private sprite: AgentSprite;
  private profile: MovementProfile;
  private scene: Phaser.Scene;
  private timer: Phaser.Time.TimerEvent | null = null;
  private active = false;

  /**
   * @param sprite   要驱动的 Agent 精灵
   * @param scene    Phaser 场景（用于 timer + tweens）
   * @param profile  移动行为配置（可选，默认从 agentId 查表）
   * @param isWalkable  可通行判定函数
   * @param mapBounds  地图宽高 {w, h}
   */
  constructor(
    sprite: AgentSprite,
    scene: Phaser.Scene,
    profile?: MovementProfile,
    private isWalkable: (tx: number, ty: number) => boolean = () => true,
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

    // 动画移动
    this.sprite.action = "walk";
    const px = target.tx * 64 + 32;
    const py = target.ty * 64 + 32;
    this.scene.tweens.add({
      targets: this.sprite,
      x: px, y: py,
      duration: 350,
      ease: "Sine.easeInOut",
      onComplete: () => {
        this.sprite.tileX = target.tx;
        this.sprite.tileY = target.ty;
        this.sprite.setAction("idle");
      },
    });
  }

  /**
   * 决定移动目标。
   * 当前策略：在 maxRange 内随机选可通行 tile。
   * 后续可 override 为：走向物品、走向其他 Agent、避开人群等。
   */
  private decideTarget(): { tx: number; ty: number } | null {
    const { tileX: ox, tileY: oy } = this.sprite;
    const { w, h } = this.mapBounds;
    const range = this.profile.maxRange;

    // 尝试 maxRange^2 次随机采样
    for (let attempt = 0; attempt < 20; attempt++) {
      const tx = ox + Math.floor(Math.random() * (range * 2 + 1)) - range;
      const ty = oy + Math.floor(Math.random() * (range * 2 + 1)) - range;
      if (tx < 0 || tx >= w || ty < 0 || ty >= h) continue;
      if (tx === ox && ty === oy) continue;
      if (!this.isWalkable(tx, ty)) continue;
      return { tx, ty };
    }
    return null;
  }

  /** 销毁，释放定时器 */
  destroy(): void {
    this.stop();
  }
}
