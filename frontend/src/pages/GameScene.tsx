import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import Phaser from "phaser";
import GameCanvas from "../game/GameCanvas";
import type { AgentSpriteData, Emotion } from "../game/sprites/AgentSprite";
import type { MapScene } from "../game/scenes/MapScene";
import Card from "../components/shared/Card";
import AgentPanel from "../components/scene/AgentPanel";
import PersonaTamper, { DEFAULT_PERSONALITY } from "../components/scene/PersonaTamper";
import type { Personality } from "../components/scene/PersonaTamper";
import CheckpointPanel from "../components/scene/CheckpointPanel";
import DirectorPanel from "../components/scene/DirectorPanel";
import AudioControls from "../components/scene/AudioControls";
import ProactiveBanner from "../components/scene/ProactiveBanner";
import ProactiveChat from "../components/scene/ProactiveChat";
import type { ChatOption } from "../components/scene/ProactiveChat";
import { useSyncSceneState, useCheckpoints, useCreateCheckpoint, useDeleteCheckpoint, useStartScene } from "../api/scenes";
import { useAgents } from "../api/agents";
import { useInjectEvent, usePauseWorld, useStartWorld } from "../api/worlds";
import type { AgentResponse } from "../types/agent";
import { pickAccessoryId } from "../game/accessories";
import { synchronizeScenePause } from "../game/scenePause";
import { type ProactiveTrigger } from "../game/ProactiveChatManager";
import { getChatOptions, generateChatOptionsLLM, generateCustomReplyLLM, type TopicCategory } from "../game/dialogue";
import { unlock } from "../game/achievements";
import { useChatHistoryStore } from "../stores/useChatHistoryStore";
import {
  BrainDisconnectWatchdog,
  BrainWhisperTracker,
  getBrainButtonState,
} from "../game/sceneBrain";
import {
  isWhisperMoveNearIntent,
  resolveMentionedWhisperTarget,
  resolveWhisperMoveTarget,
  type LocalAgentCommand,
} from "../game/whisper";

/* —— 场景列表 —— */
const SCENES = [
  { id: "library", name: "📚 科大图书馆 · 西区" },
  { id: "dorm", name: "🏠 宿舍 · 西区六栋" },
  { id: "classroom", name: "🏫 空教室 · 三教" },
  { id: "art", name: "🎨 艺术中心 · 中区" },
  { id: "lab", name: "🔬 实验室 · 科研楼" },
  { id: "sakura", name: "🌸 樱花大道 · 老北门" },
];

