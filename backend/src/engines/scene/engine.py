"""
SceneEngine — 场景中 Agent 精灵状态管理 + 情绪引擎 + 随机事件（66-S）。

当前（Step 63b）：纯内存存储，接收前端投放的 Agent 状态。
Step 65+：接入 WorldEngine tick，每 tick 更新位置/动作/情绪。
Step 66-S：新增 EmotionController + RandomEventEngine。
"""

from dataclasses import dataclass, field
from typing import Optional
import random
import re
import traceback
from loguru import logger


@dataclass
class AgentSpriteData:
    """单个 Agent 精灵的状态——与前端 AgentSpriteData 对齐"""
    agentId: str
    name: str
    emoji: str
    color: str
    tileX: int
    tileY: int
    action: str    # idle | walk | sit | talk
    emotion: str   # neutral | happy | anxious | angry | sad


@dataclass
class SceneState:
    """单个场景的完整状态"""
    scene_id: str
    agents: list[AgentSpriteData] = field(default_factory=list)


# ── 66-S: 情绪关键词映射 ──

EMOTION_KEYWORDS: dict[str, list[str]] = {
    "happy":    ["天哪", "好美", "好棒", "太棒", "厉害", "好可爱", "漂亮", "绝了", "好喜欢", "开心", "太好", "真好看", "超赞", "好萌", "可爱", "哇", "好温柔", "好暖", "好赞"],
    "confused": ["不是吧", "什么", "怎么", "为啥", "为什么", "搞不懂", "不懂", "奇怪", "诡异", "真的假的", "不会吧", "你说啥"],
    "angry":    ["烦", "别", "够了", "又", "滚", "讨厌", "闭嘴", "吵", "走开", "别烦", "别闹", "够了啊", "生气", "火大", "过分", "受不了"],
    "tired":    ["累", "睡", "困", "算了", "随便", "无所谓", "不想", "懒得", "没劲", "不想动", "好累", "累了", "歇", "休息", "躺"],
    "surprised":["什么!", "天!", "啊!", "哇!", "Oh", "我的天", "真的吗", "是吗", "居然", "竟然", "不可思议"],
    "excited":  ["加油", "冲", "干", "搞定", "拼", "拿下", "必拿下", "好激动", "兴奋", "期待", "等不及", "快开始"],
    "anxious":  ["担心", "紧张", "害怕", "来不及", "完了", "糟了", "怎么办", "惨了", "有点慌", "不太妙", "好像不对劲"],
    "sad":      ["难过", "伤心", "想哭", "遗憾", "可惜", "要是...就好了", "唉"],
}


def detect_emotion(text: str) -> Optional[str]:
    """根据文本关键词检测情绪倾向。返回情绪名称或 None。"""
    scores: dict[str, int] = {}
    for emotion, keywords in EMOTION_KEYWORDS.items():
        count = sum(1 for kw in keywords if kw in text)
        if count > 0:
            scores[emotion] = count
    if not scores:
        return None
    return max(scores, key=scores.get)


# ── 66-S: 随机场景事件 ──

@dataclass
class SceneEvent:
    id: str
    text: str
    target: str       # "all" | "random"
    emotion: str
    intensity: int    # 1-3
    scenes: Optional[list[str]] = None  # None = 全部场景


