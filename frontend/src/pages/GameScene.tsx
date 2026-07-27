import { useState, useCallback } from "react";
import GameCanvas from "../game/GameCanvas";
import type { AgentSpriteData } from "../game/sprites/AgentSprite";
import Card from "../components/shared/Card";

/* —— 场景列表 —— */
const SCENES = [
  { id: "library", name: "📚 科大图书馆" },
  { id: "dorm", name: "🏠 宿舍" },
  { id: "classroom", name: "🏫 空教室" },
  { id: "art", name: "🎨 艺术中心" },
  { id: "lab", name: "🔬 实验室" },
  { id: "sakura", name: "🌸 樱花大道" },
];

/* —— Mock Agent 定义 —— */
const AGENT_DEFS = [
  { agentId: "agent-1", name: "小林", emoji: "👨‍💻", color: "#5588CC" },
  { agentId: "agent-2", name: "小红", emoji: "👩‍🎨", color: "#EE8899" },
  { agentId: "agent-3", name: "小刚", emoji: "👨‍💼", color: "#DD9944" },
  { agentId: "agent-4", name: "小雪", emoji: "👩‍🔬", color: "#66AA88" },
  { agentId: "agent-5", name: "阿杰", emoji: "🧑‍🎤", color: "#8866CC" },
];

/** 每场景的出生坐标（避免放在墙壁/物品上） */
const SCENE_SPAWNS: Record<string, { tileX: number; tileY: number }[]> = {
  library:    [{ tileX: 2, tileY: 3 }, { tileX: 4, tileY: 3 }, { tileX: 8, tileY: 3 }, { tileX: 6, tileY: 5 }, { tileX: 9, tileY: 5 }],
  dorm:       [{ tileX: 3, tileY: 3 }, { tileX: 6, tileY: 3 }, { tileX: 9, tileY: 3 }, { tileX: 4, tileY: 5 }, { tileX: 8, tileY: 5 }],
  classroom:  [{ tileX: 2, tileY: 2 }, { tileX: 4, tileY: 2 }, { tileX: 6, tileY: 2 }, { tileX: 8, tileY: 4 }, { tileX: 10, tileY: 4 }],
  art:        [{ tileX: 2, tileY: 4 }, { tileX: 5, tileY: 3 }, { tileX: 7, tileY: 5 }, { tileX: 9, tileY: 4 }, { tileX: 4, tileY: 6 }],
  lab:        [{ tileX: 3, tileY: 3 }, { tileX: 7, tileY: 3 }, { tileX: 5, tileY: 5 }, { tileX: 9, tileY: 5 }, { tileX: 2, tileY: 6 }],
  sakura:     [{ tileX: 2, tileY: 2 }, { tileX: 5, tileY: 3 }, { tileX: 7, tileY: 4 }, { tileX: 9, tileY: 5 }, { tileX: 3, tileY: 6 }],
};

export default function GameScenePage() {
  const [mapId, setMapId] = useState("library");
  const [agents, setAgents] = useState<AgentSpriteData[]>(() =>
    buildAgents("library"),
  );

  const handleSceneChange = useCallback((id: string) => {
    setMapId(id);
    setAgents(buildAgents(id));
  }, []);

  return (
    <div className="h-full overflow-y-auto p-6 animate-fade-in">
      <h1 className="text-2xl font-mono text-accent-orange mb-1">M11 游戏化场景</h1>
      <p className="text-sm text-text-secondary font-mono mb-4">
        Phaser 3 · tilemap · Agent 精灵 · 六场景
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

      {/* 每个 Agent 单独的情绪控制 */}
      <Card className="mt-4 p-3">
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
              {(["neutral", "happy", "anxious", "angry", "sad"] as const).map((em) => (
                <button
                  key={em}
                  type="button"
                  onClick={() => {
                    setAgents((prev) =>
                      prev.map((a) =>
                        a.agentId === agent.agentId ? { ...a, emotion: em } : a,
                      ),
                    );
                  }}
                  className={`px-2 py-0.5 text-[10px] font-mono rounded border transition-colors ${
                    agent.emotion === em
                      ? "border-accent-orange/60 bg-accent-orange/10 text-accent-orange"
                      : "border-border text-text-secondary hover:border-text-secondary/40"
                  }`}
                >
                  {em}
                </button>
              ))}
            </div>
          ))}
        </div>
      </Card>

      <p className="text-[10px] text-text-secondary/40 font-mono text-center mt-3">
        Agent 精灵 ~48px · 纯程序化纹理 · zero external assets
      </p>
    </div>
  );
}

/** 根据场景 ID 构造 Agent 数据（Mock） */
function buildAgents(mapId: string): AgentSpriteData[] {
  const spawns = SCENE_SPAWNS[mapId] ?? SCENE_SPAWNS.library;
  return AGENT_DEFS.map((def, i) => {
    const pos = spawns[i] ?? { tileX: 2 + i, tileY: 4 };
    return {
      agentId: def.agentId,
      name: def.name,
      emoji: def.emoji,
      color: def.color,
      tileX: pos.tileX,
      tileY: pos.tileY,
      action: "idle" as const,
      emotion: "neutral" as const,
    };
  });
}
