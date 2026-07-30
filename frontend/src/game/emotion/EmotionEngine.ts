/**
 * EmotionEngine — 每个 Agent 持有一个情绪控制器。
 *
 * 五重触发链：
 *   1. 对话触发 — 关键词匹配 → 情绪倾向±
 *   2. 环境触发 — 场景类型 + 邻近物品 → 定期调整
 *   3. 社交触发 — 附近同情绪 Agent → 共鸣（同步情绪）
 *   4. 随机事件 — 场景突发事件 → 全员情绪波动
 *   5. decay     — 每 15s 向 neutral 回归 1 格
 *
 * 66-S 新增。原先 MapScene 只有 setAllEmotions()，现在每个 Agent 独立管理情绪状态。
 */

import type { Emotion } from "../sprites/AgentSprite";

// ── 情绪强度（离 neutral 的距离） ──
export type EmotionIntensity = 0 | 1 | 2 | 3 | 4;

export interface EmotionState {
  emotion: Emotion;
  intensity: EmotionIntensity;
  /** 情绪持续时间戳（用于 decay 计时） */
  since: number;
  /** 前一个情绪（用于回归 neutral 后恢复） */
  previous: Emotion;
}

export interface EmotionChange {
  agentId: string;
  emotion: Emotion;
  intensity: EmotionIntensity;
  trigger: "dialogue" | "environment" | "social" | "random" | "decay" | "manual";
  detail: string;
}

// ── 关键词 → 情绪映射 ──
interface KeywordRule {
  keywords: RegExp;
  emotion: Emotion;
  /** 触发后增加的强度 */
  addIntensity: number;
}

const KEYWORD_RULES: KeywordRule[] = [
  { keywords: /天哪|好美|好棒|太棒|厉害|好可爱|漂亮|绝了|好喜欢|开心|太好|真好看|超赞/g,  emotion: "happy",    addIntensity: 2 },
  { keywords: /好萌|可爱|哇|好温柔|好暖|好赞/g,                                                         emotion: "happy",    addIntensity: 1 },
  { keywords: /不是吧|什么|怎么|为啥|为什么|搞不懂|不懂|奇怪|诡异/g,                                     emotion: "confused", addIntensity: 2 },
  { keywords: /真的假的|不会吧|你说啥|听错/g,                                                             emotion: "confused", addIntensity: 1 },
  { keywords: /烦|别|够了|又|滚|讨厌|闭嘴|吵|走开|别烦|别闹|够了啊/g,                                   emotion: "angry",    addIntensity: 2 },
  { keywords: /生气|火大|过分|受不了/g,                                                                    emotion: "angry",    addIntensity: 2 },
  { keywords: /累|睡|困|算了|随便|无所谓|不想|懒得|没劲|不想动/g,                                       emotion: "tired",    addIntensity: 2 },
  { keywords: /好累|累了|歇|休息|躺/g,                                                                     emotion: "tired",    addIntensity: 1 },
  { keywords: /如果|想想|或许|好像|也许|可能|大概/g,                                                       emotion: "neutral",  addIntensity: -1 }, // 拉回中性
  { keywords: /啊|哦|嗯|好吧|行吧|可以|了解|知道了|收到/g,                                               emotion: "neutral",  addIntensity: -1 },
  { keywords: /什么!|天!|啊!|哇!|Oh|不会吧!|我的天/g,                                                    emotion: "surprised",addIntensity: 2 },
  { keywords: /真的吗|是吗|居然|竟然|不可思议/g,                                                           emotion: "surprised",addIntensity: 1 },
  { keywords: /加油|冲|干|搞定|拼|拿下|必拿下/g,                                                           emotion: "excited",  addIntensity: 2 },
  { keywords: /好激动|兴奋|期待|等不及|快开始/g,                                                            emotion: "excited",  addIntensity: 1 },
  { keywords: /担心|紧张|害怕|来不及|完了|糟了|怎么办|惨了/g,                                            emotion: "anxious",  addIntensity: 2 },
  { keywords: /有点慌|不太妙|好像不对劲/g,                                                                 emotion: "anxious",  addIntensity: 1 },
  { keywords: /难过|伤心|想哭|遗憾|可惜|要是...就好了/g,                                                   emotion: "sad",      addIntensity: 2 },
  { keywords: /唉|算了|没事|没关系/g,                                                                      emotion: "sad",      addIntensity: 1 },
];

