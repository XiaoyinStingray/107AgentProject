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
  onAgentClick?: (agentId: string) => void;
  onAgentMove?: (agentId: string, tileX: number, tileY: number) => void;
  onAgentRightClick?: (agentId: string) => void;
  onAgentDoubleClick?: (agentId: string) => void;
  onGameReady?: (game: Phaser.Game) => void;
}

/**
 * React-Phaser 桥接组件。
 * agents prop 变更 → MapScene.setAgents()
 * Phaser 交互事件 → onAgentClick / onAgentMove → React
 */
export default function GameCanvas({ mapId, agents, onAgentClick, onAgentMove, onAgentRightClick, onAgentDoubleClick, onGameReady }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const prevMapRef = useRef<string>("");
  const cbRef = useRef({ onAgentClick, onAgentMove, onAgentRightClick, onAgentDoubleClick });
  cbRef.current = { onAgentClick, onAgentMove, onAgentRightClick, onAgentDoubleClick };

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
      input: {
        keyboard: false,
        mouse: true,
        touch: true,
      },
    };

    const game = new Phaser.Game(config);
    gameRef.current = game;
    game.events.on("ready", () => onGameReady?.(game));

    // 监听 MapScene 发出的交互事件
    game.events.on("agent-clicked", (agentId: string) => {
      cbRef.current.onAgentClick?.(agentId);
    });
    game.events.on("agent-moved", (agentId: string, tx: number, ty: number) => {
      cbRef.current.onAgentMove?.(agentId, tx, ty);
    });
    game.events.on("agent-rightclicked", (agentId: string) => {
      cbRef.current.onAgentRightClick?.(agentId);
    });
    game.events.on("agent-doubleclicked", (agentId: string) => {
      cbRef.current.onAgentDoubleClick?.(agentId);
    });

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

  // 同步 Agent 数据
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
