import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { MapScene } from "./scenes/MapScene";
import type { AgentSpriteData } from "./sprites/AgentSprite";

const TILE = 64;
const COLS = 12;
const ROWS = 8;
const W = COLS * TILE; // 768
const H = ROWS * TILE; // 512

interface Props {
  mapId: string;
  agents: AgentSpriteData[];
}

/**
 * React-Phaser 桥接组件。
 * Phaser Scale.FIT 自动填满容器，pixelArt 保证清晰缩放。
 * agents prop 变更时同步到 MapScene。
 */
export default function GameCanvas({ mapId, agents }: Props) {
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
        pixelArt: false,
        antialias: true,
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
    if (mapScene) mapScene.loadMap(mapId);
  }, [mapId]);

  // 同步 Agent 数据（去除 isActive 检查——MapScene 内部有 pendingAgents 兜底）
  useEffect(() => {
    if (!gameRef.current) return;
    const mapScene = gameRef.current.scene.getScene("MapScene") as MapScene | null;
    if (mapScene) mapScene.setAgents(agents);
  }, [agents]);

  return (
    <div
      ref={containerRef}
      className="w-full flex items-center justify-center"
      style={{ minHeight: 620 }}
    />
  );
}