/* —— Agent 池条目（部署用）—— */
interface AgentPoolEntry {
  agentId: string;
  label: string;   // 显示标签
  name: string;    // 规范全名（耳语目标解析与后端身份必须一致）
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
  return {
    agentId: a.id,
    label: `${a.name} ${emoji}`,
    name: a.name,
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

  // 成就：首次部署 Agent
  useEffect(() => { if (agents.length > 0) unlock("scene-first-deploy"); }, [agents.length]);
  const [personalities, setPersonalities] = useState<Record<string, Personality>>(() => loadPersonalities());
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [tamperTargetId, setTamperTargetId] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [weather, setWeather] = useState("clear");

  // ── Step 98/99: 主动搭话状态 ──
  const [proactiveBanner, setProactiveBanner] = useState<{
    trigger: ProactiveTrigger;
    remainingSeconds: number;
  } | null>(null);
  const [chatActive, setChatActive] = useState<{
    trigger: ProactiveTrigger;
    options: ReturnType<typeof getChatOptions>;
  } | null>(null);

  // ── Step 99a: 空闲自动暂停 ──
  const [autoPaused, setAutoPaused] = useState(false);
  const idleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastInteractionRef = useRef(Date.now());
  const chatActiveRef = useRef(false); // 供 idle timer 闭包读取
  const IDLE_TIMEOUT = 5 * 60 * 1000; // 5 分钟

  // ── Step 99c: 涂鸦模式 ──
  const [graffitiEnabled, setGraffitiEnabled] = useState(false);

  // ─ Step 99b: Emoji 模式 ─
  const [emojiMode, setEmojiMode] = useState(false);
  const [selectedEmoji, setSelectedEmoji] = useState("❤️");
  const EMOJI_PALETTE = ["❤️", "😡", "🌸", "💣", "🎵", "👻"];

  // ── Step 99d: 对话历史 ──
  const chatHistory = useChatHistoryStore();

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
  const brainWhisperTrackerRef = useRef<BrainWhisperTracker | null>(null);
  if (brainWhisperTrackerRef.current === null) {
    brainWhisperTrackerRef.current = new BrainWhisperTracker(
      (agentId, message) => {
        gameRef.current?.events.emit(
          "agent-whisper-feedback",
          agentId,
          message,
        );
      },
    );
  }
  const brainWhisperTracker = brainWhisperTrackerRef.current;

  // ── State 4 Step 81: 场景 Brain 联动 ──
  const [sceneWorldId, setSceneWorldId] = useState<string | null>(null);
  const [brainEnabled, setBrainEnabled] = useState(false);
  const startScene = useStartScene();
  const injectEvent = useInjectEvent();
  const pauseWorld = usePauseWorld();
  const resumeWorld = useStartWorld();
  const [sceneControlPending, setSceneControlPending] = useState(false);
  const [sceneControlError, setSceneControlError] = useState<string | null>(null);
  const [brainConnectionError, setBrainConnectionError] = useState<string | null>(null);
  const sseRef = useRef<EventSource | null>(null);

  // SSE 连接：监听 move_to / agent_message 事件 → 转发到 Phaser
  useEffect(() => {
    if (!sceneWorldId || !brainEnabled) return;
    const es = new EventSource(`/api/worlds/${sceneWorldId}/stream`);
    const watchdog = new BrainDisconnectWatchdog(() => {
      brainWhisperTracker.cancel();
      setBrainConnectionError("AI 连接已断开，已切换为本地模式");
      setBrainEnabled(false);
      setSceneWorldId(null);
    });
    sseRef.current = es;

    es.onopen = () => {
      watchdog.markOpen();
      setBrainConnectionError(null);
    };

    es.onmessage = (e) => {
      try {
        const evt = JSON.parse(e.data);
        if (!gameRef.current) return;

        if (evt.type === "move_to" || (evt.type === "agent_action" && evt.action === "move_to")) {
          const tx = evt.data?.tile_x ?? evt.tile_x;
          const ty = evt.data?.tile_y ?? evt.tile_y;
          const aid = evt.agent_id;
          if (tx != null && ty != null && aid) {
            gameRef.current.events.emit("sse-move-to", aid, tx, ty);
          }
        }

        if (evt.type === "agent_message" && evt.content) {
          const fromId = evt.agent_id;
          const msg = evt.message || evt.content;
          const targetIds = evt.data?.target_agent_ids || [];
          if (fromId) brainWhisperTracker.recordSpeaker(fromId);
          gameRef.current.events.emit("sse-dialogue", {
            fromId,
            fromName: evt.agent_name || fromId,
            message: msg,
            targetIds,
          });
        }

        if (evt.type === "emotion_update" && evt.agent_id && evt.data?.emotion) {
          gameRef.current.events.emit("sse-emotion", evt.agent_id, evt.data.emotion);
        }
      } catch { /* ignore parse errors */ }
    };

    es.onerror = () => {
      // EventSource 会自动重连；持续不可用才降级，旧连接的计时器必须清理。
      watchdog.reportError(es);
    };

    return () => {
      watchdog.dispose();
      es.close();
      sseRef.current = null;
    };
  }, [brainWhisperTracker, sceneWorldId, brainEnabled]);

  useEffect(() => {
    brainWhisperTracker.setPaused(paused);
  }, [brainWhisperTracker, paused]);

  useEffect(
    () => () => brainWhisperTracker.dispose(),
    [brainWhisperTracker],
  );

  // 场景启动：有 Agent 且 Brain 启用时，请求后端创建 WorldEngine
  const startBrain = useCallback(async () => {
    if (agents.length === 0) return;
    setBrainConnectionError(null);
    try {
      const result = await startScene.mutateAsync({
        sceneId: mapId,
        agentIds: agents.map((a) => a.agentId),
      });
      if (paused) {
        await pauseWorld.mutateAsync(result.world_id);
      }
      setSceneWorldId(result.world_id);
      setBrainEnabled(true);
    } catch {
      // 后端不可用时保持本地模式
      setBrainEnabled(false);
      setBrainConnectionError("AI 世界启动失败，请检查后端与 LLM 配置后重试");
    }
  }, [agents, mapId, pauseWorld, paused, startScene]);

  // 场景切换时断开 SSE + 清理主动搭话
  useEffect(() => {
    brainWhisperTracker.cancel();
    setSceneWorldId(null);
    setBrainEnabled(false);
    setBrainConnectionError(null);
    // Step 98: 清理主动搭话状态
    setProactiveBanner(null);
    setChatActive(null);
  }, [brainWhisperTracker, mapId]);

  // ── Step 99a: 空闲检测 ──
  useEffect(() => {
    const resetIdle = () => {
      lastInteractionRef.current = Date.now();
      if (autoPaused) {
        // 点击恢复
        setAutoPaused(false);
        const game = gameRef.current;
        if (game) {
          const resumeAll = game.registry.get("resumeAll") as (() => void) | undefined;
          resumeAll?.();
        }
      }
    };

    document.addEventListener("mousemove", resetIdle, { passive: true });
    document.addEventListener("click", resetIdle, { passive: true });
    document.addEventListener("keydown", resetIdle, { passive: true });
    document.addEventListener("touchstart", resetIdle, { passive: true });

    idleTimerRef.current = setInterval(() => {
      if (autoPaused || paused) return;
      // Step 99: 对话弹窗/横幅打开时不触发自动暂停
      if (chatActiveRef.current) {
        lastInteractionRef.current = Date.now(); // 刷新计时器
        return;
      }
      if (Date.now() - lastInteractionRef.current > IDLE_TIMEOUT) {
        setAutoPaused(true);
        const game = gameRef.current;
        if (game) {
          const pauseAll = game.registry.get("pauseAll") as (() => void) | undefined;
          pauseAll?.();
        }
      }
    }, 10000); // 每 10 秒检查

    return () => {
      document.removeEventListener("mousemove", resetIdle);
      document.removeEventListener("click", resetIdle);
      document.removeEventListener("keydown", resetIdle);
      document.removeEventListener("touchstart", resetIdle);
      if (idleTimerRef.current) clearInterval(idleTimerRef.current);
    };
  }, [autoPaused, paused]);

  // ── Step 99: 主动搭话横幅倒计时 ──
  useEffect(() => {
    if (!proactiveBanner) return;
    const interval = setInterval(() => {
      setProactiveBanner((prev) => {
        if (!prev) return null;
        const next = prev.remainingSeconds - 1;
        if (next <= 0) return null;
        return { ...prev, remainingSeconds: next };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [proactiveBanner?.trigger.agent.agentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const brainButton = getBrainButtonState(
    agents.length,
    startScene.isPending,
    brainEnabled,
  );

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

  /** AgentPanel 耳语发送 → Brain 注入或本地一次性指令 */
  const handlePanelWhisper = useCallback(
    async (message: string) => {
      if (!selectedAgentId) return;
      if (isWhisperMoveNearIntent(message)) {
        brainWhisperTracker.cancel();
        const target = resolveWhisperMoveTarget(
          message,
          selectedAgentId,
          agents,
        );
        const mapScene = gameRef.current?.scene.getScene("MapScene") as
          | MapScene
          | undefined;
        if (!target || !mapScene) {
          gameRef.current?.events.emit(
            "agent-whisper-feedback",
            selectedAgentId,
            target ? "当前无法移动" : "没有找到要靠近的 Agent",
          );
          return;
        }
        mapScene.moveAgentNear(selectedAgentId, target.agentId);
        return;
      }
      if (brainEnabled && sceneWorldId) {
        try {
          await injectEvent.mutateAsync({
            worldId: sceneWorldId,
            type: "agent_action",
            targetAgentId: selectedAgentId,
            description: message,
          });
          const actor = agents.find(
            (agent) => agent.agentId === selectedAgentId,
          );
          const target = resolveMentionedWhisperTarget(
            message,
            selectedAgentId,
            agents,
          );
          const mapScene = gameRef.current?.scene.getScene("MapScene") as
            | MapScene
            | undefined;
          mapScene?.preparePriorityBrainDialogue();
          brainWhisperTracker.start(
            {
              actorId: selectedAgentId,
              actorName: actor?.name ?? selectedAgentId,
              targetId: target?.agentId,
              targetName: target?.name,
            },
            paused,
          );
        } catch {
          gameRef.current?.events.emit(
            "agent-whisper-feedback",
            selectedAgentId,
            "耳语发送失败，请稍后重试",
          );
        }
        return;
      }
      gameRef.current?.events.emit("agent-whisper", selectedAgentId, message);
      // 成就：耳语调教师
      const wc = (parseInt(localStorage.getItem("whisper-count") || "0", 10) || 0) + 1;
      localStorage.setItem("whisper-count", String(wc));
      if (wc >= 20) unlock("scene-whisperer");
    },
    [
      brainEnabled,
      brainWhisperTracker,
      injectEvent,
      agents,
      paused,
      sceneWorldId,
      selectedAgentId,
    ],
  );

  /** BRAIN OFF: user speaks directly to the selected Agent. */
  const handlePanelTalk = useCallback(
    (message: string) => {
      if (!selectedAgentId) return;
      const mapScene = gameRef.current?.scene.getScene("MapScene") as
        | MapScene
        | undefined;
      void mapScene?.receiveUserMessage(selectedAgentId, message);
    },
    [selectedAgentId],
  );

  /** BRAIN OFF: route a validated structured command to Phaser. */
  const handleLocalCommand = useCallback((command: LocalAgentCommand) => {
    const mapScene = gameRef.current?.scene.getScene("MapScene") as
      | MapScene
      | undefined;
    mapScene?.executeLocalCommand(command);
  }, []);

  /** 暂停/继续：Brain 模式下保持前后端状态一致。 */
  const handleTogglePause = useCallback(async () => {
    if (sceneControlPending) return;
    const mapScene = gameRef.current?.scene.getScene("MapScene") as
      | MapScene
      | undefined;
    if (!mapScene) return;

    setSceneControlPending(true);
    setSceneControlError(null);
    try {
      const result = await synchronizeScenePause({
        paused,
        scene: mapScene,
        brainEnabled,
        worldId: sceneWorldId,
        pauseWorld: (worldId) => pauseWorld.mutateAsync(worldId),
        resumeWorld: (worldId) => resumeWorld.mutateAsync(worldId),
      });
      setPaused(result.paused);
      setSceneControlError(result.error);
    } finally {
      setSceneControlPending(false);
    }
  }, [
    brainEnabled,
    pauseWorld,
    paused,
    resumeWorld,
    sceneControlPending,
    sceneWorldId,
  ]);

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
      const mapScene = gameRef.current?.scene.getScene("MapScene") as
        | MapScene
        | undefined;
      mapScene?.restoreAgents(cp.agents);
      setAgents(cp.agents);
      saveAgents(mapId, cp.agents);
      // BUG-038 修复：强制覆盖 Phaser 精灵坐标
      const ms = gameRef.current?.scene.getScene("MapScene") as any;
      ms?.restoreAgents?.(cp.agents);
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

  // ── Step 98/99: 主动搭话处理 ──

  const handleProactiveTrigger = useCallback((trigger: ProactiveTrigger) => {
    setProactiveBanner({ trigger, remainingSeconds: 60 });
    // 成就：搭话王
    const pc = (parseInt(localStorage.getItem("proactive-count") || "0", 10) || 0) + 1;
    localStorage.setItem("proactive-count", String(pc));
    if (pc >= 5) unlock("scene-proactive");
    // Agent 跳动动画
    const ms = gameRef.current?.scene.getScene("MapScene") as MapScene | undefined;
    const sprite = ms?.getAgentSprite(trigger.agent.agentId);
    (sprite as any)?.playBounce?.();
  }, []);

  const handleProactiveTimeout = useCallback((_agentId: string) => {
    setProactiveBanner(null);
  }, []);

  // 同步 chatActiveRef 供 idle timer 读取
  useEffect(() => {
    chatActiveRef.current = !!(chatActive || proactiveBanner);
  }, [chatActive, proactiveBanner]);

  const handleProactiveAccept = useCallback(() => {
    if (!proactiveBanner) return;
    const { trigger } = proactiveBanner;
    setProactiveBanner(null);

    // 冻结场景 + 锁定 Agent
    const game = gameRef.current;
    const freezeAgents = game?.registry.get("freezeAgents") as (() => void) | undefined;
    const lockAgent = game?.registry.get("lockAgent") as ((id: string) => void) | undefined;
    freezeAgents?.();
    lockAgent?.(trigger.agent.agentId);

    // 先用硬编码选项（立即显示），再异步获取 LLM 选项
    const fallbackOptions = getChatOptions(trigger.topicCategory as TopicCategory);
    setChatActive({ trigger, options: fallbackOptions });

    // 通知 ProactiveChatManager
    const proactive = game?.registry.get("proactiveManager") as any;
    proactive?.accept(trigger.agent.agentId);

    // 异步获取 LLM 选项（静默替换，不阻塞 UI）
    generateChatOptionsLLM(
      trigger.topic,
      trigger.agent.name,
      trigger.agent.emotion,
      mapId,
    ).then((llmOptions) => {
      if (llmOptions) {
        setChatActive((prev) => prev && prev.trigger === trigger
          ? { ...prev, options: llmOptions }
          : prev);
      }
    });
  }, [proactiveBanner, mapId]);

  const handleProactiveIgnore = useCallback(() => {
    if (!proactiveBanner) return;
    const { trigger } = proactiveBanner;
    setProactiveBanner(null);

    const game = gameRef.current;
    const proactive = game?.registry.get("proactiveManager") as any;
    proactive?.ignore(trigger.agent.agentId);

    // Agent 失落动画
    const ms = game?.scene.getScene("MapScene") as MapScene | undefined;
    const sprite = ms?.getAgentSprite(trigger.agent.agentId);
    (sprite as any)?.playDisappointed?.();
  }, [proactiveBanner]);

  /** 手动触发主动搭话 */
  const handleForceProactive = useCallback(() => {
    const proactive = gameRef.current?.registry.get("proactiveManager") as any;
    const ok = proactive?.forceTrigger?.();
    if (!ok) {
      // 触发失败（无可用 Agent / 已暂停 / 冷却中）
      console.log("[ProactiveChat] 手动触发失败：无可用 Agent 或场景暂停中");
    }
  }, []);

  const handleChatEnd = useCallback((history: Array<{ speaker: string; text: string; optionUsed?: string }>) => {
    if (!chatActive) return;
    const { trigger } = chatActive;
    setChatActive(null);

    // 记录对话历史
    const lastUserMsg = history.filter((h) => h.speaker === "user").pop();
    if (lastUserMsg?.optionUsed) {
      chatHistory.addEntry({
        agentId: trigger.agent.agentId,
        agentName: trigger.agent.name,
        choice: lastUserMsg.optionUsed as "A" | "B" | "C",
        topic: trigger.topic,
        timestamp: Date.now(),
      });
    }

    // 恢复场景
    const game = gameRef.current;
    const unfreezeAgents = game?.registry.get("unfreezeAgents") as (() => void) | undefined;
    const unlockAgent = game?.registry.get("unlockAgent") as ((id: string) => void) | undefined;
    const proactive = game?.registry.get("proactiveManager") as any;
    unlockAgent?.(trigger.agent.agentId);
    unfreezeAgents?.();
    proactive?.endConversation();
  }, [chatActive, chatHistory]);

  // ── Step 99c: 涂鸦切换（与 emoji 模式互斥）──
  const handleToggleGraffiti = useCallback(() => {
    setGraffitiEnabled((prev) => {
      const next = !prev;
      const ms = gameRef.current?.scene.getScene("MapScene") as MapScene | undefined;
      ms?.setGraffitiEnabled(next);
      if (next) {
        // 关闭 emoji 模式
        setEmojiMode(false);
        ms?.setEmojiMode(false);
      }
      return next;
    });
  }, []);

  // ── Step 99b: Emoji 模式切换（与涂鸦互斥）──
  const handleToggleEmojiMode = useCallback(() => {
    setEmojiMode((prev) => {
      const next = !prev;
      const ms = gameRef.current?.scene.getScene("MapScene") as MapScene | undefined;
      ms?.setEmojiMode(next);
      if (next) {
        // 关闭涂鸦模式
        setGraffitiEnabled(false);
        ms?.setGraffitiEnabled(false);
      }
      return next;
    });
  }, []);

  const handleSelectEmoji = useCallback((emoji: string) => {
    setSelectedEmoji(emoji);
    // 更新 EmojiDrop 当前选中的 emoji
    const ms = gameRef.current?.scene.getScene("MapScene") as any;
    if (ms?.emojiDrop) {
      (ms.emojiDrop as any).setSelectedEmoji?.(emoji);
    }
  }, []);

  // ── 画布空白点击 → 取消选中 Agent ──
  useEffect(() => {
    const game = gameRef.current;
    if (!game) return;
    const handler = () => setSelectedAgentId(null);
    game.events.on("canvas-deselect", handler);
    return () => { game.events.off("canvas-deselect", handler); };
  }, [gameReady]); // eslint-disable-line react-hooks/exhaustive-deps

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
      <div className="w-80 shrink-0 overflow-y-auto p-4 space-y-3 border-r border-border">
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

        {/* State 4: Brain 开关 */}
        <Card className="p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-text-secondary">
              🧠 AI 驱动
            </span>
            <button
              type="button"
              onClick={() => {
                if (brainEnabled) {
                  brainWhisperTracker.cancel();
                  setBrainEnabled(false);
                  setSceneWorldId(null);
                  setBrainConnectionError(null);
                } else {
                  void startBrain();
                }
              }}
              disabled={brainButton.disabled}
              title={brainButton.title}
              className={`px-3 py-1 text-xs font-mono rounded border transition-colors ${
                brainEnabled
                  ? "border-green-500/60 bg-green-500/10 text-green-400"
                  : "border-border text-text-secondary hover:border-text-secondary/40"
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              {brainButton.label}
            </button>
          </div>
          {brainEnabled && sceneWorldId && (
            <div className="mt-1 text-[10px] font-mono text-text-secondary truncate">
              World: {sceneWorldId.slice(0, 12)}...
            </div>
          )}
          {brainConnectionError && (
            <p className="mt-1 text-[10px] font-mono text-red-400">
              {brainConnectionError}
            </p>
          )}
        </Card>

        {/* 手动触发主动搭话 */}
        <Card className="p-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-mono text-text-secondary">
              💬 Agent 主动搭话
            </span>
            <button
              type="button"
              onClick={handleForceProactive}
              className="px-3 py-1.5 text-xs font-mono rounded border border-border text-text-secondary hover:border-accent-green/60 hover:text-accent-green hover:bg-accent-green/5 transition-colors"
            >
              立即触发搭话
            </button>
            <span className="text-[10px] font-mono text-text-secondary/60">
              随机选一个空闲的 Agent 来找你聊天
            </span>
          </div>
        </Card>

      </div>

      {/* ── 右侧画布区 ── */}
      <div className="flex-1 flex items-center justify-center p-4 relative">
        <GameCanvas
          mapId={mapId}
          agents={agents}
          brainEnabled={brainEnabled}
          onAgentClick={handleAgentClick}
          onAgentMove={handleAgentMove}
          onAgentDoubleClick={handleAgentDoubleClick}
          onGameReady={(g) => { gameRef.current = g; setGameReady(true); }}
          onProactiveTrigger={handleProactiveTrigger}
          onProactiveTimeout={handleProactiveTimeout}
        />

        {/* ── 交互模式指示器 ── */}
        <div className="absolute top-2 right-2 z-30 flex items-center gap-1.5">
          <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border transition-colors ${
            !emojiMode && !graffitiEnabled
              ? "border-accent-green/50 bg-accent-green/10 text-accent-green"
              : "border-border text-text-secondary"
          }`}>
            🖐️ 正常
          </span>
          {emojiMode && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-accent-orange/50 bg-accent-orange/10 text-accent-orange">
              🎯 Emoji
            </span>
          )}
          {graffitiEnabled && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-accent-blue/50 bg-accent-blue/10 text-accent-blue">
              ✏️ 涂鸦
            </span>
          )}
        </div>

        {/* ── Emoji 调色板（Emoji 模式时显示）── */}
        {emojiMode && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 px-3 py-2 rounded-xl bg-bg-secondary/90 backdrop-blur border border-accent-orange/30 shadow-lg">
            <span className="text-[10px] font-mono text-text-secondary mr-1">选择:</span>
            {EMOJI_PALETTE.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => handleSelectEmoji(emoji)}
                className={`w-9 h-9 flex items-center justify-center text-lg rounded-lg transition-all ${
                  selectedEmoji === emoji
                    ? "bg-accent-orange/20 border-2 border-accent-orange scale-110"
                    : "bg-bg-primary border border-border hover:border-accent-orange/40 hover:scale-105"
                }`}
              >
                {emoji}
              </button>
            ))}
            <span className="text-[10px] font-mono text-text-secondary ml-1">点击画布投掷</span>
          </div>
        )}

        {/* Step 99a: 自动暂停遮罩 */}
        {autoPaused && (
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm z-40 flex items-center justify-center cursor-pointer animate-fade-in"
            onClick={() => {
              setAutoPaused(false);
              const resumeAll = gameRef.current?.registry.get("resumeAll") as (() => void) | undefined;
              resumeAll?.();
            }}
          >
            <div className="text-center space-y-3">
              <p className="text-2xl">😴</p>
              <p className="text-lg font-mono text-text-primary">场景已暂停</p>
              <p className="text-sm font-mono text-text-secondary">（5 分钟无操作）</p>
              <p className="text-xs font-mono text-accent-orange mt-2">点击任意位置继续</p>
            </div>
          </div>
        )}

        {/* Step 99: 主动搭话横幅 */}
        {proactiveBanner && (
          <ProactiveBanner
            agent={proactiveBanner.trigger.agent}
            topic={proactiveBanner.trigger.topic}
            remainingSeconds={proactiveBanner.remainingSeconds}
            onAccept={handleProactiveAccept}
            onIgnore={handleProactiveIgnore}
          />
        )}

        {/* Step 99/99d: 主动搭话对话弹窗 */}
        {chatActive && (
          <ProactiveChat
            agent={chatActive.trigger.agent}
            topic={chatActive.trigger.topic}
            options={chatActive.options as ChatOption[]}
            onEnd={handleChatEnd}
            onCustomReply={async (userText: string) => {
              const llm = await generateCustomReplyLLM(
                userText,
                chatActive.trigger.agent.name,
                chatActive.trigger.agent.emotion,
                mapId,
              );
              return llm ?? { agentReaction: "嗯…好的。", agentEmotion: "neutral" };
            }}
            onRefreshOptions={async (history) => {
              const llmOptions = await generateChatOptionsLLM(
                chatActive.trigger.topic,
                chatActive.trigger.agent.name,
                chatActive.trigger.agent.emotion,
                mapId,
                history,
              );
              if (llmOptions) {
                setChatActive((prev) => prev && prev.trigger === chatActive.trigger
                  ? { ...prev, options: llmOptions }
                  : prev);
              }
            }}
          />
        )}
      </div>

      {/* ── 浮动面板（独立于布局）── */}
      {/* Agent 详情面板 */}
      <AgentPanel
        agent={selectedAgent}
        availableAgents={agents}
        brainEnabled={brainEnabled}
        brainPending={startScene.isPending}
        onClose={() => setSelectedAgentId(null)}
        onEmotionChange={handlePanelEmotion}
        onWhisper={handlePanelWhisper}
        onTalk={handlePanelTalk}
        onLocalCommand={handleLocalCommand}
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

      {/* ─ 底部控制面板组 ── */}
      <div className="mt-4 flex items-stretch gap-3 flex-1 min-h-0">
        {/* Agent 投放面板 */}
        <Card className="w-72 shrink-0 flex flex-col max-h-full">
          <div className="px-3 py-2 text-xs font-mono text-text-secondary shrink-0 border-b border-border">
            投放 Agent（{agents.length}/{agentPool.length}）
          </div>
          <div className="overflow-y-auto px-3 pb-3 flex-1">
            <div className="flex flex-col gap-1.5">
              {agentPool.map((def) => {
                const deployed = agents.find((a) => a.agentId === def.agentId);
                return (
                  <button
                    key={def.agentId}
                    type="button"
                    onClick={() =>
                      deployed ? removeAgent(def.agentId) : deployAgent(def)
                    }
                    className={`w-full text-left px-3 py-1.5 text-xs font-mono rounded border transition-colors flex items-center gap-2 ${
                      deployed
                        ? "border-accent-green/60 bg-accent-green/10 text-accent-green"
                        : "border-border text-text-secondary hover:border-text-secondary/40"
                    }`}
                  >
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: def.color }}
                    />
                    <span className="flex-1 truncate">{def.name}</span>
                    <span className="shrink-0 text-[10px]">{deployed ? "✓" : "+"}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </Card>

        {/* 导演面板 (Step 66) */}
        <Card className="w-80 shrink-0 flex flex-col">
          <div className="px-3 py-2 text-xs font-mono text-text-secondary shrink-0 border-b border-border" ref={directorRef}>
            导演模式
          </div>
          <div className="p-3 flex-1">
            <DirectorPanel
              weather={weather}
              onWeatherChange={handleWeatherChange}
              onGodVoice={handleGodVoice}
              onMoodAll={handleMoodAll}
              paused={paused || autoPaused}
            />

            {/* Step 99c: 涂鸦指令开关 */}
            <div className="mt-2 pt-2 border-t border-border space-y-1.5">
              <button
                type="button"
                onClick={handleToggleGraffiti}
                className={`w-full px-3 py-1.5 text-xs font-mono rounded border transition-colors ${
                  graffitiEnabled
                    ? "border-accent-blue/60 bg-accent-blue/10 text-accent-blue"
                    : "border-border text-text-secondary hover:border-text-secondary/40"
                }`}
              >
                ✏️ 涂鸦指令 {graffitiEnabled ? "开" : "关"}
              </button>
              {graffitiEnabled && (
                <p className="text-[10px] font-mono text-text-secondary">
                  按住画线→跟随 / 画圈→聚集 / 画叉→散开
                </p>
              )}

              {/* Step 99b: Emoji 模式开关 */}
              <button
                type="button"
                onClick={handleToggleEmojiMode}
                className={`w-full px-3 py-1.5 text-xs font-mono rounded border transition-colors ${
                  emojiMode
                    ? "border-accent-orange/60 bg-accent-orange/10 text-accent-orange"
                    : "border-border text-text-secondary hover:border-text-secondary/40"
                }`}
              >
                 Emoji 投掷 {emojiMode ? "开" : "关"}
              </button>
              {emojiMode && (
                <p className="text-[10px] font-mono text-text-secondary">
                  选 emoji → 点画布投掷 → Agent 反应
                </p>
              )}
            </div>
          </div>
        </Card>

        {/* 存档面板 */}
        <Card className="w-80 shrink-0 flex flex-col">
          <div className="px-3 py-2 text-xs font-mono text-text-secondary shrink-0 border-b border-border" ref={checkpointsRef}>
            存档管理
          </div>
          <div className="p-3 flex-1">
            <CheckpointPanel
              checkpoints={checkpoints}
              count={checkpoints.length}
              max={30}
              paused={paused}
              busy={sceneControlPending}
              onSave={handleSaveCheckpoint}
              onLoad={handleLoadCheckpoint}
              onDelete={handleDeleteCheckpoint}
              onTogglePause={handleTogglePause}
            />
            {sceneControlError && (
              <p
                role="alert"
                className="mt-2 text-[10px] font-mono text-red-400"
              >
                {sceneControlError}
              </p>
            )}
          </div>
        </Card>

        {/* 已投放 Agent 情绪控制 */}
        {agents.length > 0 && (
          <Card className="w-[720px] shrink-0 flex flex-col">
            <div className="px-3 py-2 text-xs font-mono text-text-secondary shrink-0 border-b border-border">
              情绪控制
            </div>
            <div className="p-3 overflow-y-auto flex-1">
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
                    <div className="flex flex-wrap gap-1">
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
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )}
      </div>

    </div>
  );
}
