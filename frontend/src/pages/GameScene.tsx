import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import Phaser from "phaser";
import GameCanvas from "../game/GameCanvas";
import type { AgentSpriteData, Emotion } from "../game/sprites/AgentSprite";
import Card from "../components/shared/Card";
import AgentPanel from "../components/scene/AgentPanel";
import PersonaTamper, { DEFAULT_PERSONALITY } from "../components/scene/PersonaTamper";
import type { Personality } from "../components/scene/PersonaTamper";
import CheckpointPanel from "../components/scene/CheckpointPanel";
import DirectorPanel from "../components/scene/DirectorPanel";
import AudioControls from "../components/scene/AudioControls";
import { useSyncSceneState, useCheckpoints, useCreateCheckpoint, useDeleteCheckpoint } from "../api/scenes";
import { useAgents } from "../api/agents";
import type { AgentResponse } from "../types/agent";
import { pickAccessoryId } from "../game/accessories";

/* —— 场景列表 —— */
const SCENES = [
  { id: "library", name: "📚 科大图书馆" },
  { id: "dorm", name: "🏠 宿舍" },
  { id: "classroom", name: "🏫 空教室" },
  { id: "art", name: "🎨 艺术中心" },
  { id: "lab", name: "🔬 实验室" },
  { id: "sakura", name: "🌸 樱花大道" },
];

/* —— Agent 池条目（部署用）—— */
interface AgentPoolEntry {
  agentId: string;
  label: string;   // 显示标签
  name: string;    // 短名（气泡用）
  emoji: string;
  color: string;
}

/* MBTI → emoji 映射 */
const MBTI_EMOJI: Record<string, string> = {
  INTJ: "👨‍💻", INTP: "🧑‍🔬", ENTJ: "👨‍💼", ENTP: "🧑‍🎤",
  INFJ: "🧘", INFP: "🧑‍🎨", ENFJ: "👩‍🏫", ENFP: "👩‍🎨",
  ISTJ: "👨‍🔧", ISFJ: "👩‍⚕️", ESTJ: "👨‍💼", ESFJ: "🤝",
  ISTP: "👨‍🔬", ISFP: "👩‍🎨", ESTP: "🕵️", ESFP: "🎭",
};

/** agentId → 稳定 hex 颜色（12 色调色板） */
const COLOR_PALETTE = [
  "#5588CC", "#EE8899", "#DD9944", "#66AA88", "#8866CC",
  "#CC6655", "#5599AA", "#AA77BB", "#88AA55", "#CC8866",
  "#5588AA", "#BB7799",
];
function agentColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return COLOR_PALETTE[Math.abs(h) % COLOR_PALETTE.length];
}

/** AgentResponse → AgentPoolEntry */
function toPoolEntry(a: AgentResponse): AgentPoolEntry {
  const mbti = a.persona?.mbti ?? "";
  const emoji = MBTI_EMOJI[mbti.toUpperCase()] ?? "🤖";
  const shortName = a.name.length > 2 ? a.name.slice(0, 2) : a.name;
  return {
    agentId: a.id,
    label: `${a.name} ${emoji}`,
    name: shortName,
    emoji,
    color: agentColor(a.id),
  };
}

/* —— Mock 兜底（后端不可用时）—— */
const MOCK_POOL: AgentPoolEntry[] = [
  { agentId: "agent-1", label: "小林 👨‍💻", name: "小林", emoji: "👨‍💻", color: "#5588CC" },
  { agentId: "agent-2", label: "小红 👩‍🎨", name: "小红", emoji: "👩‍🎨", color: "#EE8899" },
  { agentId: "agent-3", label: "小刚 👨‍💼", name: "小刚", emoji: "👨‍💼", color: "#DD9944" },
  { agentId: "agent-4", label: "小雪 👩‍🔬", name: "小雪", emoji: "👩‍🔬", color: "#66AA88" },
  { agentId: "agent-5", label: "阿杰 🧑‍🎤", name: "阿杰", emoji: "🧑‍🎤", color: "#8866CC" },
];

