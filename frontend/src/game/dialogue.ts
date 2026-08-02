/**
 * 对话引擎 — 66-S 升级 → State 4 Step 81 降级。
 *
 * State 4: fetchDialogue 降级为 SSE 断线时的 fallback。
 * 当 Brain 模式激活时，MapScene.scanAndDialogue() 会跳过此模块，
 * 对话由 WorldEngine GroupChat 通过 SSE drive。
 *
 * 保留策略：
 *   1. mock 池 → SSE 断线时使用
 *   2. fetchDialogue → 仅在 Brain 未启用时调用
 */

type SceneName = "library" | "dorm" | "classroom" | "art" | "lab" | "sakura";

/* ================================================================
 * Mock 对话池（扩展版 — 每组合 6-10 句，减少重复感）
 * ================================================================ */

const POOL: Record<string, Record<string, Record<string, string[]>>> = {
  小林: {
    小红: {
      library:   ["你不是说要画画的吗…","安静点，有人在看书","你画的这个配色，RGB值是多少","代码配色也是设计的一部分","你那边的书架有设计杂志","嘘——图书馆不是画室"],
      dorm:      ["外卖到了吗","代码写完了，你画完了吗","你的闹钟响了三次了","别又把颜料弄到键盘上","你昨天晚上几点睡的","该倒垃圾了"],
      classroom: ["这题我会，但不想讲","老师刚才说的那个bug…","PPT第三页有错别字","笔记借你看看，不过改了排版","下课去食堂吗","别在课本上乱画"],
      art:       ["你在这里找灵感？","钢琴和代码哪个更优雅","别碰我的键盘","这个画架借我用一下","颜色调得不错","安静点听琴"],
      lab:       ["数据跑完了吗","试剂别放我电脑旁边","这个实验设计有个漏洞","温度参数错了","你手套戴反了","小心那个烧杯"],
      sakura:    ["花瓣飘进来了","春天真短","能不能别在花瓣上写代码","树下有个好位置","樱花飘进我键盘了","你头发上有花瓣"],
    },
    小刚: {
      library:   ["你的计划书呢","别催，我在优化时间复杂度","deadline是明天，不是下个月","PPT你来做","我的部分写完了","你又开了一堆标签页"],
      dorm:      ["几点开会","你又定了一堆规矩","外卖你付","别把袜子扔我桌上","明天值日表排好了吗","空调遥控器呢"],
      classroom: ["投影仪又坏了","这不归我修","你去跟教务处说","实验报告你写了吗","别总看我，看黑板","下课帮我占座"],
      art:       ["这里不是会议室","你是来检查工作的吗","帮我搬一下画架","效率太低了，重新排","别在钢琴上放文件"],
      lab:       ["实验记录写了吗","数据不会自己跑","安全规范第一条…","手套戴好","这个指标偏了","谁动了我的样本"],
      sakura:    ["抓紧时间，别发呆了","你看这花瓣，效率多低","能不能定个赏花KPI","十分钟赏花够了吧","拍张照就走"],
    },
    小雪: {
      library:   ["你有没有想过…如果书会说话","这里好安静","你在看什么书","那边的阳光好美","书页的声音真好听","这里的时间好慢"],
      dorm:      ["好像要下雨了","你昨天晚上说梦话了","窗外的鸟好吵","你有没有闻到春天的味道","昨晚的星星好亮"],
      lab:       ["这个数据好像不太对","你有没有想过实验失败也是一种成功","试剂颜色好漂亮","数据好像在讲故事","这个现象好神奇"],
      sakura:    ["花瓣好像在发光","你有没有想过它们飘去哪里","好温柔的风","时间好像慢了","好想在这里坐一整天"],
    },
    阿杰: {
      library:   ["不是吧，你也会来看书？","我有个大胆的想法：把图书馆改成游戏厅","嘘——（其实我更大声）","你借的什么书","这排书架后面可以藏人","写代码不戴耳机吗"],
      dorm:      ["昨天的游戏你输了","我有个大胆的想法：通宵看电影","外卖点了吗？我饿死了","打游戏吗？三缺一","你室友几点回来"],
      classroom: ["这堂课讲的根本不对","不是吧，你居然认真听课","我有个大胆的想法：翘课","这老师说的我一个字都不信","笔记借我，下课还你"],
      art:       ["不是吧，你也会弹钢琴？","我有个大胆的想法：行为艺术","这画卖吗","这曲子好耳熟","颜料甩到衣服上了——酷"],
      lab:       ["不是吧，数据又崩了","我有个大胆的想法：改个参数试试","实验失败 = 新发现","你看这个试剂冒泡了","操作手册？我从来不看的"],
      sakura:    ["不是吧，你也来赏花","我有个大胆的想法：在樱花树下野餐","拍照吗？我帮你P","你看这花瓣，像不像雪","春天最适合睡午觉了","自拍一张？"],
    },
  },
  小红: {
    小林: {
      library:   ["快了快了！你看这个配色","你好冷漠哦","帮我看看这个设计","这个渐变色怎么样","你代码写完了吗","设计需要灵感，安静一下嘛"],
      dorm:      ["叫外卖！我要吃麻辣烫","我的画笔找不到了","你昨晚又通宵了吧","新买的颜料到了！","帮我看看这件衣服","今晚看电影吗"],
      classroom: ["这课好无聊啊，画画吧","哎你看那个同学","笔记借我抄抄","老师今天穿的裙子好好看","下课去吃冰激凌吧"],
      art:       ["天哪这里好棒！","帮我调一下颜料","你看那架钢琴！","这幅画挂这里好不好","今天的阳光打进来好美","我新学了一种配色"],
      lab:       ["这个仪器好漂亮！","小心别弄洒了","数据什么的明天再说","你看显微镜下的世界","实验服太大了啦"],
      sakura:    ["天哪好美！","快帮我拍照！","别踩到花瓣啦","你看这朵花像不像星星","春天的颜色好温柔","好想画下来"],
    },
    小刚: {
      library:   ["别这么严肃嘛","偶尔也休息一下呀","你看那本书的封面好好看","你的领带歪了","今天的计划给我看看"],
      classroom: ["你又要讲规矩了","听我说完嘛","这次的计划真的很棒","你写字的姿势好端正","喂，别走神"],
      sakura:    ["别定KPI了！看花！","生活也需要浪漫呀","你笑一下","你也坐一会儿嘛","这花比你温柔多了"],
    },
    小雪: {
      dorm:      ["你今天的裙子好好看","一起看个电影吧","你有没有闻到花香","窗外的云好像兔子","你的梳子借我用下","晚上一起散步吗"],
      art:       ["这个颜色叫什么","你画得好温柔","我也好想学画画","你教我画画好不好","你手里的画笔好漂亮"],
      sakura:    ["好想和你一起散步","你看那朵云","以后每年都来看好不好","你的笑容好温暖","风好温柔"],
    },
    阿杰: {
      classroom: ["你又有什么鬼主意","不是吧哈哈哈","好吧好吧算你厉害","你又想翘课了","你的笑话好冷","不过还挺好笑的"],
      art:       ["你这个想法太疯狂了！","我喜欢！但老师会疯的","加我一个","你真的要做行为艺术吗","颜料借我用用","你认真的样子好搞笑"],
    },
  },
  小刚: {
    小林: {
      library:   ["效率太低了，重新规划","做完了吗","给你三十分钟","代码 review 一下","架构图我看看","你又在调 CSS"],
      dorm:      ["起床！开会！","你的作息要调整","这就是你的计划？","明天的会议准备好了吗","你的外卖自己付"],
      lab:       ["数据整理好了吗","流程再优化一下","别摸鱼","这个实验必须今天出结果","参数记录给我看"],
      classroom: ["这件事你来负责","方案今天要交","别找借口","笔记整整齐齐才能学进去","别又走神了"],
    },
    小红: {
      library:   ["别光说浪漫，deadline呢","你的方案很有创意，但是…","先把正事做完","这个数据你确认过了吗","创意不够落地"],
      dorm:      ["外卖到了，先开会","你的闹钟…我帮你关了","明天早起，别迟到","你今天没叠被子","卫生间该你打扫了"],
    },
    小雪: {
      classroom: ["你的想法很好，落地呢","哲学不能当饭吃","做个计划吧","你说了半天，重点呢"],
      lab:       ["实验步骤再确认一遍","别走神，试剂有毒","记录一定要详细","这个数据异常，你重新跑一下"],
    },
    阿杰: {
      library:   ["别说笑话了，干活","你那个大胆的想法，驳回","认真点","别把脚翘到桌上","你今天计划完成了没有"],
      dorm:      ["别闹了","谁又在打游戏","开会！","十一点熄灯","你外卖盒子赶紧扔"],
      classroom: ["你又在翘课边缘试探","别带坏其他人","正经点","作业抄完了吗"],
      sakura:    ["赏花可以，别搞行为艺术","站好，拍照了","别跑太远","你踩到别人野餐布了"],
    },
  },
  小雪: {
    小林: {
      library:   ["你有没有想过…知识是活的","你看起来好专注","这里好安静，真好","你在看什么算法","书页翻动的声音好像心跳"],
      dorm:      ["你昨晚几点睡的","好像要下雨了","你有没有听到什么声音","你外套落在椅子上了","你手机屏幕好亮"],
      lab:       ["数据好像在讲故事","你有没有想过实验的意义","这个现象好神奇","曲线好像在唱歌","误差也是美的"],
      sakura:    ["花瓣好像在跳舞","你有没有想过它们飘去哪里","好想时间停在这里","你看那一整片粉色的云","春天真的好短"],
    },
    小红: {
      dorm:      ["你今天的笑容好温暖","一起去看花吧","你有没有闻到春天的味道","你的画笔好像在发光","你的笑声好像风铃"],
      art:       ["这个颜色叫什么名字","你画画的样子好美","我也好想学会","你调色的时候好认真","这幅画好像在呼吸"],
    },
    阿杰: {
      sakura:    ["你的笑话好好笑","你也有温柔的一面呢","别走太快，等等我","你认真拍照的样子好难得","其实你拍得挺好的"],
      art:       ["你认真的样子好少见","这个玩笑有点冷","其实你很有趣","你弹琴的时候很不一样","躁动里也有安静的时候"],
    },
  },
  阿杰: {
    小林: {
      library:   ["不是吧，你还在看这本书","我有个大胆的想法：书应该倒着读","你看得太认真了，笑一个","你的咖啡凉了","代码写完了吗，出去走走"],
      dorm:      ["起来嗨！","不是吧，你又通宵了","打游戏吗？我带你","你桌面太整洁了——不正常","这周末出去玩吗"],
      classroom: ["这堂课我有个大胆的替代方案","不是吧，这么简单你还要想","翘课吗？就一节","笔记上画的什么？让我看看"],
      lab:       ["不是吧，数据又跑崩了","我有个大胆的想法：改个参数","实验失败就当行为艺术","你看这个试管冒烟了——酷"],
    },
    小红: {
      classroom: ["不是吧，你居然在认真听课","来，给你看个好玩的","你的画借我看看","你的橡皮好香","你头发上有个花瓣"],
      art:       ["不是吧，这配色绝了","我也有艺术细胞好吗","我有个大胆的行为艺术想法","你需要一个疯狂的缪斯","这幅画我买了——一块钱"],
      sakura:    ["不是吧，这花比你还美（开玩笑的）","拍照吗？我帮你拍一百张","我有一个浪漫的主意","躺一会儿吧，草地好软"],
    },
    小刚: {
      library:   ["不是吧，周末还要工作","我有个大胆的想法：放假","老板~","今天的计划是——不按计划","KPI什么的明天再说"],
      classroom: ["不是吧，这也要开会","我有个大胆的想法：罢工","你说了算，行了吧","所以…今天的决定是？"],
    },
    小雪: {
      sakura:    ["不是吧，你在思考人生","我有个大胆的想法：去流浪","你温柔的样子好少见","你看花瓣，每一片都不一样呢"],
      library:   ["不是吧，你看书的样子好文艺","其实你很有趣的","说真的，你挺好的","这本书讲什么的？我也想看"],
    },
  },
};