RANDOM_EVENTS: list[SceneEvent] = [
    # 图书馆
    SceneEvent("ev_lib_01", "📚 图书馆突然停电了！应急灯亮起…", "all", "anxious", 2, ["library"]),
    SceneEvent("ev_lib_02", "📖 有人在书架间发现了一本绝版书", "random", "surprised", 2, ["library"]),
    SceneEvent("ev_lib_03", "☀️ 阳光透过窗户洒在书桌上", "all", "happy", 1, ["library"]),
    # 宿舍
    SceneEvent("ev_dorm_01", "📦 外卖到了！", "all", "excited", 2, ["dorm"]),
    SceneEvent("ev_dorm_02", "😴 暖气太足，所有人都昏昏欲睡…", "all", "tired", 2, ["dorm"]),
    # 教室
    SceneEvent("ev_cls_01", "📢 老师临时宣布随堂测验！", "all", "anxious", 3, ["classroom"]),
    SceneEvent("ev_cls_02", "🏃 下课铃声响起——解放！", "all", "excited", 2, ["classroom"]),
    SceneEvent("ev_cls_03", "🖥️ 投影仪又坏了…", "all", "angry", 1, ["classroom"]),
    # 艺术中心
    SceneEvent("ev_art_01", "🎹 有人在弹钢琴，旋律好美", "all", "happy", 2, ["art"]),
    SceneEvent("ev_art_02", "🎨 新画展开放了！", "all", "excited", 2, ["art"]),
    # 实验室
    SceneEvent("ev_lab_01", "🧪 实验数据突然对上了！", "random", "excited", 3, ["lab"]),
    SceneEvent("ev_lab_02", "⚠️ 试剂颜色变奇怪了…", "all", "anxious", 2, ["lab"]),
    SceneEvent("ev_lab_03", "💻 程序跑崩了——又要重来", "all", "angry", 2, ["lab"]),
    # 樱花大道
    SceneEvent("ev_sak_01", "🌸 一阵风吹过，花瓣纷纷飘落", "all", "happy", 3, ["sakura"]),
    SceneEvent("ev_sak_02", "☁️ 天空突然阴沉下来…要下雨了？", "all", "anxious", 1, ["sakura"]),
    SceneEvent("ev_sak_03", "🦋 一只蝴蝶飞过，落在花瓣上", "all", "surprised", 1, ["sakura"]),
    # 通用
    SceneEvent("ev_gen_01", "⚡ 一道闪电划破天空！", "all", "surprised", 2),
    SceneEvent("ev_gen_02", "📱 所有人同时收到了消息通知…", "all", "confused", 1),
]


class RandomEventEngine:
    """场景随机事件生成器。"""

    @staticmethod
    def get_for_scene(scene_id: str) -> Optional[SceneEvent]:
        """为指定场景随机选取一个事件。40% 概率无事件。"""
        if random.random() < 0.4:
            return None
        pool = [e for e in RANDOM_EVENTS if e.scenes is None or scene_id in e.scenes]
        if not pool:
            return None
        return random.choice(pool)


# ── 66-S: LLM 对话生成 ──

# Agent 人格档案（与前端 dialogue.ts 对齐）
PERSONA_PROFILES: dict[str, dict] = {
    "小林": {"style": "简短、技术向、冷吐槽", "catchphrase": "理论上…", "base_emotion": "neutral"},
    "小红": {"style": "感叹号多、爱夸人", "catchphrase": "天哪！", "base_emotion": "happy"},
    "小刚": {"style": "直接、务实、爱唠叨", "catchphrase": "抓紧时间", "base_emotion": "neutral"},
    "小雪": {"style": "温柔、观察入微", "catchphrase": "你有没有想过…", "base_emotion": "neutral"},
    "阿杰": {"style": "玩笑多、反问多", "catchphrase": "不是吧？", "base_emotion": "excited"},
}

# 场景上下文（用于 LLM prompt）
SCENE_CONTEXT: dict[str, str] = {
    "library": "你在科大图书馆。周围很安静，有人在看书，有人在自习。",
    "dorm": "你在宿舍。室友们在休息或聊天，窗外能看到校园。",
    "classroom": "你在教室。有人在上课或自习，投影仪偶尔会坏。",
    "art": "你在艺术中心。钢琴声、画架、创作氛围围绕着你们。",
    "lab": "你在实验室。实验器材、电脑、数据环绕着你们。注意安全。",
    "sakura": "你在樱花大道。花瓣飘落，春风温柔，是一个浪漫的午后。",
}


# ── 话题引导系统 ──

TOPIC_FUN = "fun"        # 有趣/脑洞
TOPIC_CASUAL = "casual"  # 闲聊/日常
TOPIC_SERIOUS = "serious"  # 严肃/深度

# 概率分配
_TOPIC_WEIGHTS = [TOPIC_CASUAL] * 8 + [TOPIC_FUN] * 7 + [TOPIC_SERIOUS] * 5  # 40%/35%/25%