// ── 场景环境情绪偏向 ──
const SCENE_MOOD: Record<string, { emotion: Emotion; bias: number }> = {
  library:   { emotion: "neutral",  bias: 1 },   // 安静 → 压抑兴奋
  dorm:      { emotion: "tired",    bias: 1 },   // 宿舍 → 想睡
  classroom: { emotion: "anxious",  bias: 1 },   // 教室 → 焦虑
  art:       { emotion: "happy",    bias: 1 },   // 艺术 → 愉悦
  lab:       { emotion: "confused", bias: 1 },   // 实验室 → 困惑
  sakura:    { emotion: "happy",    bias: 2 },   // 樱花 → 很开心
};

// ── 物品情绪影响 ──
const ITEM_MOOD: Record<string, { emotion: Emotion; intensity: number }> = {
  bed:      { emotion: "tired",    intensity: 1 },
  piano:    { emotion: "happy",    intensity: 1 },
  easel:    { emotion: "neutral",  intensity: 1 },
  pc:       { emotion: "confused", intensity: 1 },
  tree:     { emotion: "happy",    intensity: 1 },
  vending:  { emotion: "excited",  intensity: 1 },
  plant:    { emotion: "neutral",  intensity: 1 },
  sofa:     { emotion: "tired",    intensity: 1 },
  globe:    { emotion: "surprised",intensity: 1 },
  fountain: { emotion: "happy",    intensity: 1 },
};

// ── 场景随机事件池 ──
export interface SceneEvent {
  id: string;
  text: string;
  /** 影响范围 */
  target: "all" | "random" | "scene";
  /** 触发的情绪变化 */
  effect: { emotion: Emotion; intensity: number };
  /** 出现的场景（undefined = 全部） */
  scenes?: string[];
}

const RANDOM_EVENTS: SceneEvent[] = [
  // 图书馆
  { id:"ev_lib_01", text:"📚 图书馆突然停电了！应急灯亮起…", target:"all", effect:{emotion:"anxious",intensity:2}, scenes:["library"] },
  { id:"ev_lib_02", text:"📖 有人在书架间发现了一本绝版书", target:"random", effect:{emotion:"surprised",intensity:2}, scenes:["library"] },
  { id:"ev_lib_03", text:"🤫 自习区有人在大声讨论", target:"all", effect:{emotion:"angry",intensity:1}, scenes:["library"] },
  { id:"ev_lib_04", text:"☀️ 阳光透过窗户洒在书桌上", target:"all", effect:{emotion:"happy",intensity:1}, scenes:["library"] },
  // 宿舍
  { id:"ev_dorm_01", text:"📦 外卖到了！", target:"all", effect:{emotion:"excited",intensity:2}, scenes:["dorm"] },
  { id:"ev_dorm_02", text:"😴 暖气太足，所有人都昏昏欲睡…", target:"all", effect:{emotion:"tired",intensity:2}, scenes:["dorm"] },
  { id:"ev_dorm_03", text:"🎵 隔壁开始放音乐", target:"random", effect:{emotion:"happy",intensity:2}, scenes:["dorm"] },
  // 教室
  { id:"ev_cls_01", text:"📢 老师临时宣布随堂测验！", target:"all", effect:{emotion:"anxious",intensity:3}, scenes:["classroom"] },
  { id:"ev_cls_02", text:"🏃 下课铃声响起——解放！", target:"all", effect:{emotion:"excited",intensity:2}, scenes:["classroom"] },
  { id:"ev_cls_03", text:"💡 有人提出了一个绝妙的解题思路", target:"random", effect:{emotion:"surprised",intensity:2}, scenes:["classroom"] },
  { id:"ev_cls_04", text:"🖥️ 投影仪又坏了…", target:"all", effect:{emotion:"angry",intensity:1}, scenes:["classroom"] },
  // 艺术中心
  { id:"ev_art_01", text:"🎹 有人在弹钢琴，旋律好美", target:"all", effect:{emotion:"happy",intensity:2}, scenes:["art"] },
  { id:"ev_art_02", text:"🎨 新画展开放了！", target:"all", effect:{emotion:"excited",intensity:2}, scenes:["art"] },
  { id:"ev_art_03", text:"🖼️ 一幅画掉下来了…大家吓了一跳", target:"all", effect:{emotion:"surprised",intensity:2}, scenes:["art"] },
  // 实验室
  { id:"ev_lab_01", text:"🧪 实验数据突然对上了！", target:"random", effect:{emotion:"excited",intensity:3}, scenes:["lab"] },
  { id:"ev_lab_02", text:"⚠️ 试剂颜色变奇怪了…", target:"all", effect:{emotion:"anxious",intensity:2}, scenes:["lab"] },
  { id:"ev_lab_03", text:"🎉 实验结果出来了，完美！", target:"all", effect:{emotion:"happy",intensity:2}, scenes:["lab"] },
  { id:"ev_lab_04", text:"💻 程序跑崩了——又要重来", target:"all", effect:{emotion:"angry",intensity:2}, scenes:["lab"] },
  // 樱花大道
  { id:"ev_sak_01", text:"🌸 一阵风吹过，花瓣纷纷飘落", target:"all", effect:{emotion:"happy",intensity:3}, scenes:["sakura"] },
  { id:"ev_sak_02", text:"☁️ 天空突然阴沉下来…要下雨了？", target:"all", effect:{emotion:"anxious",intensity:1}, scenes:["sakura"] },
  { id:"ev_sak_03", text:"🦋 一只蝴蝶飞过，落在花瓣上", target:"all", effect:{emotion:"surprised",intensity:1}, scenes:["sakura"] },
  { id:"ev_sak_04", text:"📸 有人在拍照，这里真美", target:"random", effect:{emotion:"excited",intensity:1}, scenes:["sakura"] },
  // 通用事件（任意场景）
  { id:"ev_gen_01", text:"⚡ 一道闪电划破天空！", target:"all", effect:{emotion:"surprised",intensity:2} },
  { id:"ev_gen_02", text:"📱 所有人同时收到了消息通知…", target:"all", effect:{emotion:"confused",intensity:1} },
  { id:"ev_gen_03", text:"🎂 今天好像是某人的生日？", target:"random", effect:{emotion:"excited",intensity:2} },
];

