import { useEffect, useRef, useCallback } from "react";
import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { MapScene } from "./scenes/MapScene";
import { AgentSprite, type AgentSpriteData } from "./sprites/AgentSprite";
import { ProactiveChatManager, type ProactiveTrigger } from "./ProactiveChatManager";
import { emotionEngine } from "./emotion/EmotionEngine";

const TILE = 64;
const COLS = 16;
const ROWS = 12;
const W = COLS * TILE; // 1024
const H = ROWS * TILE; // 768

interface Props {
  mapId: string;
  agents: AgentSpriteData[];
  brainEnabled?: boolean;
  onAgentClick?: (agentId: string) => void;
  onAgentMove?: (agentId: string, tileX: number, tileY: number) => void;
  onAgentDoubleClick?: (agentId: string) => void;
  onGameReady?: (game: Phaser.Game) => void;
  /** Step 98: 主动搭话触发回调 */
  onProactiveTrigger?: (trigger: ProactiveTrigger) => void;
  /** Step 98: 主动搭话超时回调 */
  onProactiveTimeout?: (agentId: string) => void;
}

/**
 * React-Phaser 桥接组件。
 * agents prop 变更 → MapScene.setAgents()
 * Phaser 交互事件 → onAgentClick / onAgentMove → React
 * Step 98: 管理 ProactiveChatManager 生命周期
 */
export default function GameCanvas({ mapId, agents, brainEnabled, onAgentClick, onAgentMove, onAgentDoubleClick, onGameReady, onProactiveTrigger, onProactiveTimeout }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const prevMapRef = useRef<string>("");
  const proactiveRef = useRef<ProactiveChatManager | null>(null);
  const cbRef = useRef({ onAgentClick, onAgentMove, onAgentDoubleClick, onProactiveTrigger, onProactiveTimeout });
  cbRef.current = { onAgentClick, onAgentMove, onAgentDoubleClick, onProactiveTrigger, onProactiveTimeout };

  // Step 99a: 全局暂停/恢复
  const pauseAll = useCallback(() => {
    const game = gameRef.current;
    if (!game) return;
    // 暂停 Phaser
    const ms = game.scene.getScene("MapScene") as MapScene | null;
    ms?.pauseSimulation();
    // 停止 EmotionEngine
    emotionEngine.stop();
    // 停止 ProactiveChatManager
    proactiveRef.current?.stop();
  }, []);

  const resumeAll = useCallback(() => {
    const game = gameRef.current;
    if (!game) return;
    // 恢复 Phaser
    const ms = game.scene.getScene("MapScene") as MapScene | null;
    ms?.resumeSimulation();
    // 恢复 EmotionEngine（关键：否则情绪 decay + 随机事件永久停止）
    emotionEngine.start();
    // 恢复 ProactiveChatManager
    proactiveRef.current?.start();
  }, []);

  // 暴露方法到 game.registry 供 React 层调用
  const freezeAgents = useCallback(() => {
    const ms = gameRef.current?.scene.getScene("MapScene") as MapScene | null;
    ms?.freezeAgents();
  }, []);

  const unfreezeAgents = useCallback(() => {
    const ms = gameRef.current?.scene.getScene("MapScene") as MapScene | null;
    ms?.unfreezeAgents();
  }, []);

  const lockAgent = useCallback((agentId: string) => {
    const ms = gameRef.current?.scene.getScene("MapScene") as MapScene | null;
    ms?.lockAgent(agentId);
  }, []);

  const unlockAgent = useCallback((agentId: string) => {
    const ms = gameRef.current?.scene.getScene("MapScene") as MapScene | null;
    ms?.unlockAgent(agentId);
  }, []);

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

    // Step 98: 初始化 ProactiveChatManager
    const proactive = new ProactiveChatManager(game);
    proactive.setScene(mapId);
    proactive.setIsAgentBusy((agentId) => {
      const ms = game.scene.getScene("MapScene") as MapScene | null;
      return ms?.isAgentBusy(agentId) ?? false;
    });
    proactive.setGetAgents(() => {
      // 从 registry 取 React 层的完整 AgentSpriteData（包含 emoji、color）
      const fullData = game.registry.get("pendingAgents") as AgentSpriteData[] | undefined;
      if (fullData?.length) return fullData;
      // fallback: 从 Phaser sprites 构造
      const ms = game.scene.getScene("MapScene") as MapScene | null;
      if (!ms) return [];
      const sprites = (ms as any).agentSprites as Map<string, AgentSprite> | undefined;
      if (!sprites) return [];
      return [...sprites.values()].map((s) => ({
        agentId: s.agentId,
        name: (s as any).getData?.("name") ?? s.agentId,
        emoji: String((s as any).getData?.("emoji") ?? ""),
        color: String((s as any).getData?.("color") ?? "#888888"),
        tileX: s.tileX,
        tileY: s.tileY,
        action: s.action,
        emotion: s.emotion,
      }));
    });
    proactive.onProactiveTrigger((trigger: ProactiveTrigger) => {
      cbRef.current.onProactiveTrigger?.(trigger);
    });
    proactive.onProactiveTimeout((agentId: string) => {
      cbRef.current.onProactiveTimeout?.(agentId);
    });
    proactiveRef.current = proactive;
    proactive.start();

    // Step 99a: 将 pause/resume/freeze 方法注入 registry
    game.registry.set("pauseAll", pauseAll);
    game.registry.set("resumeAll", resumeAll);
    game.registry.set("freezeAgents", freezeAgents);
    game.registry.set("unfreezeAgents", unfreezeAgents);
    game.registry.set("lockAgent", lockAgent);
    game.registry.set("unlockAgent", unlockAgent);
    game.registry.set("proactiveManager", proactive);

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
    // State 4: brain 模式切换事件
    game.events.on("brain-toggle", (enabled: boolean) => {
      game.registry.set("brainEnabled", enabled);
    });

    return () => {
      proactive.dispose();
      game.destroy(true);
      gameRef.current = null;
    };
  }, []);

  // State 4: brain 状态同步 → Phaser
  useEffect(() => {
    if (!gameRef.current) return;
    gameRef.current.registry.set("brainEnabled", brainEnabled ?? false);
    gameRef.current.events.emit("brain-toggle", brainEnabled ?? false);
  }, [brainEnabled]);

  // 切换场景 → 更新 registry（MapScene 内部读取）+ ProactiveChatManager
  useEffect(() => {
    if (!gameRef.current || mapId === prevMapRef.current) return;
    prevMapRef.current = mapId;
    gameRef.current.registry.set("pendingMapId", mapId);
    gameRef.current.registry.set("pendingAgents", agents);
    const ms = gameRef.current.scene.getScene("MapScene") as MapScene | null;
    if (ms) ms.loadMap(mapId);
    // Step 98: 更新 ProactiveChatManager 场景 + 重置冷却
    proactiveRef.current?.setScene(mapId);
    proactiveRef.current?.reset();
    proactiveRef.current?.start();
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