# 各话题×场景的引导词
_TOPIC_SEEDS: dict[str, dict[str, list[str]]] = {
    TOPIC_FUN: {
        "library": [
            "聊一个奇怪的读书习惯或冷知识",
            "设想如果图书馆的书会说话",
            "开一个关于DDL的玩笑",
            "吐槽一下这学期的奇葩课程",
        ],
        "dorm": [
            "聊一个宿舍里的搞笑糗事",
            "吐槽外卖又送错了",
            "讨论如果有一天突然断网了怎么办",
            "聊一个搞笑的梦",
        ],
        "classroom": [
            "吐槽这堂课有多无聊",
            "讨论如果突然停电了会怎样",
            "聊一个关于老师的搞笑口误",
            "设想如果考试题目全反着出",
        ],
        "art": [
            "聊一个天马行空的艺术创意",
            "吐槽现代艺术你也能画",
            "讨论如果这幅画活过来了",
            "设想一场史上最离谱的音乐会",
        ],
        "lab": [
            "聊一个实验中的搞笑意外",
            "吐槽设备又坏了",
            "讨论如果数据全反了会怎样",
            "设想一个不靠谱的科学假说",
        ],
        "sakura": [
            "聊一个校园里的浪漫传说",
            "讨论如果花瓣能许愿",
            "吐槽春天的花粉过敏",
            "设想如果樱花一年四季都开",
        ],
    },
    TOPIC_CASUAL: {
        "library": [
            "随便聊聊今天的心情",
            "问问对方在忙什么",
            "聊一下天气或环境",
            "随口吐槽一下日常琐事",
        ],
        "dorm": [
            "随便聊聊今天发生了什么",
            "问问晚上吃什么",
            "聊一下最近的追剧或游戏",
            "随口说说室友的日常",
        ],
        "classroom": [
            "随便聊聊这堂课的感受",
            "问问对方听懂了吗",
            "聊一下作业或考试",
            "随口说说最近在学什么",
        ],
        "art": [
            "随便聊聊最近被什么艺术触动了",
            "问问对方在创作什么",
            "聊一下喜欢的音乐或画",
            "随口说说灵感的来源",
        ],
        "lab": [
            "随便聊聊实验的进展",
            "问问对方的研究方向",
            "聊一下学术圈的八卦",
            "随口吐槽一下研究生日常",
        ],
        "sakura": [
            "随便聊聊春天的感受",
            "问问对方喜欢什么花",
            "聊一下最近的出游计划",
            "随口说说散步时在想什么",
        ],
    },
    TOPIC_SERIOUS: {
        "library": [
            "聊一个困扰你很久的人生问题",
            "讨论读书的真正意义",
            "探讨知识与智慧的差别",
            "聊聊你对未来的迷茫或期待",
        ],
        "dorm": [
            "聊一个最近让你失眠的烦恼",
            "讨论友情和独处的平衡",
            "探讨毕业后想做什么",
            '聊聊你对"家"的理解',
        ],
        "classroom": [
            "讨论教育的意义是什么",
            "聊一个让你质疑权威的时刻",
            "探讨竞争与合作哪个更重要",
            "聊聊你对成功的定义",
        ],
        "art": [
            "讨论艺术到底应该表达什么",
            "聊一个让你感动的作品和原因",
            "探讨美是主观的还是客观的",
            "聊聊创作和商业的冲突",
        ],
        "lab": [
            "讨论科学研究的伦理边界",
            "聊一个让你怀疑过的科学结论",
            "探讨技术与人文的关系",
            "聊聊失败在科研中的价值",
        ],
        "sakura": [
            "讨论短暂的美和永恒哪个更珍贵",
            "聊一个让你突然感慨生命的事",
            "探讨自由和归属感的关系",
            "聊聊你理想中的生活是什么样",
        ],
    },
}

