import { useState, useCallback, useEffect, useRef } from "react";
import GameCanvas from "../game/GameCanvas";
import type { AgentSpriteData } from "../game/sprites/AgentSprite";
import Card from "../components/shared/Card";
import { useSyncSceneState } from "../api/scenes";

/* —— 场景列表 —— */
const SCENES = [
  { id: "library", name: "📚 科大图书馆" },
  { id: "dorm", name: "🏠 宿舍" },
  { id: "classroom", name: "🏫 空教室" },
  { id: "art", name: "🎨 艺术中心" },
  { id: "lab", name: "🔬 实验室" },
  { id: "sakura", name: "🌸 樱花大道" },
];

/* —— 可用 Agent 模板 —— */
const AGENT_POOL = [
  { agentId: "agent-1", label: "小林 👨‍💻", emoji: "👨‍💻", color: "#5588CC" },
  { agentId: "agent-2", label: "小红 👩‍🎨", emoji: "👩‍🎨", color: "#EE8899" },
  { agentId: "agent-3", label: "小刚 👨‍💼", emoji: "👨‍💼", color: "#DD9944" },
  { agentId: "agent-4", label: "小雪 👩‍🔬", emoji: "👩‍🔬", color: "#66AA88" },
  { agentId: "agent-5", label: "阿杰 🧑‍🎤", emoji: "🧑‍🎤", color: "#8866CC" },
];

/* —— 每场景的投放坐标 —— */
const SPAWN_SLOTS: Record<string, { tileX: number; tileY: number }[]> = {
  library:    [{ tileX: 2, tileY: 3 }, { tileX: 4, tileY: 3 }, { tileX: 8, tileY: 3 }, { tileX: 6, tileY: 5 }, { tileX: 9, tileY: 5 }],
  dorm:       [{ tileX: 3, tileY: 3 }, { tileX: 6, tileY: 3 }, { tileX: 9, tileY: 3 }, { tileX: 4, tileY: 5 }, { tileX: 8, tileY: 5 }],
  classroom:  [{ tileX: 2, tileY: 2 }, { tileX: 4, tileY: 2 }, { tileX: 6, tileY: 2 }, { tileX: 8, tileY: 4 }, { tileX: 10, tileY: 4 }],
  art:        [{ tileX: 2, tileY: 4 }, { tileX: 5, tileY: 3 }, { tileX: 7, tileY: 5 }, { tileX: 9, tileY: 4 }, { tileX: 4, tileY: 6 }],
  lab:        [{ tileX: 3, tileY: 3 }, { tileX: 7, tileY: 3 }, { tileX: 5, tileY: 5 }, { tileX: 9, tileY: 5 }, { tileX: 2, tileY: 6 }],
  sakura:     [{ tileX: 2, tileY: 2 }, { tileX: 5, tileY: 3 }, { tileX: 7, tileY: 4 }, { tileX: 9, tileY: 5 }, { tileX: 3, tileY: 6 }],
};

const SCENE_KEY = "m11-current-scene";

function sceneStorageKey(sceneId: string): string {
  return `m11-agents-${sceneId}`;
}

