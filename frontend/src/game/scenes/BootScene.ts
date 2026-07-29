import Phaser from "phaser";
import { generateAvatarTexture } from "../avatars";

/**
 * BootScene — 加载静态 tile spritesheet + 生成 Agent 头像。
 * Tile 素材使用 AI 生成的 Retro Diffusion rd-tile 像素图。
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
  }

  async create(): Promise<void> {
    await generateAvatarTexture(this);
    this.scene.start("MapScene");
  }
}
