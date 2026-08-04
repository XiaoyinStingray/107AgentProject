/**
 * ProactiveChatManager — Step 98: 主动搭话引擎。
 *
 * 定时扫描场景中的 Agent，符合条件时触发主动搭话。
 * 通过 Phaser game.events 与 UI 层通信。
 *
 * 触发规则:
 *   1. 每 4-8 分钟随机扫描
 *   2. Agent 空闲（不在对话/操作中）
 *   3. 同一 Agent 10 分钟内不重复搭话
 *   4. 同一时间只允许一个 Agent 搭话
 *   5. 用户 2 分钟内有交互才触发（排除挂机）
 */

import type { AgentSpriteData } from "./sprites/AgentSprite";

// ── 话题模板（按场景 × 人格类型） ──
type MbtiGroup = "E_" | "I_"; // 外向/内向简化分组

const TOPIC_POOL: Record<string, Record<MbtiGroup, string[]>> = {
  library: {
    E_: [
      "你看过这本书吗？封面好有意思！",
      "嗨——你是来复习还是来看闲书的？",
      "好安静啊…要不要一起去外面透透气？",
      "我发现了一本超有趣的书，你想看看吗？",
      "这里的 WiFi 密码是多少来着？",
    ],
    I_: [
      "我在看一本很有意思的书，你想听听吗？",
      "这里的座位利用率不太合理，你觉得呢？",
      "你有没有想过…如果每一本书都是一个世界？",
      "你看起来很专注——打扰一下没关系吧？",
      "这个角落的光线刚刚好。",
    ],
  },
  dorm: {
    E_: [
      "外卖到了！你点了什么？",
      "今晚打游戏吗？三缺一！",
      "周末要不要一起出去玩？",
      "你听说了吗——隔壁宿舍…",
      "好无聊啊，聊聊天吧？",
    ],
    I_: [
      "好像要下雨了……你有没有闻到雨的味道？",
      "你昨天晚上说梦话了，你知道吗？",
      "窗外的鸟好吵，不过也挺好听的。",
      "房间有点乱——不过乱得很有生活气息。",
      "你平时在宿舍喜欢做什么？",
    ],
  },
  classroom: {
    E_: [
      "这课好无聊啊…你觉得呢？",
      "下课去食堂吗？一起？",
      "老师刚才说的那个你听懂了吗？",
      "笔记借我抄抄呗～",
      "你知道下次考试考什么吗？",
    ],
    I_: [
      "你有没有想过…如果考试突然取消会怎样？",
      "这堂课的内容让我想到一个很有意思的问题。",
      "你看起来很认真——能问你一个问题吗？",
      "窗外的光线刚好照在你的桌上，很好看。",
      "我觉得今天的内容其实可以换个角度理解。",
    ],
  },
  art: {
    E_: [
      "天哪这里好棒！你经常来吗？",
      "我有个大胆的想法——行为艺术！",
      "这配色绝了！是你画的吗？",
      "钢琴声好好听，你知道是什么曲子吗？",
      "加我一个！我也想试试！",
    ],
    I_: [
      "这里的氛围好适合发呆……",
      "你有没有画过画？哪怕是随便涂两笔？",
      "颜色好像在说话——你感觉到了吗？",
      "安静地听钢琴，时间好像变慢了。",
      "我有时候会来这里只是想坐一会儿。",
    ],
  },
  lab: {
    E_: [
      "数据跑完了吗？我的还在跑…",
      "不是吧，数据又崩了？！",
      "我有个大胆的想法：改个参数试试！",
      "你发现了什么有意思的现象？",
      "实验失败就当行为艺术——对吧？",
    ],
    I_: [
      "你有没有想过…实验失败也是一种成功？",
      "数据好像在讲故事——你看到了吗？",
      "试剂颜色好漂亮，虽然可能不太对。",
      "这个现象好神奇，我想再观察一会儿。",
      "小心那个烧杯——不过它确实很好看。",
    ],
  },
  sakura: {
    E_: [
      "天哪好美！！快帮我拍照！",
      "花瓣飘下来了——你看你看！",
      "我想在樱花树下野餐——一起吗？",
      "春天真好啊！你最喜欢哪个季节？",
      "拍照吗？我帮你拍一百张！",
    ],
    I_: [
      "你有没有想过…花瓣最后会飘到哪里去？",
      "好温柔的风——好像在说话。",
      "时间好像慢了。想在这里坐一整天。",
      "每一朵花都不一样——你注意到了吗？",
      "春天真的好短。不过正因如此才珍贵吧。",
    ],
  },
};

