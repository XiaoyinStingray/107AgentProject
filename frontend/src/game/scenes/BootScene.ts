import Phaser from "phaser";
import { generateAvatarTexture } from "../avatars";
import { ACCESSORIES } from "../accessories";

/**
 * BootScene — 加载 tile spritesheet + Agent 头像 + 配饰。
 * 素材使用 AI 生成的 Retro Diffusion rd-tile 像素图。
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "BootScene" });
  }

  preload(): void {
    this.load.spritesheet("tiles", "assets/tiles.png", {
      frameWidth: 64, frameHeight: 64,
    });
    this.load.spritesheet("items", "assets/items.png", {
      frameWidth: 64, frameHeight: 64,
    });
    this.load.spritesheet("decors", "assets/decors.png", {
      frameWidth: 64, frameHeight: 64,
    });
    this.load.spritesheet("backgrounds", "assets/backgrounds.png", {
      frameWidth: 64, frameHeight: 64,
    });
    this.load.spritesheet("foregrounds", "assets/foregrounds.png", {
      frameWidth: 64, frameHeight: 64,
    });
    // 配饰 — 每个独立 PNG
    for (const a of ACCESSORIES) {
      this.load.image(`acc_${a.id}`, `assets/accessories/${a.id}.png`);
    }
  }

  async create(): Promise<void> {
    await generateAvatarTexture(this);
    this.scene.start("MapScene");
  }
}