def _pick_topic(scene_id: str) -> str:
    """按概率随机选取话题，返回注入 prompt 的引导文字。"""
    import random
    topic = random.choice(_TOPIC_WEIGHTS)
    seeds = _TOPIC_SEEDS.get(topic, {}).get(scene_id, ["随便聊聊"])
    seed = random.choice(seeds)
    labels = {TOPIC_FUN: "（试着聊点有趣的话题）", TOPIC_CASUAL: "", TOPIC_SERIOUS: "（试着深入聊聊）"}
    label = labels.get(topic, "")
    return f"聊天方向提示：{seed}{label}"


WHISPER_CONTEXT_PREFIX = "【用户只对你说的耳语指令】"


def _extract_whisper_instruction(message: str) -> str:
    """Extract the one-shot private instruction from local dialogue context."""
    marker_index = message.rfind(WHISPER_CONTEXT_PREFIX)
    if marker_index < 0:
        return ""
    instruction = message[marker_index + len(WHISPER_CONTEXT_PREFIX):]
    return instruction.split(" | ", 1)[0].strip()[:300]


async def generate_dialogue_llm(
    from_name: str,
    to_name: str,
    scene_id: str,
    message: str = "",
    emotion: str = "neutral",
) -> dict:
    """
    使用 LLM 生成符合人格×场景的对话。
    如果未配置 API key，回退到 mock 对话。
    返回 {"message": str, "emotion": str | None}
    """
    logger.info(f"[dialogue] {from_name}→{to_name} @{scene_id} ctx_len={len(message)}")
    whisper_instruction = _extract_whisper_instruction(message)

    try:
        from llm.client import create_model_client
        from autogen_core import CancellationToken

        client = create_model_client("act")
        if client is None:
            logger.warning(f"[dialogue] ⚠️ create_model_client returned None — fallback to mock")
            return _mock_dialogue(
                from_name,
                to_name,
                scene_id,
                emotion,
                whisper_instruction,
            )

        logger.info(f"[dialogue] LLM client OK: {type(client).__name__}")

        from_persona = PERSONA_PROFILES.get(from_name, {})
        to_persona = PERSONA_PROFILES.get(to_name, {})
        ctx = SCENE_CONTEXT.get(scene_id, "你在校园里。")

        # 用对话历史作上下文
        context_hint = ""
        if whisper_instruction:
            context_hint = (
                "\n用户刚刚只对你下达了以下私密指令："
                f"{whisper_instruction}\n"
                "你必须由自己在本轮对话中执行或明确回应这条指令，"
                "不要把它描述成别人说过的普通对话。"
            )
        elif message:
            context_hint = f"\n这是你们之前的对话摘要：{message[:200]}\n请自然接续对话，不要重复前面说过的话。"

        # ── 话题引导（概率分配：闲聊 40% / 趣味 35% / 严肃 25%）──
        topic_hint = "" if whisper_instruction else _pick_topic(scene_id)

        system_prompt = """你是一个角色扮演引擎。严格遵守以下规则：

1. 只输出一句自然口语对话，绝对不要超过 30 个汉字。
2. 不要加任何前缀、引号、角色名、冒号或旁白。
3. 直接说出对话内容，就像你真的在跟对方说话。
4. 不要说"我觉得"、"我认为"等元叙述——直接表达。
5. 只输出对话本身，不要输出任何其他内容。"""

        prompt = f"""你是 {from_name}。风格：{from_persona.get("style", "")}。
口头禅：{from_persona.get("catchphrase", "")}。
当前情绪：{emotion}。

{ctx}

你正在对 {to_name} 说话。{to_name} 的风格：{to_persona.get("style", "")}。{context_hint}
{topic_hint}

现在用 {from_name} 的身份说一句话（10-30字）:"""

        import asyncio
        from autogen_core.models import SystemMessage, UserMessage

        response = await asyncio.wait_for(
            client.create(
                messages=[
                    SystemMessage(content=system_prompt),
                    UserMessage(content=prompt, source="scene_dialogue"),
                ],
                cancellation_token=CancellationToken(),
            ),
            timeout=10.0,
        )
        text = response.content if isinstance(response.content, str) else str(response.content)

        text = text.strip().strip('"').strip("'").strip("「").strip("」")
        detected = detect_emotion(text)
        logger.info(f"[dialogue] ✅ LLM: {text[:50]}")
        return {"message": text[:60], "emotion": detected, "source": "llm"}

    except Exception as e:
        logger.warning(f"[dialogue] ❌ LLM failed: {type(e).__name__}: {e}")
        logger.debug(traceback.format_exc())
        result = _mock_dialogue(
            from_name,
            to_name,
            scene_id,
            emotion,
            whisper_instruction,
        )
        result["source"] = "mock"
        return result


