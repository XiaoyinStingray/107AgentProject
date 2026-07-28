import Phaser from "phaser";
import { generateAllTextures } from "../tileset";
import { generateAvatarTexture } from "../avatars";

/**
 * BootScene — 生成所有程序化贴图 → 跳转 MapScene。
 * 零外部资源加载，所有纹理在 create() 中 Canvas 生成。
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "BootScene" });
  }

  async create(): Promise<void> {
    await Promise.all([
      generateAllTextures(this),
      generateAvatarTexture(this),
    ]);
    this.scene.start("MapScene", { mapId: "library" });
  }
}