// 通用兜底话题
const DEFAULT_TOPICS: Record<MbtiGroup, string[]> = {
  E_: [
    "嗨！今天过得怎么样？",
    "有没有什么好玩的事情发生？",
    "我觉得应该找点事情做——你呢？",
  ],
  I_: [
    "你有没有想过……我们为什么会在这里？",
    "今天好像有点不一样——你感觉到了吗？",
    "我在想一些事情——你想听听吗？",
  ],
};

// ── 类型 ──

export interface ProactiveTrigger {
  agent: AgentSpriteData;
  topic: string;
  topicCategory: "chat" | "help" | "complain" | "curious" | "invite";
}

type ProactiveEventCallback = (trigger: ProactiveTrigger) => void;
type ProactiveTimeoutCallback = (agentId: string) => void;

// ── 常量 ──

const SCAN_INTERVAL_MIN = 4 * 60 * 1000; // 4 分钟
const SCAN_INTERVAL_MAX = 8 * 60 * 1000; // 8 分钟
const AGENT_COOLDOWN = 10 * 60 * 1000;    // 同一 Agent 10 分钟冷却
const USER_IDLE_THRESHOLD = 2 * 60 * 1000; // 用户 2 分钟无交互→不触发
const CHAT_TIMEOUT = 60 * 1000;           // 60 秒未响应→超时

function mbtiGroup(mbti?: string): MbtiGroup {
  if (!mbti) return "I_";
  return mbti.startsWith("E") ? "E_" : "I_";
}

function randomInterval(): number {
  return SCAN_INTERVAL_MIN + Math.random() * (SCAN_INTERVAL_MAX - SCAN_INTERVAL_MIN);
}

function pickTopic(scene: string, mbti?: string): { topic: string; category: ProactiveTrigger["topicCategory"] } {
  const group = mbtiGroup(mbti);
  const pool = TOPIC_POOL[scene]?.[group] ?? DEFAULT_TOPICS[group];
  const topic = pool[Math.floor(Math.random() * pool.length)];

  // 根据话题内容推断类别
  if (topic.includes("？") || topic.includes("你知道") || topic.includes("有没有")) return { topic, category: "curious" };
  if (topic.includes("一起") || topic.includes("要不要") || topic.includes("加我")) return { topic, category: "invite" };
  if (topic.includes("无聊") || topic.includes("崩了") || topic.includes("失败")) return { topic, category: "complain" };
  if (topic.includes("帮") || topic.includes("借") || topic.includes("问题")) return { topic, category: "help" };
  return { topic, category: "chat" };
}

// ================================================================
// ProactiveChatManager
// ================================================================

export class ProactiveChatManager {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private agentCooldowns: Map<string, number> = new Map();
  private lastGlobalTrigger = 0;
  private lastUserInteraction = Date.now();
  private isActive = false;
  private scene = "library";
  private game: Phaser.Game;
  private scanGeneration = 0; // 递增以失效 in-flight async 扫描

  /** 是否有 Agent 空闲（不在对话/操作中）的判断回调 */
  private isAgentBusy: (agentId: string) => boolean = () => false;
  /** 获取当前场景所有 Agent 数据 */
  private getAgents: () => AgentSpriteData[] = () => [];

  private onTrigger: ProactiveEventCallback | null = null;
  private onTimeout: ProactiveTimeoutCallback | null = null;

  constructor(game: Phaser.Game) {
    this.game = game;
    this.setupUserActivityTracking();
  }

  /** 销毁——移除所有事件监听，防止内存泄漏 */
  dispose(): void {
    this.stop();
    if (typeof document !== "undefined") {
      document.removeEventListener("mousemove", this._onUserActivity);
      document.removeEventListener("click", this._onUserActivity);
      document.removeEventListener("keydown", this._onUserActivity);
      document.removeEventListener("touchstart", this._onUserActivity);
    }
  }

  // ── 配置回调 ──

