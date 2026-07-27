import { useState } from "react";
import GameCanvas from "../game/GameCanvas";
import Card from "../components/shared/Card";

const SCENES = [
  { id: "library", name: "📚 科大图书馆" },
  { id: "dorm", name: "🏠 宿舍" },
  { id: "classroom", name: "🏫 空教室" },
  { id: "art", name: "🎨 艺术中心" },
  { id: "lab", name: "🔬 实验室" },
  { id: "sakura", name: "🌸 樱花大道" },
];

export default function GameScenePage() {
  const [mapId, setMapId] = useState("library");

  return (
    <div className="h-full overflow-y-auto p-6 animate-fade-in">
      <h1 className="text-2xl font-mono text-accent-orange mb-1">M11 游戏化场景</h1>
      <p className="text-sm text-text-secondary font-mono mb-4">Phaser 3 · tilemap · 六场景</p>

      {/* 场景选择器 */}
      <Card className="mb-4 p-3">
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs font-mono text-text-secondary mr-2">场景：</span>
          {SCENES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setMapId(s.id)}
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
      <GameCanvas mapId={mapId} />

      <p className="text-[10px] text-text-secondary/30 font-mono text-center mt-3">
        Tileset: Ocean's Nostalgia - School Time / Traditional School Asset Pack 32x32 · 来源于网络 · 仅用于学术演示
      </p>
    </div>
  );
}