def _mock_dialogue(
    from_name: str,
    to_name: str,
    scene_id: str,
    emotion: str,
    whisper_instruction: str = "",
) -> dict:
    """模拟对话生成（不调用 LLM）。"""
    if whisper_instruction:
        return {
            "message": f"{to_name}，我按刚才的提醒来找你聊聊。",
            "emotion": "neutral",
        }

    mock_pool: dict[str, dict[str, dict[str, list[str]]]] = {
        "小林": {
            "小红": {"library": ["安静点，有人在看书","你画的这个配色，RGB值是多少"], "dorm": ["外卖到了吗","代码写完了，你画完了吗"], "classroom": ["这题我会，但不想讲","PPT第三页有错别字"], "art": ["你在这里找灵感？","别碰我的键盘"], "lab": ["数据跑完了吗","这个实验设计有个漏洞"], "sakura": ["花瓣飘进来了","能不能别在花瓣上写代码"]},
            "小刚": {"library": ["别催，我在优化时间复杂度","deadline是明天，不是下个月"], "dorm": ["几点开会","外卖你付"], "classroom": ["投影仪又坏了","这不归我修"], "lab": ["实验记录写了吗","安全规范第一条…"], "sakura": ["抓紧时间，别发呆了","能不能定个赏花KPI"]},
            "小雪": {"library": ["你有没有想过…如果书会说话","这里好安静"], "lab": ["这个数据好像不太对","你有没有想过实验失败也是一种成功"], "sakura": ["花瓣好像在发光","你有没有想过它们飘去哪里"]},
            "阿杰": {"library": ["不是吧，你也会来看书？","我有个大胆的想法：把图书馆改成游戏厅"], "dorm": ["昨天的游戏你输了","外卖点了吗？我饿死了"], "classroom": ["这堂课讲的根本不对","我有个大胆的想法：翘课"], "lab": ["不是吧，数据又崩了","我有个大胆的想法：改个参数试试"], "sakura": ["不是吧，你也来赏花","我有个大胆的想法：在樱花树下野餐"]},
        },
        "小红": {
            "小林": {"library": ["快了快了！你看这个配色","帮我看看这个设计"], "dorm": ["叫外卖！我要吃麻辣烫","你昨晚又通宵了吧"], "classroom": ["这课好无聊啊，画画吧","笔记借我抄抄"], "art": ["天哪这里好棒！","你看那架钢琴！"], "lab": ["这个仪器好漂亮！","数据什么的明天再说"], "sakura": ["天哪好美！","快帮我拍照！"]},
            "小刚": {"library": ["别这么严肃嘛","你看那本书的封面好好看"], "classroom": ["你又要讲规矩了","这次的计划真的很棒"], "sakura": ["别定KPI了！看花！","你笑一下"]},
            "小雪": {"dorm": ["你今天的裙子好好看","你有没有闻到花香"], "art": ["这个颜色叫什么","你画得好温柔"], "sakura": ["好想和你一起散步","以后每年都来看好不好"]},
            "阿杰": {"classroom": ["你又有什么鬼主意","好吧好吧算你厉害"], "art": ["你这个想法太疯狂了！","加我一个"]},
        },
        "小刚": {
            "小林": {"library": ["效率太低了，重新规划","给你三十分钟"], "dorm": ["起床！开会！","你的作息要调整"], "lab": ["数据整理好了吗","别摸鱼"], "classroom": ["这件事你来负责","别找借口"]},
            "小红": {"library": ["别光说浪漫，deadline呢","先把正事做完"], "dorm": ["外卖到了，先开会","明天早起，别迟到"]},
            "小雪": {"classroom": ["你的想法很好，落地呢","做个计划吧"], "lab": ["实验步骤再确认一遍","记录一定要详细"]},
            "阿杰": {"library": ["别说笑话了，干活","认真点"], "dorm": ["别闹了","开会！"], "classroom": ["别带坏其他人","正经点"], "sakura": ["赏花可以，别搞行为艺术","别跑太远"]},
        },
        "小雪": {
            "小林": {"library": ["你有没有想过…知识是活的","你看起来好专注"], "dorm": ["你昨晚几点睡的","好像要下雨了"], "lab": ["数据好像在讲故事","你有没有想过实验的意义"], "sakura": ["花瓣好像在跳舞","好想时间停在这里"]},
            "小红": {"dorm": ["你今天的笑容好温暖","你有没有闻到春天的味道"], "art": ["这个颜色叫什么名字","你画画的样子好美"]},
            "阿杰": {"sakura": ["你的笑话好好笑","你也有温柔的一面呢"], "art": ["你认真的样子好少见","其实你很有趣"]},
        },
        "阿杰": {
            "小林": {"library": ["不是吧，你还在看这本书","你看得太认真了，笑一个"], "dorm": ["起来嗨！","打游戏吗？我带你"], "classroom": ["这堂课我有个大胆的替代方案","翘课吗？就一节"], "lab": ["不是吧，数据又跑崩了","实验失败就当行为艺术"]},
            "小红": {"classroom": ["不是吧，你居然在认真听课","你的画借我看看"], "art": ["不是吧，这配色绝了","我有个大胆的行为艺术想法"], "sakura": ["不是吧，这花比你还美（开玩笑的）","拍照吗？我帮你拍一百张"]},
            "小刚": {"library": ["不是吧，周末还要工作","我有个大胆的想法：放假"], "classroom": ["不是吧，这也要开会","我有个大胆的想法：罢工"]},
            "小雪": {"sakura": ["不是吧，你在思考人生","我有个大胆的想法：去流浪"], "library": ["不是吧，你看书的样子好文艺","其实你很有趣的"]},
        },
    }
    fallback = {
        "library": "这里好安静…", "dorm": "外卖什么时候到？",
        "classroom": "这题你会吗？", "art": "你也在创作吗？",
        "lab": "数据跑完了吗？", "sakura": "花好美啊…",
    }

    # 尝试从 mock 池取
    try:
        lines = mock_pool.get(from_name, {}).get(to_name, {}).get(scene_id, [])
        if lines:
            text = random.choice(lines)
            detected = detect_emotion(text)
            return {"message": text, "emotion": detected}
    except Exception:
        pass

    text = fallback.get(scene_id, "嗯…")
    return {"message": text, "emotion": None}