  setScene(scene: string): void {
    this.scene = scene;
  }

  setIsAgentBusy(fn: (agentId: string) => boolean): void {
    this.isAgentBusy = fn;
  }

  setGetAgents(fn: () => AgentSpriteData[]): void {
    this.getAgents = fn;
  }

  onProactiveTrigger(cb: ProactiveEventCallback): void {
    this.onTrigger = cb;
  }

  onProactiveTimeout(cb: ProactiveTimeoutCallback): void {
    this.onTimeout = cb;
  }

  // ── 用户交互追踪 ──

  private _onUserActivity = (): void => {
    this.lastUserInteraction = Date.now();
  };

  private setupUserActivityTracking(): void {
    if (typeof document !== "undefined") {
      document.addEventListener("mousemove", this._onUserActivity, { passive: true });
      document.addEventListener("click", this._onUserActivity, { passive: true });
      document.addEventListener("keydown", this._onUserActivity, { passive: true });
      document.addEventListener("touchstart", this._onUserActivity, { passive: true });
    }
  }

  /** 手动重置用户交互时间（外部调用） */
  resetUserInteraction(): void {
    this.lastUserInteraction = Date.now();
  }

  /** 用户是否在最近 {threshold} ms 内有交互 */
  private isUserActive(threshold: number = USER_IDLE_THRESHOLD): boolean {
    return Date.now() - this.lastUserInteraction < threshold;
  }

  // ── 启动/停止 ──

  start(): void {
    this.stop();
    this.scheduleNext();
  }

  stop(): void {
    this.scanGeneration++; // 失效所有 in-flight 异步扫描
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
    this.isActive = false;
  }

  /** 重置所有冷却（场景切换时调用） */
  reset(): void {
    this.stop();
    this.agentCooldowns.clear();
    this.lastGlobalTrigger = 0;
    this.isActive = false;
  }

  /** 手动触发一次主动搭话（跳过所有门控：用户空闲、全局冷却、Agent 冷却） */
  forceTrigger(): boolean {
    if (this.isActive) {
      // 如果有活跃搭话但用户想重新触发，先清理当前
      this.clearTimeout();
      this.isActive = false;
    }

    try {
      const ms = this.game.scene.getScene("MapScene") as any;
      if (ms?.isPaused?.()) return false;
    } catch { return false; }

    const agents = this.getAgents();
    if (agents.length === 0) return false;

    // 手动触发：只过滤正在对话中的 Agent，不检查冷却
    const eligible = agents.filter((a) => !this.isAgentBusy(a.agentId));
    if (eligible.length === 0) return false;

    const selected = this.selectBest(eligible);
    if (!selected) return false;

    const { topic, category } = pickTopic(this.scene);
    this.isActive = true;
    const trigger: ProactiveTrigger = {
      agent: selected,
      topic,
      topicCategory: category,
    };
    this.onTrigger?.(trigger);

    this.timeoutTimer = setTimeout(() => {
      if (this.isActive) this.ignore(selected.agentId);
    }, CHAT_TIMEOUT);

    return true;
  }

  // ── 用户响应 ──

  /** 用户接受了搭话 */
  accept(agentId: string): void {
    this.clearTimeout();
    // 记录触发时间用于冷却
    this.agentCooldowns.set(agentId, Date.now());
    this.lastGlobalTrigger = Date.now();
    // isActive 保持 true，直到对话结束
  }

  /** 对话结束，释放锁 */
  endConversation(): void {
    this.isActive = false;
    this.scheduleNext();
  }

  /** 用户忽略了搭话 */
  ignore(agentId: string): void {
    this.clearTimeout();
    this.agentCooldowns.set(agentId, Date.now());
    this.lastGlobalTrigger = Date.now();
    this.isActive = false;
    this.onTimeout?.(agentId);
    this.scheduleNext();
  }

  /** 获取指定 Agent 的主动搭话冷却状态 */
  getAgentCooldownRemaining(agentId: string): number {
    const last = this.agentCooldowns.get(agentId) ?? 0;
    const elapsed = Date.now() - last;
    return Math.max(0, AGENT_COOLDOWN - elapsed);
  }

  // ── 内部 ──