/* 场景通用兜底（扩展版 — 足够多样化，真实 Agent 不冷场） */
const FALLBACK: Record<string, string[]> = {
  library: [
    "这里好安静","你在看什么书","别吵到别人","这本好看吗","好多人自习啊",
    "那边有个空位","书架好高啊","你借了几本","自习到几点","要不要一起去借书",
    "这图书馆真大","窗边光线好好","你喜欢看什么类型的书","好久没来图书馆了",
    "西区图书馆七点就排队了","占座的内卷太严重了","你抢到靠窗的位子了吗",
  ],
  dorm: [
    "外卖到了吗","今天好累","早点休息","你几点睡","明天有课吗",
    "室友真好","房间有点乱","要不要一起点外卖","今晚打游戏吗","你听说了吗",
    "周末有什么安排","好想睡懒觉","门禁是几点来着","你东西掉了",
    "西区六栋又停水了","宿管阿姨今天心情不错","东活食堂新出了麻辣烫",
  ],
  classroom: [
    "这题怎么做","快下课了","笔记借我","老师讲的好快","好困啊",
    "你听懂了吗","这次考试难不难","坐这里吧","一会儿去食堂吗","下课等我一下",
    "这课真有意思","你作业写完了吗","PPT能发我一份吗","今天我们组队吗",
    "三教的投影仪又坏了","小树林那边有人在弹吉他","下课去东活吃还是西活",
  ],
  art: [
    "这里好有氛围","你也在创作吗","灵感来了","这个角落好安静","画得真好",
    "钢琴声真好听","这颜色搭配好棒","你也喜欢艺术吗","好想学画画","展览什么时候开",
    "这幅画是你画的吗","好厉害","这才是创作的天堂","安静听着就好",
    "中区艺术中心今天有展览","科大也有艺术细胞？来看看吧",
  ],
  lab: [
    "数据怎么样","实验结果如何","注意安全","这个怎么操作","试剂够吗",
    "温度稳定了吗","数据好像不太对","再跑一次试试","手套戴好了吗","设备该维护了",
    "这次实验有希望","你发现什么了","这个公式对吗","我来帮你吧",
    "科研楼的门禁卡你刷得开吗","导师组会你PPT做了没","实验室空调终于修好了",
  ],
  sakura: [
    "花好美","春天真好","拍张照吧","风好舒服","阳光真好",
    "花瓣飘下来了","好想坐一会儿","你看那片花","每年都开得这么好看","春天真短",
    "在樱花树下聊天真惬意","好温柔的风","时间好像慢了","明天还会开吗",
    "老北门樱花开了游客比花还多","郭沫若广场那边也在拍照","天使路上全是人",
  ],
};