// ── 人格基础情绪倾向（按 MBTI 推导，未知用 hash）──
function baseEmotionFromName(name: string): Emotion {
  // 旧 mock Agent 兼容
  const known: Record<string, Emotion> = {
    "小林": "neutral", "小红": "happy", "小刚": "neutral",
    "小雪": "neutral", "阿杰": "excited",
  };
  if (known[name]) return known[name];
  // 新 Agent：name hash → 随机但从 stable 基础情绪
  const emotions: Emotion[] = ["neutral", "neutral", "happy", "neutral", "excited", "neutral", "tired", "neutral"];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = ((h << 5) + h + name.charCodeAt(i)) | 0;
  return emotions[Math.abs(h) % emotions.length];
}

// ================================================================
// EmotionEngine
// ================================================================

export class EmotionEngine {
  private states: Map<string, EmotionState> = new Map();
  private decayTimer: ReturnType<typeof setInterval> | null = null;
  private eventTimer: ReturnType<typeof setInterval> | null = null;
  private envTimer: ReturnType<typeof setInterval> | null = null;

  /** 情绪变更回调（→ MapScene 更新 sprite） */
  private onChange: ((changes: EmotionChange[]) => void) | null = null;
  /** 随机事件回调（→ MapScene 显示通知） */
  private onEvent: ((event: SceneEvent) => void) | null = null;

  private currentScene = "library";

  // ── 注册 ──

  registerAgent(agentId: string, name: string): void {
    if (this.states.has(agentId)) return;
    const base = baseEmotionFromName(name);
    this.states.set(agentId, {
      emotion: base,
      intensity: 0,
      since: Date.now(),
      previous: "neutral",
    });
  }

  unregisterAgent(agentId: string): void {
    this.states.delete(agentId);
  }

  /** 绑定变更监听 */
  onEmotionChange(cb: (changes: EmotionChange[]) => void): void {
    this.onChange = cb;
  }

  /** 绑定随机事件监听 */
  onRandomEvent(cb: (event: SceneEvent) => void): void {
    this.onEvent = cb;
  }

  setScene(sceneId: string): void {
    this.currentScene = sceneId;
  }

  getEmotion(agentId: string): Emotion {
    return this.states.get(agentId)?.emotion ?? "neutral";
  }

  getAllStates(): Map<string, EmotionState> {
    return new Map(this.states);
  }

  // ── 启动/停止 ──

  /** 启动情绪引擎（decay + 环境 + 随机事件三条定时线） */
  start(): void {
    this.stop();
    // Decay：每 30s 向 neutral 回归（降低频率）
    this.decayTimer = setInterval(() => this.decayTick(), 30_000);
    // 环境：每 30s 根据场景类型微调（降低频率）
    this.envTimer = setInterval(() => this.environmentTick(), 30_000);
    // 随机事件：每 35-65s 随机触发
    this.scheduleRandomEvent();
  }

  stop(): void {
    if (this.decayTimer) { clearInterval(this.decayTimer); this.decayTimer = null; }
    if (this.eventTimer) { clearTimeout(this.eventTimer); this.eventTimer = null; }
    if (this.envTimer) { clearInterval(this.envTimer); this.envTimer = null; }
  }