# ── SceneEngine ──

class SceneEngine:
    """
    场景引擎——管理各场景的 Agent 状态。

    当前为纯内存存储（进程重启后丢失），
    后续 Step 可接入 SQLite / SceneSnapshot 持久化。
    """

    def __init__(self):
        self._scenes: dict[str, SceneState] = {}
        self.event_engine = RandomEventEngine()

    def _get_or_create(self, scene_id: str) -> SceneState:
        if scene_id not in self._scenes:
            self._scenes[scene_id] = SceneState(scene_id=scene_id)
        return self._scenes[scene_id]

    def get_state(self, scene_id: str) -> list[AgentSpriteData]:
        """获取某场景当前 Agent 状态"""
        return self._get_or_create(scene_id).agents

    def update_state(
        self, scene_id: str, agents: list[AgentSpriteData],
    ) -> list[AgentSpriteData]:
        """替换某场景的全部 Agent 状态"""
        scene = self._get_or_create(scene_id)
        scene.agents = agents
        return scene.agents

    def add_agent(self, scene_id: str, agent: AgentSpriteData) -> list[AgentSpriteData]:
        """向场景添加单个 Agent"""
        scene = self._get_or_create(scene_id)
        # 已存在则替换
        existing = next((a for a in scene.agents if a.agentId == agent.agentId), None)
        if existing:
            existing.tileX = agent.tileX
            existing.tileY = agent.tileY
            existing.action = agent.action
            existing.emotion = agent.emotion
        else:
            scene.agents.append(agent)
        return scene.agents

    def remove_agent(self, scene_id: str, agent_id: str) -> list[AgentSpriteData]:
        """从场景移除单个 Agent"""
        scene = self._get_or_create(scene_id)
        scene.agents = [a for a in scene.agents if a.agentId != agent_id]
        return scene.agents

    def get_random_event(self, scene_id: str) -> Optional[SceneEvent]:
        """66-S: 获取场景随机事件"""
        return self.event_engine.get_for_scene(scene_id)

    # ── 66-S: 对话生成 ──

    async def generate_dialogue(
        self, from_name: str, to_name: str, scene_id: str,
        message: str = "", emotion: str = "neutral",
    ) -> dict:
        """生成符合人格×场景的对话（LLM优先，mock兜底）"""
        return await generate_dialogue_llm(from_name, to_name, scene_id, message, emotion)