/* ================================================================
 * 工具
 * ================================================================ */

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** 从数组中随机选取 N 个不重复的，不足则循环 */
function pickN<T>(arr: T[], n: number): T[] {
  if (arr.length === 0) return [];
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  const result: T[] = [];
  for (let i = 0; i < n; i++) {
    result.push(shuffled[i % shuffled.length]);
  }
  return result;
}

/* ================================================================
 * Mock 对话（同步，带防重复）
 * ================================================================ */

/** 记录已用索引，避免同一会话中重复 */
const _used: Map<string, number> = new Map();

function _poolKey(from: string, to: string, scene: string): string {
  return `${from}|${to}|${scene}`;
}

export function getDialogue(fromName: string, toName: string, sceneId: string): string {
  const pool = (POOL as any)[fromName]?.[toName]?.[sceneId] as string[] | undefined;
  const lines = pool ?? (FALLBACK[sceneId] ?? FALLBACK.library);

  const key = _poolKey(fromName, toName, sceneId);
  const lastIdx = _used.get(key) ?? -1;

  // 找下一个不同于上一条的
  if (lines.length > 1) {
    let idx = Math.floor(Math.random() * lines.length);
    let attempts = 0;
    while (idx === lastIdx && attempts < 5) {
      idx = Math.floor(Math.random() * lines.length);
      attempts++;
    }
    _used.set(key, idx);
    return lines[idx];
  }

  return pick(lines);
}

