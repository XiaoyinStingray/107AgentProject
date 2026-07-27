import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { MapScene } from "./scenes/MapScene";

const TILE = 32;
const COLS = 12;
const ROWS = 8;
const W = COLS * TILE; // 384
const H = ROWS * TILE; // 256

interface Props {
  mapId: string;
}

/**
 * React-Phaser 桥接组件。
 * Phaser Scale.FIT 自动填满容器，pixelArt 保证清晰缩放。
 */
export default function GameCanvas({ mapId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const prevMapRef = useRef<string>("");

  // 初始化 Phaser（仅一次）
  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      width: W,
      height: H,
      parent: containerRef.current,
      backgroundColor: "#1a1a2e",
      scene: [BootScene, MapScene],
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      render: {
        pixelArt: true,
        antialias: false,
        roundPixels: true,
      },
      input: false as unknown as Phaser.Types.Core.InputConfig,
    };

    const game = new Phaser.Game(config);
    gameRef.current = game;

    return () => {
      game.destroy(true);
      gameRef.current = null;
    };
  }, []);

  // 切换场景
  useEffect(() => {
    if (!gameRef.current || mapId === prevMapRef.current) return;
    prevMapRef.current = mapId;

    const mapScene = gameRef.current.scene.getScene("MapScene") as MapScene | null;
    if (mapScene && mapScene.scene.isActive()) {
      mapScene.loadMap(mapId);
    }
  }, [mapId]);

  return (
    <div
      ref={containerRef}
      className="w-full flex items-center justify-center"
      style={{ minHeight: 620 }}
    />
  );
}