  destroy(): void {
    this.stop();
    this.states.clear();
    this.onChange = null;
    this.onEvent = null;
  }

  // ── 1. 对话触发 ──

  /**
   * 分析对话文本中的关键词，触发情绪变化。
   * 在对话气泡弹出时调用。
   */
  onDialogue(agentId: string, text: string): EmotionChange | null {
    const state = this.states.get(agentId);
    if (!state) return null;

    let best: { emotion: Emotion; add: number } | null = null;

    for (const rule of KEYWORD_RULES) {
      rule.keywords.lastIndex = 0;
      const matches = text.match(rule.keywords);
      if (matches && matches.length > 0) {
        // 取匹配数最多的规则
        if (!best || matches.length > (best.add > 0 ? 1 : 0)) {
          best = { emotion: rule.emotion, add: rule.addIntensity };
        }
      }
    }

    if (!best) return null;

    const change = this.applyEmotionChange(agentId, best.emotion, best.add, "dialogue", text.slice(0, 30));
    return change;
  }

  // ── 2. 环境触发 ──

  /** 场景类型 + 邻近物品 → 定期情绪修正 */
  private environmentTick(): void {
    const changes: EmotionChange[] = [];
    const sceneMood = SCENE_MOOD[this.currentScene];

    for (const [agentId, state] of this.states) {
      if (state.emotion === "neutral" && state.intensity === 0 && sceneMood) {
        // 场景氛围微弱影响
        const change = this.applyEmotionChange(
          agentId, sceneMood.emotion, sceneMood.bias, "environment",
          `场景氛围: ${this.currentScene}`,
        );
        if (change) changes.push(change);
      }
    }

    if (changes.length > 0 && this.onChange) this.onChange(changes);
  }

  /**
   * Agent 邻近物品 → 物品情绪影响。
   * 由 MapScene 在对话扫描时调用。
   */
  onNearItem(agentId: string, itemType: string): EmotionChange | null {
    const itemMood = ITEM_MOOD[itemType];
    if (!itemMood) return null;
    return this.applyEmotionChange(
      agentId, itemMood.emotion, itemMood.intensity,
      "environment", `靠近物品: ${itemType}`,
    );
  }

  // ── 3. 社交共鸣 ──

  /**
   * 检测附近 Agent 的情绪共鸣。
   * 由 MapScene 在对话扫描时调用。
   * 返回受共鸣影响的 Agent 变更列表。
   */
  onProximityCheck(
    pairs: Array<{ a: string; b: string; dist: number }>,
  ): EmotionChange[] {
    const changes: EmotionChange[] = [];

    for (const { a, b, dist } of pairs) {
      if (dist > 3) continue; // 只有 3 tile 内才共鸣
      const sA = this.states.get(a);
      const sB = this.states.get(b);
      if (!sA || !sB) continue;

      // 情绪相同 → 互相放大
      if (sA.emotion === sB.emotion && sA.emotion !== "neutral") {
        const boost = sA.intensity < 4 ? 1 : 0;
        if (boost > 0) {
          const cA = this.applyEmotionChange(a, sA.emotion, boost, "social", `共鸣: ${b}`);
          const cB = this.applyEmotionChange(b, sB.emotion, boost, "social", `共鸣: ${a}`);
          if (cA) changes.push(cA);
          if (cB) changes.push(cB);
        }
      }

      // 情绪相反 → 互相中和（如 happy vs angry）
      if (
        (sA.emotion === "happy" && sB.emotion === "angry") ||
        (sA.emotion === "angry" && sB.emotion === "happy")
      ) {
        const cA = this.applyEmotionChange(a, "neutral", -1, "social", `冲突中和: ${b}`);
        const cB = this.applyEmotionChange(b, "neutral", -1, "social", `冲突中和: ${a}`);
        if (cA) changes.push(cA);
        if (cB) changes.push(cB);
      }
    }

    return changes;
  }

  // ── 4. Decay ──

  private decayTick(): void {
    const changes: EmotionChange[] = [];

    for (const [agentId, state] of this.states) {
      if (state.emotion === "neutral" || state.intensity === 0) continue;

      // 每 15s 降一级
      const change = this.applyEmotionChange(
        agentId, "neutral", -1, "decay", "自然消退",
      );
      if (change) changes.push(change);
    }

    if (changes.length > 0 && this.onChange) this.onChange(changes);
  }

  // ── 5. 随机事件 ──