/* —— 每场景的投放坐标（8 个，支持更多 Agent）—— */
const SPAWN_SLOTS: Record<string, { tileX: number; tileY: number }[]> = {
  library:    [{ tileX: 3, tileY: 4 }, { tileX: 6, tileY: 4 }, { tileX: 10, tileY: 4 }, { tileX: 13, tileY: 4 }, { tileX: 5, tileY: 7 }, { tileX: 8, tileY: 7 }, { tileX: 11, tileY: 7 }, { tileX: 2, tileY: 9 }],
  dorm:       [{ tileX: 2, tileY: 3 }, { tileX: 6, tileY: 3 }, { tileX: 10, tileY: 3 }, { tileX: 14, tileY: 3 }, { tileX: 4, tileY: 6 }, { tileX: 8, tileY: 6 }, { tileX: 12, tileY: 6 }, { tileX: 7, tileY: 9 }],
  classroom:  [{ tileX: 2, tileY: 3 }, { tileX: 5, tileY: 3 }, { tileX: 8, tileY: 3 }, { tileX: 12, tileY: 3 }, { tileX: 3, tileY: 6 }, { tileX: 7, tileY: 6 }, { tileX: 10, tileY: 6 }, { tileX: 13, tileY: 8 }],
  art:        [{ tileX: 3, tileY: 3 }, { tileX: 7, tileY: 3 }, { tileX: 11, tileY: 3 }, { tileX: 14, tileY: 4 }, { tileX: 5, tileY: 6 }, { tileX: 9, tileY: 6 }, { tileX: 13, tileY: 6 }, { tileX: 4, tileY: 9 }],
  lab:        [{ tileX: 3, tileY: 3 }, { tileX: 7, tileY: 3 }, { tileX: 11, tileY: 3 }, { tileX: 14, tileY: 4 }, { tileX: 5, tileY: 6 }, { tileX: 9, tileY: 6 }, { tileX: 12, tileY: 8 }, { tileX: 3, tileY: 9 }],
  sakura:     [{ tileX: 2, tileY: 3 }, { tileX: 6, tileY: 3 }, { tileX: 10, tileY: 3 }, { tileX: 13, tileY: 4 }, { tileX: 4, tileY: 6 }, { tileX: 8, tileY: 6 }, { tileX: 12, tileY: 7 }, { tileX: 5, tileY: 9 }],
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

/* —— Agent 人格本地持久化 —— */
const PERSONA_KEY = "m11-personalities";

function loadPersonalities(): Record<string, Personality> {
  try { return JSON.parse(localStorage.getItem(PERSONA_KEY) ?? "{}"); } catch { return {}; }
}
function savePersonalities(p: Record<string, Personality>): void {
  localStorage.setItem(PERSONA_KEY, JSON.stringify(p));
}

export default function GameScenePage() {
  const [mapId, setMapId] = useState<string>(() => loadScene());
  const [agents, setAgents] = useState<AgentSpriteData[]>(() => loadAgents(loadScene()));
  const [personalities, setPersonalities] = useState<Record<string, Personality>>(() => loadPersonalities());
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [tamperTargetId, setTamperTargetId] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [weather, setWeather] = useState("clear");
  const syncMutation = useSyncSceneState();
  // 71: 对话日志（叙事导出用）
  // hash 跳转到对应面板
  const checkpointsRef = useRef<HTMLDivElement>(null);
  const directorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const hash = window.location.hash?.slice(1);
    if (hash) {
      const el = document.getElementById(`section-${hash}`);
      el?.scrollIntoView({ behavior: "smooth" });
    }
  }, []);
  const mountedRef = useRef(false);
  const gameRef = useRef<Phaser.Game | null>(null);
  const [gameReady, setGameReady] = useState(false);

  // ── 真实 Agent 池（与 SoloTheater 同源，后端不可用时 mock 兜底）──
  const { data: realAgents = [] } = useAgents();
  const agentPool: AgentPoolEntry[] = useMemo(
    () => realAgents.length > 0 ? realAgents.map(toPoolEntry) : MOCK_POOL,
    [realAgents],
  );

  // 66-A 迁移：清理 localStorage 中不在当前池的旧 Agent（mock agent-1~5 等）
  useEffect(() => {
    const poolIds = new Set(agentPool.map((a) => a.agentId));
    for (const scene of SCENES) {
      const stored = loadAgents(scene.id);
      const filtered = stored.filter((a) => poolIds.has(a.agentId));
      if (filtered.length !== stored.length) {
        saveAgents(scene.id, filtered);
      }
    }
  }, [agentPool]);

  // 存档 API
  const { data: checkpoints = [] } = useCheckpoints(mapId);
  const createCp = useCreateCheckpoint();
  const deleteCp = useDeleteCheckpoint();

  const selectedAgent = useMemo(
    () => agents.find((a) => a.agentId === selectedAgentId) ?? null,
    [agents, selectedAgentId],
  );
  const tamperTarget = useMemo(
    () => agents.find((a) => a.agentId === tamperTargetId) ?? null,
    [agents, tamperTargetId],
  );

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
    (agentId: string, emotion: Emotion) => {
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

  /** 点击 Agent → 选中/取消选中 */
  const handleAgentClick = useCallback((agentId: string) => {
    setSelectedAgentId((prev) => (prev === agentId ? null : agentId));
  }, []);

  /** 拖拽 Agent → 更新位置 */
  const handleAgentMove = useCallback(
    (agentId: string, tileX: number, tileY: number) => {
      setAgents((prev) => {
        const next = prev.map((a) =>
          a.agentId === agentId ? { ...a, tileX, tileY } : a,
        );
        saveAgents(mapId, next);
        return next;
      });
    },
    [mapId],
  );

  /** AgentPanel 情绪切换 */
  const handlePanelEmotion = useCallback(
    (emotion: Emotion) => {
      if (!selectedAgentId) return;
      setAgentEmotion(selectedAgentId, emotion);
    },
    [selectedAgentId, setAgentEmotion],
  );

  /** 双击 → 打开篡改面板 */
  const handleAgentDoubleClick = useCallback((agentId: string) => {
    setTamperTargetId(agentId);
  }, []);

  /** AgentPanel 耳语发送 → 气泡 */
  const handlePanelWhisper = useCallback(
    (message: string) => {
      if (!selectedAgentId) return;
      gameRef.current?.events.emit("agent-whisper", selectedAgentId, message);
    },
    [selectedAgentId],
  );

  /** 暂停/继续 */
  const handleTogglePause = useCallback(() => {
    const ms = gameRef.current?.scene.getScene("MapScene") as any;
    if (!ms) return;
    if (paused) {
      ms.resumeSimulation();
      setPaused(false);
    } else {
      ms.pauseSimulation();
      setPaused(true);
    }
  }, [paused]);

  /** 保存存档 */
  const handleSaveCheckpoint = useCallback(
    (name: string) => {
      createCp.mutate({ sceneId: mapId, name, agents });
    },
    [mapId, agents, createCp],
  );

  /** 加载存档 */
  const handleLoadCheckpoint = useCallback(
    (id: string) => {
      const cp = checkpoints.find((c: any) => c.id === id);
      if (!cp?.agents?.length) return;
      setAgents(cp.agents);
      saveAgents(mapId, cp.agents);
    },
    [mapId, checkpoints],
  );

  /** 导演: 切换天气 */
  const handleWeatherChange = useCallback((w: string) => {
    setWeather(w);
    const ms = gameRef.current?.scene.getScene("MapScene") as any;
    ms?.setWeather(w);
  }, []);

  /** 导演: 上帝之声 */
  const handleGodVoice = useCallback((message: string) => {
    const ms = gameRef.current?.scene.getScene("MapScene") as any;
    ms?.broadcastGodVoice(message);
  }, []);

  /** 导演: 全员氛围 — 直改 sprite + 同步 React（增量更新不卡） */
  const handleMoodAll = useCallback((emotion: string) => {
    const ms = gameRef.current?.scene.getScene("MapScene") as any;
    ms?.setAllEmotions(emotion);
    setAgents((prev) => {
      const next = prev.map((a) => ({ ...a, emotion: emotion as Emotion }));
      saveAgents(mapId, next);
      return next;
    });
  }, [mapId]);

  /** 删除存档 */
  const handleDeleteCheckpoint = useCallback(
    (id: string) => {
      deleteCp.mutate({ sceneId: mapId, id });
    },
    [mapId, deleteCp],
  );

  /** 人格篡改保存 */
  const handleTamperSave = useCallback(
    (p: Personality) => {
      if (!tamperTargetId) return;
      setPersonalities((prev) => {
        const next = { ...prev, [tamperTargetId]: p };
        savePersonalities(next);
        return next;
      });
      setTamperTargetId(null);
    },
    [tamperTargetId],
  );

  /** 部署时初始化人格 */
  const deployAgent = useCallback(
    (def: AgentPoolEntry) => {
      setAgents((prev) => {
        if (prev.find((a) => a.agentId === def.agentId)) return prev;
        const slots = SPAWN_SLOTS[mapId] ?? SPAWN_SLOTS.library;
        const slot = slots[prev.length % slots.length];
        const next = [
          ...prev,
          {
            agentId: def.agentId,
            name: def.name,
            emoji: def.emoji,
            color: def.color,
            tileX: slot.tileX,
            tileY: slot.tileY,
            action: "idle" as const,
            emotion: "neutral" as const,
            accessory: pickAccessoryId(),
          },
        ];
        saveAgents(mapId, next);
        // 初始化人格（如未设置）
        if (!personalities[def.agentId]) {
          const newP = { ...personalities, [def.agentId]: { ...DEFAULT_PERSONALITY } };
          setPersonalities(newP);
          savePersonalities(newP);
        }
        return next;
      });
    },
    [mapId, personalities],
  );

  return (
    <div className="h-full flex animate-fade-in">
      {/* ── 左侧控制栏 ── */}
      <div className="w-72 shrink-0 overflow-y-auto p-4 space-y-3 border-r border-border">
        <h1 className="text-lg font-mono text-accent-orange">M11 游戏化场景</h1>
        <AudioControls />

        {/* 场景选择器 */}
        <Card className="p-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-mono text-text-secondary">场景</span>
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

      </div>

      {/* ── 右侧画布区 ── */}
      <div className="flex-1 flex items-center justify-center p-4">
        <GameCanvas
          mapId={mapId}
          agents={agents}
          onAgentClick={handleAgentClick}
          onAgentMove={handleAgentMove}
          onAgentDoubleClick={handleAgentDoubleClick}
          onGameReady={(g) => { gameRef.current = g; }}
        />
      </div>

      {/* ── 浮动面板（独立于布局）── */}
      {/* Agent 详情面板 */}
      <AgentPanel
        agent={selectedAgent}
        onClose={() => setSelectedAgentId(null)}
        onEmotionChange={handlePanelEmotion}
        onWhisper={handlePanelWhisper}
      />

      {/* 双击篡改面板 */}
      {tamperTarget && (
        <PersonaTamper
          agentName={tamperTarget.name}
          agentEmoji={tamperTarget.emoji}
          initial={personalities[tamperTarget.agentId] ?? DEFAULT_PERSONALITY}
          onSave={handleTamperSave}
          onClose={() => setTamperTargetId(null)}
        />
      )}

      {/* Agent 投放面板 */}
      <Card className="mt-4 p-3">
        <p className="text-xs font-mono text-text-secondary mb-2">
          投放 Agent（{agents.length}/{agentPool.length}）
        </p>
        <div className="flex flex-wrap gap-2">
          {agentPool.map((def) => {
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
                {def.name}
                {deployed ? " ✓" : " +"}
              </button>
            );
          })}
        </div>
      </Card>

      {/* 导演面板 (Step 66) */}
      <Card className="p-3">
        <p className="text-xs font-mono text-text-secondary mb-2" ref={directorRef}>导演模式</p>
        <DirectorPanel
          weather={weather}
          onWeatherChange={handleWeatherChange}
          onGodVoice={handleGodVoice}
          onMoodAll={handleMoodAll}
          paused={paused}
        />

        {/* 71: 叙事导出 */}
      </Card>

      {/* 存档面板 */}
      <Card className="p-3">
        <p className="text-xs font-mono text-text-secondary mb-2" ref={checkpointsRef}>存档管理</p>
        <CheckpointPanel
          checkpoints={checkpoints}
          count={checkpoints.length}
          max={30}
          paused={paused}
          onSave={handleSaveCheckpoint}
          onLoad={handleLoadCheckpoint}
          onDelete={handleDeleteCheckpoint}
          onTogglePause={handleTogglePause}
        />
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
                {(["neutral","happy","anxious","angry","sad","surprised","confused","tired","excited"] as Emotion[]).map(
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

    </div>
  );
}
