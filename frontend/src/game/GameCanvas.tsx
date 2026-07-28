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
  onAgentDoubleClick?: (agentId: string) => void;
  onGameReady?: (game: Phaser.Game) => void;
}

/**
 * React-Phaser 桥接组件。
 * agents prop 变更 → MapScene.setAgents()
 * Phaser 交互事件 → onAgentClick / onAgentMove → React
 */
export default function GameCanvas({ mapId, agents, onAgentClick, onAgentMove, onAgentDoubleClick, onGameReady }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const prevMapRef = useRef<string>("");
  const cbRef = useRef({ onAgentClick, onAgentMove, onAgentDoubleClick });
  cbRef.current = { onAgentClick, onAgentMove, onAgentDoubleClick };

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
    // registry 桥接初始数据 → MapScene.create() 消费
    game.registry.set("pendingMapId", mapId);
    game.registry.set("pendingAgents", agents);
    onGameReady?.(game);

    // 监听 MapScene 发出的交互事件
    game.events.on("agent-clicked", (agentId: string) => {
      cbRef.current.onAgentClick?.(agentId);
    });
    game.events.on("agent-moved", (agentId: string, tx: number, ty: number) => {
      cbRef.current.onAgentMove?.(agentId, tx, ty);
    });
    game.events.on("agent-doubleclicked", (agentId: string) => {
      cbRef.current.onAgentDoubleClick?.(agentId);
    });

    return () => {
      game.destroy(true);
      gameRef.current = null;
    };
  }, []);

  // 切换场景 → 更新 registry（MapScene 内部读取）
  useEffect(() => {
    if (!gameRef.current || mapId === prevMapRef.current) return;
    prevMapRef.current = mapId;
    gameRef.current.registry.set("pendingMapId", mapId);
    gameRef.current.registry.set("pendingAgents", agents);
    const ms = gameRef.current.scene.getScene("MapScene") as MapScene | null;
    if (ms) ms.loadMap(mapId);
  }, [mapId]);

  // Agent 变化 → 更新 registry + 直推（场景如果就绪）
  useEffect(() => {
    if (!gameRef.current) return;
    gameRef.current.registry.set("pendingAgents", agents);
    const ms = gameRef.current.scene.getScene("MapScene") as MapScene | null;
    if (ms) ms.setAgents(agents);
  }, [agents]);

  return (
    <div
      ref={containerRef}
      className="w-full flex items-center justify-center"
      style={{ minHeight: 620 }}
    />
  );
}