  private scheduleRandomEvent(): void {
    const delay = 30_000 + Math.random() * 40_000; // 30-70s
    this.eventTimer = setTimeout(() => {
      this.fireRandomEvent();
      this.scheduleRandomEvent();
    }, delay);
  }

  private fireRandomEvent(): void {
    // 筛选当前场景匹配的事件
    const pool = RANDOM_EVENTS.filter(
      (e) => !e.scenes || e.scenes.includes(this.currentScene),
    );
    if (pool.length === 0) return;
    const event = pool[Math.floor(Math.random() * pool.length)];

    // 通知 MapScene 显示通知
    this.onEvent?.(event);

    // 应用情绪效果
    const changes: EmotionChange[] = [];
    const agentIds = [...this.states.keys()];

    if (event.target === "all") {
      for (const id of agentIds) {
        const c = this.applyEmotionChange(
          id, event.effect.emotion, event.effect.intensity,
          "random", event.text.slice(0, 30),
        );
        if (c) changes.push(c);
      }
    } else if (event.target === "random" && agentIds.length > 0) {
      const id = agentIds[Math.floor(Math.random() * agentIds.length)];
      const c = this.applyEmotionChange(
        id, event.effect.emotion, event.effect.intensity + 1, // 单人体更强
        "random", event.text.slice(0, 30),
      );
      if (c) changes.push(c);
    }

    if (changes.length > 0 && this.onChange) this.onChange(changes);
  }

  /** 手动触发随机事件（上帝模式） */
  triggerEvent(event: SceneEvent): EmotionChange[] {
    const changes: EmotionChange[] = [];
    const agentIds = [...this.states.keys()];

    if (event.target === "all") {
      for (const id of agentIds) {
        const c = this.applyEmotionChange(id, event.effect.emotion, event.effect.intensity, "random", event.text);
        if (c) changes.push(c);
      }
    } else if (event.target === "random" && agentIds.length > 0) {
      const id = agentIds[Math.floor(Math.random() * agentIds.length)];
      const c = this.applyEmotionChange(id, event.effect.emotion, event.effect.intensity, "random", event.text);
      if (c) changes.push(c);
    }

    if (changes.length > 0 && this.onChange) this.onChange(changes);
    return changes;
  }

  /** 手动设置情绪（上帝模式/导演面板） */
  setEmotion(agentId: string, emotion: Emotion, intensity: EmotionIntensity = 2): EmotionChange | null {
    return this.applyEmotionChange(agentId, emotion, intensity, "manual", "手动设置");
  }

  // ── 核心：情绪变更逻辑 ──

  /**
   * 对单个 Agent 的情绪进行增量修改。
   * addIntensity > 0 → 强化目标情绪
   * addIntensity < 0 → 向 neutral 回归
   */
  private applyEmotionChange(
    agentId: string,
    targetEmotion: Emotion,
    addIntensity: number,
    trigger: EmotionChange["trigger"],
    detail: string,
  ): EmotionChange | null {
    const state = this.states.get(agentId);
    if (!state) return null;

    const now = Date.now();

    if (targetEmotion === "neutral" || addIntensity < 0) {
      // 向 neutral 回归
      const newIntensity = Math.max(0, state.intensity + addIntensity) as EmotionIntensity;
      if (newIntensity === state.intensity) return null;

      state.intensity = newIntensity;
      state.since = now;
      if (newIntensity === 0) {
        state.previous = state.emotion;
        state.emotion = "neutral";
      }

      return {
        agentId,
        emotion: state.emotion,
        intensity: state.intensity,
        trigger,
        detail,
      };
    }

    // 正向触发：如果是同情绪 → 加强；不同情绪 → 覆盖（如果新强度 > 当前）
    if (state.emotion === targetEmotion) {
      const newIntensity = Math.min(4, state.intensity + addIntensity) as EmotionIntensity;
      if (newIntensity === state.intensity) return null;
      state.intensity = newIntensity;
      state.since = now;
    } else {
      // 新情绪：只有强度足够覆盖时才替换
      const newIntensity = Math.min(4, addIntensity) as EmotionIntensity;
      if (state.intensity > newIntensity) return null; // 当前情绪更强，不覆盖
      state.previous = state.emotion;
      state.emotion = targetEmotion;
      state.intensity = newIntensity;
      state.since = now;
    }

    return {
      agentId,
      emotion: state.emotion,
      intensity: state.intensity,
      trigger,
      detail,
    };
  }
}

/** 导出一个便捷的全局单例 */
export const emotionEngine = new EmotionEngine();

/** 导出事件池供 DirectorPanel 使用 */
export { RANDOM_EVENTS };