# ── Step 81: SceneBridge —— 场景 ↔ Brain 桥接 ──


class SceneBridge:
    """场景 ↔ WorldEngine 桥接器。

    将 SceneEngine 的视觉状态（精灵位置/动作/情绪）
    与 WorldEngine 的 Agent 心智模型双向同步。

    用法:
        bridge = SceneBridge(scene_id, world_engine)
        bridge.sync_to_scene()   # WorldEngine → SceneEngine
        bridge.sync_to_world()   # SceneEngine → WorldEngine
    """

    def __init__(self, scene_id: str, world_engine):
        self.scene_id = scene_id
        self._engine = world_engine

    # ── WorldEngine → SceneEngine（Agent 自主决策后更新精灵）──

    def sync_to_scene(self) -> list[AgentSpriteData]:
        """将 WorldEngine 中 Agent 的状态同步到 SceneEngine 精灵数据。"""
        sprites: list[AgentSpriteData] = []
        for agent_id, agent in self._engine.agents.items():
            name = agent.persona.name or agent_id[:8]
            emoji = getattr(agent.persona, "emoji", "🤖") or "🤖"
            color = getattr(agent.persona, "color", "#8888cc") or "#8888cc"

            position = getattr(agent, "position", None) or {}
            tile_x = position.get("tile_x", 0)
            tile_y = position.get("tile_y", 0)

            sprite = AgentSpriteData(
                agentId=agent_id,
                name=name,
                emoji=emoji,
                color=color,
                tileX=tile_x,
                tileY=tile_y,
                action="idle",
                emotion=agent.emotional_state.label,
            )
            sprites.append(sprite)

        # 写入 SceneEngine
        scene_engine.update_state(self.scene_id, sprites)
        return sprites

    # ── SceneEngine → WorldEngine（前端投放精灵 → Agent 位置）──

    def sync_to_world(self):
        """将 SceneEngine 中的精灵位置同步回 WorldEngine Agent。"""
        agents = scene_engine.get_state(self.scene_id)
        for sprite in agents:
            if sprite.agentId in self._engine.agents:
                agent = self._engine.agents[sprite.agentId]
                if not hasattr(agent, "position") or agent.position is None:
                    agent.position = {}
                agent.position["tile_x"] = sprite.tileX
                agent.position["tile_y"] = sprite.tileY

    # ── 移动 Agent ──

    def move_agent(self, agent_id: str, tile_x: int, tile_y: int) -> bool:
        """更新 Agent 的场景位置。"""
        agent = self._engine.agents.get(agent_id)
        if agent is None:
            return False
        if not hasattr(agent, "position") or agent.position is None:
            agent.position = {}
        agent.position["tile_x"] = tile_x
        agent.position["tile_y"] = tile_y
        # 同步到 SceneEngine
        self.sync_to_scene()
        return True

    # ── 随机事件 ──

    def try_random_event(self) -> dict | None:
        """尝试触发场景随机事件。返回事件 dict 或 None。"""
        event = scene_engine.get_random_event(self.scene_id)
        if event is None:
            return None
        return {
            "id": event.id,
            "text": event.text,
            "target": event.target,
            "emotion": event.emotion,
            "intensity": event.intensity,
        }


# 全局单例
scene_engine = SceneEngine()