  private scheduleNext(): void {
    if (this.timer) clearTimeout(this.timer);
    const delay = randomInterval();
    this.timer = setTimeout(() => this.scan(), delay);
  }

  private clearTimeout(): void {
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
  }

  private scan(): void {
    if (this.isActive) {
      this.scheduleNext();
      return;
    }

    // 检查场景是否暂停
    try {
      const ms = this.game.scene.getScene("MapScene") as any;
      if (ms?.isPaused?.()) { this.scheduleNext(); return; }
    } catch { /* MapScene not ready yet */ }

    const agents = this.getAgents();
    if (agents.length === 0) {
      this.scheduleNext();
      return;
    }

    const now = Date.now();

    // 1. 用户最近 2 分钟有交互？
    if (!this.isUserActive()) {
      this.scheduleNext();
      return;
    }

    // 2. 全局冷却（距离上一个搭话 > 10 分钟？）
    if (now - this.lastGlobalTrigger < AGENT_COOLDOWN) {
      this.scheduleNext();
      return;
    }

    // 3. 筛选符合条件的 Agent
    const eligible = agents.filter((a) => {
      // Agent 空闲（不在对话/操作中）
      if (this.isAgentBusy(a.agentId)) return false;
      // 同一 Agent 冷却
      const lastTrigger = this.agentCooldowns.get(a.agentId) ?? 0;
      if (now - lastTrigger < AGENT_COOLDOWN) return false;
      return true;
    });

    if (eligible.length === 0) {
      this.scheduleNext();
      return;
    }

    // 4. 选中最合适的（优先级: 情绪 intense > 外向人格 > 最近互动过）
    const selected = this.selectBest(eligible);
    if (!selected) {
      this.scheduleNext();
      return;
    }

    // 5. 生成话题
    const { topic, category } = pickTopic(this.scene /* mbti would come from agent data */);

    // 6. 尝试 LLM 生成话题（异步，不阻塞）
    const scanGen = this.scanGeneration;
    this.generateTopicAsync(selected.name, this.scene).then((llmTopic) => {
      // 守卫：如果 manager 已被 stop/reset，丢弃过期结果
      if (this.scanGeneration !== scanGen) return;
      const finalTopic = llmTopic ?? topic;

      // 7. 触发
      this.isActive = true;
      const trigger: ProactiveTrigger = {
        agent: selected,
        topic: finalTopic,
        topicCategory: llmTopic ? category : category,
      };
      this.onTrigger?.(trigger);

      // 8. 启动超时计时器
      this.timeoutTimer = setTimeout(() => {
        if (this.isActive) {
          this.ignore(selected.agentId);
        }
      }, CHAT_TIMEOUT);
    }).catch(() => {
      if (this.scanGeneration !== scanGen) return;
      // LLM 失败，用预设话题
      this.isActive = true;
      const trigger: ProactiveTrigger = {
        agent: selected,
        topic,
        topicCategory: category,
      };
      this.onTrigger?.(trigger);

      this.timeoutTimer = setTimeout(() => {
        if (this.isActive) {
          this.ignore(selected.agentId);
        }
      }, CHAT_TIMEOUT);
    });

    // 不在这里 scheduleNext——等对话结束或超时后才 schedule
  }

  private async generateTopicAsync(agentName: string, scene: string): Promise<string | null> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(`/api/scenes/${scene}/proactive-topic`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_name: agentName, scene }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        if (data.topic && data.topic.length > 2) {
          return data.topic;
        }
      }
    } catch {
      // LLM 不可用，用预设兜底
    }
    return null;
  }

  /** 选择最合适的 Agent */
  private selectBest(agents: AgentSpriteData[]): AgentSpriteData | null {
    if (agents.length === 0) return null;

    // 优先级排序：情绪 intense > 外向 > 情绪非 neutral
    const scored = agents.map((a) => {
      let score = 0;
      // 情绪强度：非 neutral 加分
      if (a.emotion !== "neutral") score += 3;
      if (a.emotion === "excited" || a.emotion === "happy") score += 2;
      return { agent: a, score };
    });

    scored.sort((a, b) => b.score - a.score);
    // 从 top 中随机选（增加变化）
    const top = scored.filter((s) => s.score === scored[0].score);
    return top[Math.floor(Math.random() * top.length)].agent;
  }
}