/** 为多轮对话预选一组不重复的句子 */
export function pickConversationLines(fromName: string, toName: string, sceneId: string, count: number): string[] {
  const pool = (POOL as any)[fromName]?.[toName]?.[sceneId] as string[] | undefined;
  const lines = pool ?? (FALLBACK[sceneId] ?? FALLBACK.library);
  return pickN(lines, count);
}

/* ================================================================
 * LLM 对话（异步）
 * ================================================================ */

export interface DialogueResult {
  message: string;
  emotion: string | null;
  source: "llm" | "mock";
}

/**
 * 异步获取对话 — LLM 优先，mock 兜底。
 * @param context 之前几轮的对话文本（用于 LLM 上下文连贯）
 */
export async function fetchDialogue(
  fromName: string,
  toName: string,
  sceneId: string,
  context: string[] = [],
): Promise<DialogueResult> {
  console.log(`[dialogue] → ${fromName}→${toName} @${sceneId} ctx=${context.length}轮`);

  // 1. 尝试后端 LLM
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(`/api/scenes/${sceneId}/interact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromName,
        to: toName,
        scene: sceneId,
        message: context.length > 0 ? context.slice(-3).join(" | ") : "",
        emotion: "neutral",
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      const src = data.source === "llm" ? "llm" : "mock";
      if (data.message && data.message.length > 2) {
        console.log(`[dialogue] ${src === "llm" ? "✅ LLM" : "🔶 mock(backend)"}: ${data.message.slice(0, 40)}`);
        return { message: data.message, emotion: data.emotion ?? null, source: src };
      }
    }
    console.log(`[dialogue] ⚠️ HTTP ${res.status}, fallback to local mock`);
  } catch (e: any) {
    console.log(`[dialogue] ❌ fetch error: ${e?.message ?? e} — fallback to local mock`);
  }

  // 2. 本地 Mock 兜底（连后端都没通）
  const mockLine = getDialogue(fromName, toName, sceneId);
  console.log(`[dialogue] 🔶 local mock: ${mockLine.slice(0, 40)}`);
  return { message: mockLine, emotion: null, source: "mock" };
}

/**
 * 耳语专用对话获取 — 仅调用真实 API，不使用 mock 兜底。
 * 返回 null 表示 API 不可用。
 */
export async function fetchWhisperDialogue(
  fromName: string,
  toName: string,
  sceneId: string,
  whisperMessage: string,
  context: string[] = [],
): Promise<DialogueResult | null> {
  console.log(`[whisper] → ${fromName}→${toName} @${sceneId} msg=${whisperMessage.slice(0, 40)}`);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(`/api/scenes/${sceneId}/interact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromName,
        to: toName,
        scene: sceneId,
        message: [whisperMessage, ...context.slice(-2)].join(" | "),
        emotion: "neutral",
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      if (data.message && data.message.length > 2) {
        const src = data.source === "llm" ? "llm" : "mock";
        console.log(`[whisper] ${src === "llm" ? "✅ LLM" : "⚠️ backend mock"}: ${data.message.slice(0, 40)}`);
        // 仅接受 LLM 真实响应，拒绝后端 mock 兜底
        if (src === "llm") {
          return { message: data.message, emotion: data.emotion ?? null, source: "llm" };
        }
      }
    }
    console.log(`[whisper] ⚠️ HTTP ${res.status}, API 不可用`);
  } catch (e: any) {
    console.log(`[whisper] ❌ fetch error: ${e?.message ?? e}`);
  }
  return null;
}

