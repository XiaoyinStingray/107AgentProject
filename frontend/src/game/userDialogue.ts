import type { Emotion } from "./sprites/AgentSprite";

export interface LocalUserDialogueContext {
  agentName: string;
  emotion: Emotion;
  sceneId: string;
}

type LocalUserIntent =
  | "greeting"
  | "mood"
  | "activity"
  | "thanks"
  | "praise"
  | "farewell"
  | "scene";

const MOOD_REPLIES: Record<Emotion, string> = {
  neutral: "我现在挺平静的，正在慢慢适应这里。",
  happy: "我今天心情很好，感觉做什么都很有精神。",
  anxious: "我有一点紧张，不过还在努力调整。",
  angry: "我现在有点烦躁，想先让自己冷静一下。",
  sad: "心情有一点低落，不过谢谢你来问我。",
  surprised: "刚才发生的事让我有些意外，我还在回味。",
  confused: "我现在有点没想明白，可能需要再理一理。",
  tired: "我有一点累，正想找个地方歇一会儿。",
  excited: "我现在特别兴奋，好像有很多事情想马上去做。",
};

const ACTIVITY_REPLIES: Record<string, string> = {
  library: "我正在图书馆里随便看看，也想找点感兴趣的东西。",
  dorm: "我正在宿舍里休息，顺便整理一下自己的东西。",
  classroom: "我正在教室里待一会儿，看看有没有值得记下来的内容。",
  art: "我正在艺术中心四处看看，这里的氛围很容易让人产生灵感。",
  lab: "我正在实验室里观察周围，尽量不打扰其他人。",
  sakura: "我正在樱花大道上走走，顺便看看周围的景色。",
};

const SCENE_REPLIES: Record<string, string> = {
  library: "这里很安静，适合看书，也适合把思绪慢慢理清楚。",
  dorm: "这里让人比较放松，很适合休息或者和熟悉的人聊聊天。",
  classroom: "这里有种刚结束讨论的感觉，让人忍不住想继续思考。",
  art: "这里的颜色和声音都很有意思，我觉得很容易找到灵感。",
  lab: "这里的仪器和数据让人自然地专注起来，不过也要注意安全。",
  sakura: "这里的风和花瓣都很舒服，让人想放慢一点脚步。",
};

const REPLY_POOLS: Record<Exclude<LocalUserIntent, "mood" | "activity" | "scene">, string[]> = {
  greeting: [
    "你好呀，很高兴你来找我。",
    "嗨，我听见了。",
    "你好，我正好也想和人说句话。",
  ],
  thanks: [
    "不用客气，能帮上忙就好。",
    "没关系，这是我愿意做的。",
    "收到你的感谢啦。",
  ],
  praise: [
    "谢谢你这么说，我有点不好意思了。",
    "听到这句话还挺开心的，谢谢你。",
    "你的肯定对我很重要。",
  ],
  farewell: [
    "好，下次见。",
    "再见，路上注意安全。",
    "那我们下次再聊。",
  ],
};

const QUESTION_MARKER = /[?？]|吗|呢|如何|怎么|怎样/;

export function getLocalUserReply(
  rawMessage: string,
  context: LocalUserDialogueContext,
): string | null {
  const message = rawMessage.trim();
  if (!message) return null;

  const intent = detectIntent(message);
  if (!intent) return null;

  if (intent === "mood") return MOOD_REPLIES[context.emotion];
  if (intent === "activity") {
    return ACTIVITY_REPLIES[context.sceneId] ?? null;
  }
  if (intent === "scene") {
    return SCENE_REPLIES[context.sceneId] ?? null;
  }

  const replies = REPLY_POOLS[intent];
  return replies[stableIndex(`${context.agentName}:${message}`, replies.length)];
}

function detectIntent(message: string): LocalUserIntent | null {
  const normalized = message.toLowerCase();

  if (/再见|拜拜|下次见|回头见|晚安/.test(normalized)) return "farewell";
  if (/谢谢|多谢|感谢/.test(normalized)) return "thanks";
  if (/真棒|好棒|厉害|优秀|做得好|喜欢你|爱你/.test(normalized)) return "praise";
  if (
    /心情|情绪|开心吗|难过吗|状态怎么样|感觉怎么样|最近怎么样|过得怎么样|你好吗/.test(
      normalized,
    )
  ) return "mood";
  if (/在干嘛|在干什么|做什么|忙什么|最近在忙|现在忙/.test(normalized)) {
    return "activity";
  }
  if (
    QUESTION_MARKER.test(normalized) &&
    /这里|这个地方|图书馆|宿舍|教室|艺术中心|实验室|樱花/.test(normalized)
  ) return "scene";
  if (/^(你好|嗨|哈喽|hello|早上好|中午好|下午好|晚上好)[!！。,.， ]*$/.test(normalized)) {
    return "greeting";
  }

  return null;
}

function stableIndex(value: string, length: number): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash % length;
}