function loadAgents(sceneId: string): AgentSpriteData[] {
  try {
    const raw = localStorage.getItem(sceneStorageKey(sceneId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveAgents(sceneId: string, agents: AgentSpriteData[]): void {
  localStorage.setItem(sceneStorageKey(sceneId), JSON.stringify(agents));
}

function loadScene(): string {
  return localStorage.getItem(SCENE_KEY) ?? "library";
}

function saveScene(id: string): void {
  localStorage.setItem(SCENE_KEY, id);
}

export default function GameScenePage() {
  const [mapId, setMapId] = useState<string>(() => loadScene());
  const [agents, setAgents] = useState<AgentSpriteData[]>(() => loadAgents(loadScene()));
  const syncMutation = useSyncSceneState();
  const mountedRef = useRef(false);

  // 后台同步到后端 API（localStorage 仍为主存储）
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    syncMutation.mutate({ sceneId: mapId, agents });
  }, [mapId, agents]);  // eslint-disable-line react-hooks/exhaustive-deps

  /** 切换场景 → 加载该场景独立配置 */
  const handleSceneChange = useCallback((id: string) => {
    saveScene(id);
    setMapId(id);
    setAgents(loadAgents(id));
  }, []);

  /** 投放单个 Agent */
  const deployAgent = useCallback(
    (def: (typeof AGENT_POOL)[number]) => {
      setAgents((prev) => {
        if (prev.find((a) => a.agentId === def.agentId)) return prev;
        const slots = SPAWN_SLOTS[mapId] ?? SPAWN_SLOTS.library;
        const slot = slots[prev.length % slots.length];
        const next = [
          ...prev,
          {
            agentId: def.agentId,
            name: def.label.slice(0, 2),
            emoji: def.emoji,
            color: def.color,
            tileX: slot.tileX,
            tileY: slot.tileY,
            action: "idle" as const,
            emotion: "neutral" as const,
          },
        ];
        saveAgents(mapId, next);
        return next;
      });
    },
    [mapId],
  );

  /** 移除单个 Agent */
  const removeAgent = useCallback((agentId: string) => {
    setAgents((prev) => {
      const next = prev.filter((a) => a.agentId !== agentId);
      saveAgents(mapId, next);
      return next;
    });
  }, [mapId]);

  /** 切换单个 Agent 的情绪 */
  const setAgentEmotion = useCallback(
    (agentId: string, emotion: AgentSpriteData["emotion"]) => {
      setAgents((prev) => {
        const next = prev.map((a) =>
          a.agentId === agentId ? { ...a, emotion } : a,
        );
        saveAgents(mapId, next);
        return next;
      });
    },
    [mapId],
  );

  return (
    <div className="h-full overflow-y-auto p-6 animate-fade-in">
      <h1 className="text-2xl font-mono text-accent-orange mb-1">M11 游戏化场景</h1>
      <p className="text-sm text-text-secondary font-mono mb-4">
        Phaser 3 · tilemap · Agent 精灵投放 · 六场景
      </p>

      {/* 场景选择器 */}
      <Card className="mb-4 p-3">
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs font-mono text-text-secondary mr-2">场景：</span>
          {SCENES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => handleSceneChange(s.id)}
              className={`px-3 py-1 text-xs font-mono rounded border transition-colors ${
                mapId === s.id
                  ? "border-accent-orange/60 bg-accent-orange/10 text-accent-orange"
                  : "border-border text-text-secondary hover:border-text-secondary/40"
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      </Card>

      {/* Phaser Canvas */}
      <GameCanvas mapId={mapId} agents={agents} />

      {/* Agent 投放面板 */}
      <Card className="mt-4 p-3">
        <p className="text-xs font-mono text-text-secondary mb-2">
          投放 Agent（{agents.length}/{AGENT_POOL.length}）
        </p>
        <div className="flex flex-wrap gap-2">
          {AGENT_POOL.map((def) => {
            const deployed = agents.find((a) => a.agentId === def.agentId);
            return (
              <button
                key={def.agentId}
                type="button"
                onClick={() =>
                  deployed ? removeAgent(def.agentId) : deployAgent(def)
                }
                className={`px-3 py-1 text-xs font-mono rounded border transition-colors ${
                  deployed
                    ? "border-accent-green/60 bg-accent-green/10 text-accent-green"
                    : "border-border text-text-secondary hover:border-text-secondary/40"
                }`}
              >
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle"
                  style={{ backgroundColor: def.color }}
                />
                {def.label.slice(0, 2)}
                {deployed ? " ✓" : " +"}
              </button>
            );
          })}
        </div>
      </Card>

      {/* 已投放 Agent 情绪控制 */}
      {agents.length > 0 && (
        <Card className="mt-4 p-3">
          <p className="text-xs font-mono text-text-secondary mb-2">情绪控制</p>
          <div className="flex flex-col gap-2">
            {agents.map((agent) => (
              <div key={agent.agentId} className="flex items-center gap-2">
                <span
                  className="inline-block w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: agent.color }}
                />
                <span className="text-xs font-mono text-text-primary w-10 shrink-0">
                  {agent.name}
                </span>
                {(["neutral", "happy", "anxious", "angry", "sad"] as const).map(
                  (em) => (
                    <button
                      key={em}
                      type="button"
                      onClick={() => setAgentEmotion(agent.agentId, em)}
                      className={`px-2 py-0.5 text-[10px] font-mono rounded border transition-colors ${
                        agent.emotion === em
                          ? "border-accent-orange/60 bg-accent-orange/10 text-accent-orange"
                          : "border-border text-text-secondary hover:border-text-secondary/40"
                      }`}
                    >
                      {em}
                    </button>
                  ),
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      <p className="text-[10px] text-text-secondary/40 font-mono text-center mt-3">
        Agent 精灵 72px · 2x 高清贴图 · zero external assets
      </p>
    </div>
  );
}