/* ================================================================
 * Step 98: 主动搭话话题生成
 * ================================================================ */

export async function generateProactiveTopic(
  agentName: string,
  scene: string,
): Promise<string | null> {
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
    // LLM 不可用，返回 null（调用方用预设池兜底）
  }
  return null;
}

/* ================================================================
 * Step 99d: 对话选项分支
 * ================================================================ */

export type TopicCategory = "chat" | "help" | "complain" | "curious" | "invite";

export interface ChatOptionDef {
  id: "A" | "B" | "C";
  label: string;
  tone: "友善" | "冷淡" | "挑衅";
  userText: string;
  agentReaction: string;
  agentEmotion: string;
}

const CHAT_OPTION_POOL: Record<TopicCategory, ChatOptionDef[][]> = {
  chat: [
    [
      { id: "A", label: "\"聊啊！正好我也无聊\"", tone: "友善", userText: "聊啊！正好我也无聊", agentReaction: "太好了！我还怕你觉得我烦呢～所以你今天过得怎么样？", agentEmotion: "happy" },
      { id: "B", label: "\"嗯…随便聊聊也行\"", tone: "冷淡", userText: "嗯…随便聊聊也行", agentReaction: "哦…好吧。那我就不打扰你了。", agentEmotion: "sad" },
      { id: "C", label: "\"你是不是太闲了？\"", tone: "挑衅", userText: "你是不是太闲了？", agentReaction: "……算了，当我没说。", agentEmotion: "angry" },
    ],
    [
      { id: "A", label: "\"哈哈，你说话好好玩\"", tone: "友善", userText: "哈哈，你说话好好玩", agentReaction: "真的吗！那我再多说几句——你觉得这里还有什么好玩的？", agentEmotion: "excited" },
      { id: "B", label: "\"还行，就这样吧\"", tone: "冷淡", userText: "还行，就这样吧", agentReaction: "好吧…那我也不勉强。下次有空再聊。", agentEmotion: "neutral" },
      { id: "C", label: "\"你能不能安静一会儿？\"", tone: "挑衅", userText: "你能不能安静一会儿？", agentReaction: "好的，我闭嘴。", agentEmotion: "sad" },
    ],
  ],
  curious: [
    [
      { id: "A", label: "\"我也想过这个问题！\"", tone: "友善", userText: "我也想过这个问题！", agentReaction: "对吧！！我就知道你会这么想——那你觉得答案是什么？", agentEmotion: "excited" },
      { id: "B", label: "\"嗯…有意思\"", tone: "冷淡", userText: "嗯…有意思", agentReaction: "你也觉得有意思吗…太好了，我还怕你觉得无聊。", agentEmotion: "happy" },
      { id: "C", label: "\"你想太多了吧\"", tone: "挑衅", userText: "你想太多了吧", agentReaction: "……可能吧。有时候确实想太多。", agentEmotion: "sad" },
    ],
    [
      { id: "A", label: "\"说来听听！\"", tone: "友善", userText: "说来听听！", agentReaction: "好！我是这么想的——你看，如果换个角度看的话…", agentEmotion: "excited" },
      { id: "B", label: "\"我对这个没什么兴趣\"", tone: "冷淡", userText: "我对这个没什么兴趣", agentReaction: "没关系，每个人感兴趣的点不一样嘛。", agentEmotion: "neutral" },
      { id: "C", label: "\"你这个问题好蠢\"", tone: "挑衅", userText: "你这个问题好蠢", agentReaction: "……好的。我记住了。", agentEmotion: "angry" },
    ],
  ],
  invite: [
    [
      { id: "A", label: "\"好啊！一起！\"", tone: "友善", userText: "好啊！一起！", agentReaction: "太好了！！我就知道你会答应的——走走走！", agentEmotion: "excited" },
      { id: "B", label: "\"下次吧，现在有点忙\"", tone: "冷淡", userText: "下次吧，现在有点忙", agentReaction: "好，那你先忙。下次有机会再说。", agentEmotion: "neutral" },
      { id: "C", label: "\"你谁啊？我为什么要跟你一起？\"", tone: "挑衅", userText: "你谁啊？我为什么要跟你一起？", agentReaction: "……我明白了。对不起打扰了。", agentEmotion: "sad" },
    ],
    [
      { id: "A", label: "\"等我一下，马上来！\"", tone: "友善", userText: "等我一下，马上来！", agentReaction: "不着急！我等你～你知道这个地方怎么去吗？", agentEmotion: "happy" },
      { id: "B", label: "\"我不太想去\"", tone: "冷淡", userText: "我不太想去", agentReaction: "那我自己去吧。希望下次你能来。", agentEmotion: "sad" },
      { id: "C", label: "\"烦不烦，别来烦我\"", tone: "挑衅", userText: "烦不烦，别来烦我", agentReaction: "好的。我走了。再见。", agentEmotion: "angry" },
    ],
  ],
  help: [
    [
      { id: "A", label: "\"好啊，帮帮我！\"", tone: "友善", userText: "好啊，帮帮我！", agentReaction: "没问题！你说说看需要什么帮助？", agentEmotion: "happy" },
      { id: "B", label: "\"我自己能搞定\"", tone: "冷淡", userText: "我自己能搞定", agentReaction: "好吧。不过如果需要的话随时找我。", agentEmotion: "neutral" },
      { id: "C", label: "\"你行吗？别帮倒忙\"", tone: "挑衅", userText: "你行吗？别帮倒忙", agentReaction: "……那你自便吧。我不打扰了。", agentEmotion: "angry" },
    ],
  ],
  complain: [
    [
      { id: "A", label: "\"我也是！太理解了\"", tone: "友善", userText: "我也是！太理解了", agentReaction: "对吧！！终于有人懂我了——你也遇到过？", agentEmotion: "happy" },
      { id: "B", label: "\"这有什么好抱怨的\"", tone: "冷淡", userText: "这有什么好抱怨的", agentReaction: "……嗯，可能是我想太多了。算了。", agentEmotion: "sad" },
      { id: "C", label: "\"你太负能量了\"", tone: "挑衅", userText: "你太负能量了", agentReaction: "对不起，我不该说这些。以后不会了。", agentEmotion: "sad" },
    ],
  ],
};

/** 根据话题类别取对话选项（随机选一套） */
export function getChatOptions(category: TopicCategory): ChatOptionDef[] {
  const pool = CHAT_OPTION_POOL[category] ?? CHAT_OPTION_POOL.chat;
  return pool[Math.floor(Math.random() * pool.length)];
}
