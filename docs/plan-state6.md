# 人生实验室 · Life Lab — Plan State 6

> **文档目的：** 第六阶段——三线并行。A 线 M11 Agent 主动社交（让场景活起来），B 线 M12 Worker 进阶（对标 code/research agent），C 线零成本推广（桌面端打包+内容传播）。
> **上一阶段：** State 5（Worker 工作台、双轨工作区、多 Agent 协作、管道编排、自主调度——全部完成）
> **当前状态：** Agent 能干活了。但还能更深——场景里的 agent 还不会主动找你聊天，Worker 的沙盒离"真正的代码执行环境"还差几步，项目还没有一套能零成本推广的方案。

---

## Step 速查表

| Step | 线 | 名称 | 依赖 | 核心产出 | 估时 |
|------|----|------|------|----------|------|
| **💬 A线：M11 游戏化互动** | | | | | |
| 98 | A | 主动搭话引擎 | M11 | 定时扫描 + 话题生成 + 横幅通知 + 超时放弃 | 4h |
| 99 | A | 对话弹窗 + 精灵动画 | 98 | 跳动动画 + 横幅提示 + 对话 UI + Agent 锁定 | 4h |
| 99a | A | M11 空闲自动暂停 | M11 | 空闲检测 + 真正暂停（断SSE/停定时器/清情绪引擎） | 2h |
| 99b | A | 绘文字投掷 | M11 | 点击/触摸投掷 emoji → 落点检测 → Agent 附近反应 + 连击/友尽机制 | 3h |
| 99c | A | 涂鸦指令 | M11, 99b | 画线→Agent 跟随 / 画圈→聚集 / 画叉→避开 + 形状识别容错 | 3h |
| 99d | A | 对话选项分支 | 98, 99 | 3 选项回复 → 预设情绪分支 → Agent 即时反应 + 历史影响后续搭话频率 | 2h |
| **🔧 B线：M10/M12 增强** | | | | | |
| 100 | B | Worker 工具增强 | State 5 | pip install(venv隔离) + Git clone(只读) + prompt引用规范 | 4h |
| 100a | B | M12 产出展示墙 | State 5 | 卡片瀑布流 + Markdown/JSON/Python 预览 + 飞入动画 + 分享 | 4h |
| 100b | B | M10 实时 Agent 对战 | State 5 | 双 Worker 同任务 → 左右分屏 SSE → 比分实时拉扯 → 六维终判 | 5h |
| **📦 C线：零成本推广** | | | | | |
| 101 | C | Demo 模式 + Git Releases | State 5 | 预录回放（零 API Key 体验）+ pip install 打包 + 首次引导 | 5h |
| 102 | C | 内容传播方案 | 98, 100 | 3 条病毒视频脚本 + GitHub Pages 落地页 + 一键安装 | 4h |
| T14 | — | 三线集成测试 | 98–102 | A线全交互+B线沙盒+对战+展示墙+C线Demo+打包 | 5h |

> **共 14 个 Step。** A 线 6 步 (18h)，B 线 3 步 (13h)，C 线 2 步 (9h)，测试 1 步 (5h)。三线独立可并行。
> **总计估时：** ~45 小时。ABC 并行实际约 18-20 小时。
> **总计估时：** ~27 小时。ABC 并行实际约 12-14 小时。
> **总计估时：** ~36 小时（一人+AI）。ABC 并行实际约 15-18 小时。

---

## 目录

- [A 线：M11 游戏化互动](#a-线m11-游戏化互动)
  - [Step 98 — 主动搭话引擎](#step-98--主动搭话引擎)
  - [Step 99 — 对话弹窗 + 精灵动画](#step-99--对话弹窗--精灵动画)
  - [Step 99a — M11 空闲自动暂停](#step-99a--m11-空闲自动暂停)
  - [Step 99b — 绘文字投掷](#step-99b--绘文字投掷)
  - [Step 99c — 涂鸦指令](#step-99c--涂鸦指令)
  - [Step 99d — 对话选项分支](#step-99d--对话选项分支)
- [B 线：M10/M12 增强](#b-线m10m12-增强)
  - [Step 100 — Worker 工具增强](#step-100--worker-工具增强)
  - [Step 100a — M12 产出展示墙](#step-100a--m12-产出展示墙)
  - [Step 100b — M10 实时 Agent 对战](#step-100b--m10-实时-agent-对战)
- [C 线：零成本推广方案](#c-线零成本推广方案)
- [附录：为什么桌面端打包能解决推广问题](#附录-为什么桌面端打包能解决推广问题)

---

## A 线：M11 Agent 主动社交

> **目标：** 场景中的 Agent 不再只互相聊天或等用户点击。它们会主动找用户搭话——身体跳动、屏幕顶部弹出横幅。用户点击→开始 2-3 轮对话。不理→超时放弃。
> **核心理念：** 把 Agent 从"被观察的 NPC"升级为"会找你的人"。跳出 M11 当前"观察沙盒"的定位——让用户也成为场景的参与者。

### 设计：什么时候触发、怎么触发

```
触发规则（避免骚扰用户）:

每 4-8 分钟（随机间隔）:
  ┌─ 扫描场景中所有活跃 Agent
  │
  ├─ 筛选条件（全部满足才触发）:
  │   1. Agent 当前空闲（未在对话中、未在执行操作）
  │   2. Agent 距离上一个主动搭话 > 10 分钟（全局冷却）
  │   3. 当前没有其他 Agent 正在主动搭话（单实例）
  │   4. 用户在过去 2 分钟内有过交互（排除挂机场景）
  │
  ├─ 选中最合适的 Agent（优先级: 情绪 intense > 外向人格 > 用户近期互动过）
  │
  └─ 触发
       ├─ Agent 精灵开始跳动动画（上下弹跳 + 放大缩小，持续 2s）
       ├─ 屏幕顶部滑入横幅: "[Agent 名字] 想跟你聊聊..."
       │    └─ 副标题: 话题预览（如 "你有没有想过..."）
       ├─ 横幅右侧: [💬 聊聊] [✕ 忽略]
       │
       ├─ 用户点击 [💬 聊聊]
       │    → 场景暂停（其他 Agent 冻结）
       │    → 当前 Agent 锁定（其他 Agent 在此期间不可与之交互）
       │    → 弹出对话面板
       │    → 2-3 轮对话（Agent 发起→用户回复→Agent 回应→用户回复→Agent 收尾）
       │    → 对话结束 → 场景恢复
       │
       └─ 用户忽略 / 60s 未响应
            → 横幅滑出 + 消失
            → Agent 显示一个短暂的表情动画（失落/耸耸肩）
            → 恢复正常
```

### 话题生成

话题不是随机选的——跟**场景内容**和**Agent 人格**绑定的：

```python
# 话题生成策略（按场景 + 人格）

TOPIC_TEMPLATES = {
    "library": {
        "ENFP": ["你看过这本书吗？封面好有意思", "好安静啊——你是来复习的吗？"],
        "INTJ": ["我在看一本关于{话题}的书，你想听听吗？"],
        "ESTJ": ["这里的座位利用率不太合理，你觉得呢？"],
    },
    "sakura": {
        "ENFP": ["花好美啊！你最喜欢哪个季节？", "我想在樱花树下野餐——一起吗？"],
        "INFP": ["你有没有想过花瓣最后飘到哪里去…"],
    },
    # ... 每个场景 × 每个 MBTI 有 2-3 条话题
}

# 话题可由 LLM 实时生成（如果 API 可用），也可从预设库中取（离线兜底）

async def generate_topic(agent: AgentSpriteData, scene: str) -> str:
    """生成一个符合 Agent 人格 + 场景的话题。"""
    if llm_available:
        prompt = f"你是{agent.name}，{agent.mbti}人格。你在{scene}。用一句话主动跟一个路过的人搭话。要自然、带点好奇、不要像客服。"
        return await llm.generate(prompt)
    
    # 离线兜底：从预设库按 MBTI + 场景取
    pool = TOPIC_TEMPLATES.get(scene, {}).get(agent.mbti, DEFAULT_TOPICS)
    return random.choice(pool)
```

### Agent 动画设计

```
跳动动画（触发时）:
  0s: 正常位置 (y=base)
  0.3s: 弹起 (y=base-12px, scale=1.15)
  0.6s: 落下 (y=base, scale=1.0)
  0.9s: 弹起 (y=base-6px, scale=1.08)
  1.2s: 落下 (y=base, scale=1.0)
  重复 2 次 → 回 idle

横幅:
  从顶部滑入 (translateY: -60px → 0, 300ms ease-out)
  停留期间有微弱的脉冲光晕
  滑出 (translateY: 0 → -60px, 200ms ease-in) 或 点击展开

被忽略后的表情:
  低头/叹气动画（0.8s），然后恢复正常
```

### Step 98 — 主动搭话引擎

#### 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/game/scenes/MapScene.ts` | 修改 | 新增 `ProactiveChatManager`：定时扫描 + 触发检测 + 超时管理 |
| `frontend/src/game/ProactiveChatManager.ts` | **新建** | 搭话触发逻辑——冷却管理 + 候选排序 + 话题生成 |
| `frontend/src/game/emotion/EmotionEngine.ts` | 修改 | 新增情绪事件类型：`proactive_chat_accepted` / `proactive_chat_ignored` |
| `frontend/src/game/dialogue.ts` | 修改 | 新增 `generateProactiveTopic(from, scene)` + 预设话题库 |
| `backend/src/api/scenes.py` | 修改 | `POST /scenes/{id}/proactive-topic`——LLM 生成话题 |

#### 验收标准

- [ ] Agent 在空闲时，每 4-8 分钟概率触发主动搭话
- [ ] 有 Agent 在搭话时，其他 Agent 不会同时触发
- [ ] 同一 Agent 不会在 10 分钟内连续搭话
- [ ] 用户已离开（2 分钟无交互）→ 不触发
- [ ] 话题与 Agent 人格 + 场景内容相关（不是"你好"）

---

### Step 99 — 对话弹窗 + 精灵动画

#### 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/game/sprites/AgentSprite.ts` | 修改 | 新增 `playBounce()`、`playDisappointed()` 动画方法 |
| `frontend/src/components/scene/ProactiveBanner.tsx` | **新建** | 顶部滑入横幅——头像 + 话题预览 + 按钮 |
| `frontend/src/components/scene/ProactiveChat.tsx` | **新建** | 对话弹窗——Agent 头像 + 对话气泡 + 用户输入框 + 轮次指示 |
| `frontend/src/pages/GameScene.tsx` | 修改 | 集成 ProactiveBanner + ProactiveChat + 场景暂停/恢复逻辑 |
| `frontend/src/game/GameCanvas.tsx` | 修改 | 暴露 `freezeAgents()`/`unfreezeAgents()` 供 React 层调用 |

#### 对话流程的状态机

```
TRIGGERED ──→ BANNER_SHOWING
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
   USER_CLICKED        USER_IGNORED
        │               (60s timeout)
        ▼                   │
   SCENE_FROZEN             ▼
        │            AGENT_DISAPPOINTED
   AGENT_LOCKED              │
        │                    ▼
   ROUND_1 (Agent→User)   BANNER_HIDE
        │                    │
   ROUND_2 (User→Agent→回应) │
        │                    ▼
   ROUND_3 (Agent→User→收尾) CLEANUP
        │
   SCENE_RESUME
   AGENT_UNLOCKED
```

#### 验收标准

- [ ] 触发时 → Agent 精灵跳动（弹起+缩放，2 秒）→ 横幅从顶部滑入
- [ ] 点击"聊聊"→ 其他 Agent 冻结（原地 idle）→ 对话 Agent 锁定
- [ ] 对话 2-3 轮自然收尾——Agent 主动结束（不是切到下一轮）
- [ ] 60 秒未响应 → 横幅滑出 → Agent 播放失落动画 → 恢复正常
- [ ] 对话结束后场景平滑恢复

---

### Step 99a — M11 空闲自动暂停

> **目标：** 用户在 M11 场景挂机时，真正停止所有后台活动——断开 SSE、停掉 EmotionEngine 定时器、停掉 Phaser update loop、清除对话扫描。防止 API 费用持续燃烧。
> **为什么需要：** M11 即使"看起来什么都没发生"，后台仍在跑——EmotionEngine 每 3s 的对话扫描触发 LLM 调用、Phaser 每帧 update、Agent 精灵 idle 动画。用户离开 1 小时 = 1 小时的 API 费。

#### 空闲检测策略

```
空闲定义: {IDLE_TIMEOUT} 分钟内无以下任一用户交互:
  - 鼠标点击
  - 鼠标移动（可选——有些人会盯着看不动）
  - 键盘按键
  - 触摸事件（移动端）

IDLE_TIMEOUT = 5 分钟（默认，可在 settings 中配置）

检测机制:
  document.addEventListener('mousemove', resetIdleTimer)
  document.addEventListener('click', resetIdleTimer)
  document.addEventListener('keydown', resetIdleTimer)
  
  setInterval(() => {
    if (Date.now() - lastInteraction > IDLE_TIMEOUT * 60 * 1000) {
      triggerAutoPause()
    }
  }, 10000)  // 每 10 秒检查一次，不是每帧
```

#### 暂停时真正停止的东西

```
触发自动暂停 → 以下全部停止:

前端:
  □ Phaser scene.pause()          → 停止 update loop + 渲染
  □ EmotionEngine.stop()          → 停止所有定时器（对话扫描/环境/decay）
  □ ProactiveChatManager.stop()   → 停止主动搭话定时器
  □ AutonomousMover 全部 pause()   → 停止精灵移动
  □ SSE EventSource.close()       → 断开 SSE 连接
  □ 所有 pending 的 setTimeout/setInterval 清理

后端（被动——SSE 断开后自然停止）:
  □ SSE generator 检测到连接断开 → 停止 yield
  □ WorldEngine 检测到 status != "running" → 停止 tick
  □ 如果配置了 ENABLE_SCHEDULER → 调度器不处理此 World

暂停后:
  □ 显示全屏半透明遮罩:
    "😴 场景已暂停（5 分钟无操作）"
    "点击任意位置继续"
  □ 点击 → 重新连接 SSE → 恢复 EmotionEngine → 所有恢复
```

#### 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/game/GameCanvas.tsx` | 修改 | 新增 `pauseAll()` / `resumeAll()` 方法——Phaser + 引擎 + SSE 的全停/全恢复 |
| `frontend/src/game/emotion/EmotionEngine.ts` | 修改 | `stop()` 方法确保所有 setInterval 被 clearInterval |
| `frontend/src/game/ProactiveChatManager.ts` | 修改 | `stop()` 清理定时器 |
| `frontend/src/pages/GameScene.tsx` | 修改 | 空闲检测 + 遮罩 UI + 恢复逻辑 |
| `backend/src/api/sse.py` | 修改 | SSE generator 检测断连 → 标记 world 暂停（如果超过 IDLE_TIMEOUT 无人重连） |

#### 验收标准

- [ ] 5 分钟无操作 → 自动暂停 → Phaser 停止渲染 + SSE 断开 + EmotionEngine 停止
- [ ] 暂停后显示"场景已暂停"遮罩
- [ ] 暂停期间后端不再产生新 tick（SSE 断开 → generator 退出 → World 不推进）
- [ ] 点击遮罩 → SSE 重连 → Phaser 恢复 → EmotionEngine 重新启动
- [ ] 5 分钟内有操作 → 不触发暂停
- [ ] M11 其他功能不受影响（主动搭话的定时器在恢复后正常重启）

---

### Step 99b — 绘文字投掷

> **目标：** 用户点击/触摸场景任意位置 → emoji 从屏幕顶部落下 → 砸到地面。如果落在 Agent 附近，Agent 做出即时表情反应。
> **设计哲学：** 零后端改动。纯前端——Phaser 粒子 + Agent 已有的 emotion 系统。扔东西→看到反应→开心。不需要 Agent "理解" emoji 的含义。

#### Emoji 与反应映射表

```
emoji  含义      Agent 附近（≤2 tile）               Agent 远处（>2 tile）    落空
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
❤️     喜欢      Agent 脸红 + happy emoji 弹出 + 跳一下    Agent 停下来看一眼       着地消失
😡     生气      Agent 皱眉 + 回头张望 + 冒汗              Agent 抬头看了看        着地消失
🌸     送花      那格地板长出 3 朵小花（持续 30s）         花瓣飘散                着地一朵小花
💣     炸弹      Agent 被炸飞动画 + 黑烟粒子 + 3s 恢复     Agent 被震退 1 tile     着地小爆炸
🎵     音乐      Agent 开始摇摆 + 音符粒子飘出              Agent 停下动作看        着地消失
👻     惊吓      Agent 跳起来 + 瞪眼表情 + 3s 惊慌恢复      Agent 抖了一下          着地消失
```

#### 防滥用机制

```
- 点击间隔: 最少 0.5s（防连点刷屏）
- 单屏上限: 最多同时 3 个 emoji 粒子（第 4 个拒绝 + 提示 "慢一点~"）
- Agent 反应冷却: 同一 Agent 对 emoji 反应后 5s 内不再反应（防狂砸）
- 连砸同一 Agent: 连续 3 次反应 → Agent 闪避动画 + 🚫 标记 30s（友尽冷却）
```

#### 用到的现有系统

| 现有 | 怎么用 |
|------|--------|
| Phaser 粒子系统 | emoji 从顶部落下的重力动画（复用樱花粒子逻辑） |
| AgentSprite.setEmotion() | Agent 收到 emoji 后的表情切换（已有 9 种表情） |
| EmotionEngine.onEmoteBurst() | 反应时的表情粒子爆发（Step 66 已做） |
| MapScene 点击检测 | 已有点击→Agent 面板逻辑，同事件流加 emoji 投掷 |

#### 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/game/effects/EmojiDrop.ts` | **新建** | Emoji 投掷系统——点击检测 + 落点判断 + 反应分发 |
| `frontend/src/game/scenes/MapScene.ts` | 修改 | 集成 EmojiDrop + 点击事件分流（Agent 点击 vs 空地投掷） |
| `frontend/src/game/sprites/AgentSprite.ts` | 修改 | 新增 `reactToEmoji(emoji)` 方法——根据 emoji 类播放对应动画 |
| `frontend/src/game/emotion/EmotionEngine.ts` | 修改 | 新增 `emoji_impact` 情绪触发类型 |

#### 验收标准

- [ ] 点击空地 → emoji 从顶部落下 → 着地 → 对应效果（🌸长花 / ❤️消失等）
- [ ] 点击 Agent 近处（≤2 tile）→ Agent 即时反应动画 + 表情变化
- [ ] 连续点击 3 次 → 拒绝 + "慢一点~" 提示
- [ ] 连续砸同一 Agent 3 次 → 友尽冷却 30s + 闪避动画 + 🚫
- [ ] 同一 Agent 两次反应间隔 ≥5s
- [ ] 场景暂停（Step 99a）时 emoji 投掷不可用

---

### Step 99c — 涂鸦指令

> **目标：** 用户按住鼠标在场景上画简单形状。Agent 识别形状并据此调整行为。
> **设计哲学：** 只识别 3 种形状（线/圈/叉），每种有明确的 Agent 行为。画别的一律忽略——不试图理解"自由涂鸦"。

#### 形状识别规则

```
输入: 用户画的一系列 (x, y) 点
处理: 基本的几何特征检测（不依赖 ML，纯算法）

线 (LINE):
  检测: 起点→终点距离 > 60px，中间点偏离直线 < 15px
  行为: 最近的 Agent 沿线的方向走到终点
  反馈: 线上出现短暂的光轨，Agent 开始 walking 动画

圈 (CIRCLE):
  检测: 首尾距离 < 30px，路径围成的面积 > 1000px²，形状圆度 > 0.6
  行为: 所有 Agent 朝圆心聚集（各自走到圈内最近可达 tile）
  反馈: 圈上出现光环闪烁，Agent 进入 gathering 状态

叉 (CROSS / X):
  检测: 两条相交线段，夹角 > 30°且 < 150°
  行为: 所有 Agent 从叉心向外散开（各自走到距离叉心 ≥5 tile 的位置）
  反馈: 叉心闪过红光，Agent 进入 avoiding 状态

什么都匹配不到:
  → 线条淡出消失，Agent 不做任何反应。不报错、不提示——安静地忽略。
```

#### 容错设计

```
- 手抖: 点之间做 3px 高斯平滑后再识别
- 半路松手: 如果点数 < 10，忽略（不是故意的涂鸦，只是误触）
- 画得太小: 最小笔画长度 40px，不够 → 忽略
- 场景边界: Agent 走到边界的 tile 时自动停下，不报错
- 画在 Agent 身上: 不做特殊处理——Agent 下方的线照样识别
- 同一时间只能画一条: 新涂鸦会清除上一条（不叠涂鸦）
- 涂鸦自动消失: 5 秒后线条淡出，Agent 不再受约束
```

#### 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/game/effects/GraffitiLayer.ts` | **新建** | HTML5 Canvas 叠层 + 绘画检测 + 形状识别 |
| `frontend/src/game/scenes/MapScene.ts` | 修改 | 集成 GraffitiLayer + 形状结果→Agent 行为分发 |
| `frontend/src/game/AutonomousMover.ts` | 修改 | 新增 `moveAlongLine()`、`moveToPoint()`、`scatterFrom()` 方法 |

#### 验收标准

- [ ] 画线 → 最近 Agent 沿线走到终点（walk 动画）
- [ ] 画圈 → 所有 Agent 聚集到圈内（各自走最近可达 tile）
- [ ] 画叉 → 所有 Agent 从叉心散开
- [ ] 画一团乱线（圆度<0.6）→ Agent 无反应，线条 5s 后淡出
- [ ] 画太短（<40px）→ 忽略
- [ ] Agent 走到墙/边界时自动停下（不走墙里）
- [ ] 5 秒后线条自动消失 + Agent 恢复自主移动
- [ ] 场景暂停时涂鸦不可用

---

### Step 99d — 对话选项分支

> **目标：** Agent 主动搭话时，不只"聊聊"和"忽略"。用户看到 3 个回复选项——每种选择触发 Agent 不同的预设反应。
> **设计哲学：** 不做 NLU。不做"Agent 理解用户回复"。就是 3 个按钮 → 3 条预设分支。简单、可控、有效果。

#### 分支结构

```
Agent 搭话: "你有没有想过...如果考试突然取消会怎样？"

选项:
[A: 友善] "那也太好了吧！"     → Agent 开心 + ❤️ + "对吧！我就知道你会这么说"
[B: 冷淡] "别做梦了"           → Agent 失落 + 😔 + "好吧...我就是随便想想"
[C: 挑衅] "你是不是没复习？"   → Agent 炸毛 + 😡 + "关你什么事！"（转头走开，5min 内不再搭话）
```

**选项生成规则：**
- 每条话题配 3 个用户回复模板 + 3 个 Agent 回应模板
- 不需要 LLM——预设模板库，按话题类别匹配
- 话题类别：闲聊 / 求助 / 吐槽 / 好奇 / 邀请
- 每类别有 5-8 套 (3选项→3回应) 模板

**选择历史影响：**
```
用户历史选择 → 影响 Agent 行为:
- 最近 5 次选择友善 ≥ 4 次 → Agent 搭话频率 +30%
- 最近 5 次选择挑衅 ≥ 3 次 → Agent 搭话频率 -50% + 话题偏"你还在生气吗"
- 上次选择挑衅 → Agent 5min 内不搭话（已在分支 C 中处理）
```

#### 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/components/scene/ProactiveChat.tsx` | 修改 | 对话面板从"开始聊天"按钮 → 3 选项按钮 |
| `frontend/src/components/scene/ProactiveBanner.tsx` | 修改 | 横幅从 2 按钮(聊聊/忽略) → 点击聊聊后再展示 3 选项 |
| `frontend/src/game/dialogue.ts` | 修改 | 新增 `getChatOptions(topic)` + `getAgentReaction(option)` |
| `frontend/src/stores/useChatHistoryStore.ts` | **新建** | 用户选择历史 Zustand store（最近 N 条，localStorage 持久化） |

#### 验收标准

- [ ] Agent 搭话 → 用户点击"聊聊"→ 展示 3 个选项按钮（非 LLM 生成——模板库取）
- [ ] 选 A（友善）→ Agent 开心动画 + ❤️ + 回应文本
- [ ] 选 B（冷淡）→ Agent 失落动画 + 回应文本
- [ ] 选 C（挑衅）→ Agent 炸毛 + 转头走开 + 5min 内不搭话
- [ ] 连续友善 4/5 → 搭话频率 +30%
- [ ] 连续挑衅 3/5 → 搭话频率 -50%
- [ ] 选择历史持久化 localStorage → 刷新不丢失

---

## B 线：M12 Worker 进阶

> **目标：** Worker 不只是"搜索+写报告"。给 Agent 真正的 Python 生态和代码分析能力。
> **策略：** 只做一定能做的——venv 隔离的 pip install + 只读 Git clone + 更好的 prompt。不做需要新调度层的东西（子任务、断点续传留给后续）。

### 可行 vs 不可行

| 想法 | 能做吗 | 复杂度 | 判断 |
|------|--------|--------|------|
| pip install 第三方包 | ✅ | 低——subprocess 调 `python -m venv` + `pip install` | 做 |
| Git clone 分析代码 | ✅ | 低——subprocess 调 `git clone --depth=1`，只读 | 做 |
| 引用规范（脚注+来源URL） | ✅ | 极低——改 prompt，零行新后端代码 | 做 |
| SourceTracker 类（可信度评分） | ⚠️ | 中——需要语义理解，LLM 不稳定 | **不做** |
| spawn_subtask（子 Worker） | ❌ | 高——需要完整调度层 | **不做** |
| checkpoint/resume | ❌ | 高——需要状态序列化+workspace 快照 | **不做** |

### Step 100 — Worker 工具增强

> **目标：** 3 个东西——① pip install（Agent 能装 pandas/numpy 做数据分析）② Git clone（Agent 能读开源项目代码）③ 引用 prompt（Agent 产出自动带来源脚注）。

#### ① pip install

```python
# sandbox.py

async def ensure_package(self, packages: str) -> str:
    """在隔离的 venv 中安装包。首次创建 venv，后续复用。"""
    venv_dir = self.workspace / ".venv"
    if not (venv_dir / "pyvenv.cfg").exists():
        await run_subprocess([sys.executable, "-m", "venv", str(venv_dir)])
    
    pip = str(venv_dir / "bin" / "pip")  # or Scripts/pip.exe on Windows
    result = await run_subprocess([pip, "install", "--quiet"] + packages.split())
    
    if result.returncode == 0:
        return f"✅ 已安装: {packages}"
    return f"❌ 安装失败: {result.stderr[:200]}"
```

复杂度：一行 subprocess 调用 + venv 隔离。已经验证过 `run_python` 的沙盒模式，是一样的技术栈。

#### ② Git clone（只读）

```python
async def git_clone(self, url: str) -> str:
    """克隆仓库到 workspace。只允许 https:// 协议——禁止 SSH/git@。"""
    if not url.startswith("https://"):
        return "❌ 仅支持 https:// 协议的仓库"
    
    repo_name = url.rstrip("/").split("/")[-1].replace(".git", "")
    target = self.workspace / repo_name
    await run_subprocess(["git", "clone", "--depth=1", url, str(target)])
    files = list(target.glob("*"))
    return f"✅ 已克隆 {repo_name}（{len(files)} 个顶层文件）"
```

复杂度：一行 git clone，`--depth=1` 避免大仓库。

#### ③ 引用 prompt（零新代码）

不是新工具。是在 Agent 的决策 prompt 里多一段：

```
## 产出物的格式要求
当你写 Markdown 报告时，必须遵守：
- 每一条数据/声明后面附上来源 URL（Markdown 脚注格式）
- 在报告末尾列出所有来源的完整信息
- 在来源列表后附加一个"可信度自评"段（高/中/低 + 一句话理由）
```

Agent 会自动遵守——LLM 不需要新代码就能理解这个要求。和 State 5 的 Worker 决策 prompt 改动方式一样。

#### 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/engines/worker/sandbox.py` | 修改 | 新增 `ensure_package`、`git_clone` 方法 |
| `backend/src/engines/worker/tools.py` | 修改 | 新增 `install_package`、`git_clone` 两个 tool handler |
| `backend/src/engines/worker/prompts.py` | 修改 | 决策 prompt 增加包管理/Git 能力描述 + 引用格式要求 |
| `backend/tests/test_worker_sandbox.py` | 修改 | 新增 venv 创建 + pip install + git clone 测试 |

#### 验收标准

- [ ] Agent 调用 `install_package("pandas")` → venv 创建 → pip 安装 → import pandas 成功
- [ ] 同一 workspace 第二次调用 `install_package("matplotlib")` → 复用 venv，只装新包
- [ ] Agent 调用 `git_clone("https://github.com/psf/requests")` → 仓库克隆 → 可 `read_file` 读源码
- [ ] `git_clone("git@github.com:user/repo.git")` → 拒绝（只允许 https）
- [ ] Agent 产出的 Markdown 报告包含 `[¹](#source-1)` 格式的引用脚注
- [ ] 报告末尾有来源列表 + 可信度自评
- [ ] 安全：venv 在 workspace 内、pip 不污染系统、Git 只读

---

### Step 100a — M12 产出展示墙

> **目标：** Agent 每次 Worker 任务的产出自动变成一张卡片。所有卡片汇聚成一个瀑布流展示墙——像翻自己的作品集。可以分享单张卡片。
> **设计哲学：** 不是"文件管理器"。是"作品的画廊"。空的卡片墙会引导用户给 Agent 第一个任务。

#### 卡片数据模型

```typescript
interface WorkCard {
  id: string                    // worker run_id
  agent: { id, name, emoji, mbti }
  task: string                  // 原始任务描述
  completed_at: string
  duration_secs: number         // 总耗时
  steps: number                 // 用了多少步
  files: { name, size, type }[] // 产出文件列表
  preview?: {                   // 自动生成预览
    type: "markdown" | "code" | "json" | "table" | "text"
    content: string             // 前 200 字 / 前 20 行
  }
  self_rating?: string          // Agent 的自评（如 "7/10"）
}
```

**预览生成规则：**
- `.md` → 渲染为 HTML + 截取前 200 字文本
- `.py` / `.js` / `.ts` → 语法高亮代码片段（前 20 行）
- `.json` → 渲染为折叠表格
- `.csv` → 渲染为前 5 行的表格
- 其他 → 仅显示文件名 + 大小

#### 卡片墙视觉

```
┌──────────────────────────────────────────────────────────┐
│  🖼️ Agent 成果墙                                          │
│                                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │🧑 小林    │ │🧑 小林    │ │🧑 小红    │ │🧑 小刚    │   │
│  │ISTJ      │ │ISTJ      │ │ENFP      │ │ESTJ      │   │
│  │──────────│ │──────────│ │──────────│ │──────────│   │
│  │          │ │          │ │          │ │          │   │
│  │AI框架    │ │Python库  │ │竞品分析  │ │代码审查  │   │
│  │对比报告  │ │性能分析  │ │报告      │ │requests  │   │
│  │          │ │          │ │          │ │          │   │
│  │📄report  │ │📊chart   │ │📄report  │ │📄review  │   │
│  │ .md 8KB  │ │ .py 2KB  │ │ .md 12KB │ │ .md 5KB  │   │
│  │📄notes   │ │📄result  │ │📄sources │ │          │   │
│  │ .md 4KB  │ │ .json 6KB│ │ .json 3KB│ │          │   │
│  │──────────│ │──────────│ │──────────│ │──────────│   │
│  │⏱ 2.3min │ │⏱ 3.1min │ │⏱ 1.8min │ │⏱ 4.2min │   │
│  │📊 12步   │ │📊 18步   │ │📊 9步    │ │📊 22步   │   │
│  │⭐ 8/10   │ │⭐ 7/10   │ │⭐ 9/10   │ │⭐ 6/10   │   │
│  │          │ │          │ │          │ │          │   │
│  │[📥下载]  │ │[📥下载]  │ │[📥下载]  │ │[📥下载]  │   │
│  │[🔗分享]  │ │[🔗分享]  │ │[🔗分享]  │ │[🔗分享]  │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │
│                                                          │
│  🏷️ 筛选: [全部] [小林] [小红] [报告] [代码] [本周]       │
│  排序: [最新 ▼]                                          │
└──────────────────────────────────────────────────────────┘
```

**空状态引导：**

```
┌──────────────────────────────────────────┐
│                                          │
│         🛠️ 还没有成果                     │
│                                          │
│    给你的 Agent 一个任务，                 │
│    它产出的报告、数据、代码                 │
│    会自动出现在这面墙上。                   │
│                                          │
│    [🚀 去 Worker 工作台]                  │
│                                          │
└──────────────────────────────────────────┘
```

#### 卡片飞入动画

新卡片出现时：`scale(0) → scale(1.05) → scale(1)`，持续 400ms。相邻卡片按列依次延迟 80ms，产生涌入感。

#### 分享功能

点击"分享"→ 复制卡片链接（`lifelab://card/card-id`）或生成一张 PNG 截图（纯前端 Canvas 截图，不需要服务器）。

#### 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/pages/ShowcaseWall.tsx` | **新建** | 卡片墙主页面——Grid 布局 + 筛选 + 排序 + 空状态 |
| `frontend/src/components/showcase/WorkCard.tsx` | **新建** | 单张卡片——头像 + 预览 + 元信息 + 下载/分享按钮 |
| `frontend/src/components/showcase/FilePreview.tsx` | **新建** | 文件预览渲染器——MD→HTML, Code→高亮, JSON→表格 |
| `frontend/src/components/showcase/CardFlyIn.tsx` | **新建** | 飞入动画包装器——scale + delay 链 |
| `frontend/src/api/workers.ts` | 修改 | 新增 `useWorkerHistory()`——取已完成 Worker 列表 |
| `backend/src/api/workers.py` | 修改 | 新增 `GET /api/workers/history`——返回已完成 Worker 卡片数据 |
| `frontend/src/App.tsx` | 修改 | `/showcase` 路由 |

#### 验收标准

- [ ] 完成一次 Worker 任务 → 卡片墙出现一张新卡片（飞入动画）
- [ ] 卡片展示 Agent 头像+任务名+文件列表+元信息（耗时/步数/自评）
- [ ] Markdown 文件预览渲染为 HTML（前 200 字），代码文件语法高亮
- [ ] 空状态引导——"还没有成果" + 跳转 Worker 按钮
- [ ] 按 Agent 筛选 / 按文件类型筛选 / 按时间排序
- [ ] 点击下载 → 下载对应文件
- [ ] 刷新不丢失——数据从后端 `/api/workers/history` 取

---

### Step 100b — M10 实时 Agent 对战

> **目标：** 两个 Agent 面对同一个任务，左右分屏同时执行。终端实时滚动它们的决策过程。中间比分拉扯显示进度。像电竞直播——评委看一眼就明白"它们在比赛"。
> **设计哲学：** 复用 Worker SSE 流——不是新引擎，是双 Worker 同时跑 + 一个对比前端。

#### 视觉设计

```
┌──────────────────────────────────────────────────────────────┐
│  ⚔️ Agent 对战                              比分: 65 vs 42    │
│                                                              │
│  ┌─ 小林 (ISTJ) ───────────┐  ┌─ 小红 (ENFP) ──────────────┐│
│  │                          │  │                              ││
│  │  ▸ 制定计划 (1.1s)       │  │  ▸ 制定计划 (0.8s)           ││
│  │    1. 搜索数据            │  │    1. 先广泛了解背景          ││
│  │    2. 核实来源            │  │    2. 找到有趣的角度          ││
│  │    3. 写分析报告          │  │    3. 写一篇吸引人的报告       ││
│  │                          │  │                              ││
│  │  ▸ web_search (2.1s)     │  │  ▸ web_search (1.8s)         ││
│  │    → 找到 5 条结果...     │  │    → 找到 5 条结果...         ││
│  │                          │  │                              ││
│  │  ▸ web_search 验证 (1.5s)│  │  ▸ write_file 灵感笔记 (0.9s) ││
│  │    → 交叉对比数据源...    │  │    ✅ report_draft.md          ││
│  │                          │  │                              ││
│  │  步骤: 4/12  耗时: 8.2s  │  │  步骤: 3/8  耗时: 5.1s       ││
│  └──────────────────────────┘  └──────────────────────────────┘│
│                                                              │
│  ┌─ 实时比分 ───────────────────────────────────────────────┐ │
│  │  小林 ██████████████████████████░░░░░░░░  65              │ │
│  │  小红 ████████████████░░░░░░░░░░░░░░░░░░  42              │ │
│  │        ↑ 搜索质量  ↑ 引用完整度  ↑ 自检次数               │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                              │
│  [⏸ 暂停]  状态: 对战进行中...                                │
└──────────────────────────────────────────────────────────────┘
```

#### 评分规则（实时更新）

不是等全部跑完再打分。每完成一个步骤就更新比分：

```
评分维度（六维的子集，适合实时显示）:

搜索质量 (0-100):
  +5  每次成功搜索
  +10 搜索结果被后续步骤引用（Agent 基于搜索结果做了下一步决策）
  -5  搜索关键词和前一步重复（无效重复搜索）

步骤效率 (0-100):
  初始 50
  +3  每步产出实质内容（write_file / deliverable）
  -2  每步只思考不行动（3 次连续 think_aloud 后开始扣）

自检质量 (0-100):
  +10 发现并修正了自己的错误（read_file → write_file 改）
  +5  标注了内容局限或可信度
```

#### 技术设计

```
两个 Worker 并行执行同一个任务:

POST /api/bench/duel
  Body: { agent_a_id, agent_b_id, task, max_steps: 20 }
  
→ 后端创建两个 Worker，并行启动
→ SSE stream 同时推送两边的事件
  { type: "duel.event", side: "a"|"b", worker_event: {...} }
  { type: "duel.score", scores: { a: 65, b: 42 }, breakdown: {...} }
  { type: "duel.done", winner: "a"|"b"|"draw", final_scores: {...}, summary: "..." }

前端:
→ 左右分屏终端——复用 WorkerTerminal 组件 × 2
→ 中间/底部实时比分条
→ 结束后弹出胜负 + 六维雷达图（复用 M10 的六边形组件）
```

#### 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/engines/worker/duel.py` | **新建** | DuelEngine——双 Worker 并行 + 实时评分 + SSE 合并流 |
| `backend/src/api/bench.py` | 修改 | `POST /api/bench/duel` → SSE stream |
| `frontend/src/pages/DuelArena.tsx` | **新建** | 对战页面——左右分屏 + 比分条 |
| `frontend/src/components/duel/DuelTerminal.tsx` | **新建** | 对战终端——复用 WorkerTerminal 但限制宽度 + 蓝色/红色边框 |
| `frontend/src/components/duel/ScoreBar.tsx` | **新建** | 实时比分条——动画拉扯 + 维度 breakdown 悬停提示 |
| `frontend/src/components/duel/DuelResult.tsx` | **新建** | 结束弹窗——胜负 + 六维对比雷达 |

#### 验收标准

- [ ] 选两个 Agent + 输入任务 → 两个终端同时滚动
- [ ] 每完成一步 → 比分条实时更新（动画拉扯效果）
- [ ] 两边进度不同步是正常的——快的 Agent 不等待慢的
- [ ] 一个 Agent 先完成 → 等待另一个（最长再等 30s）→ 弹出结果
- [ ] 结果弹窗：胜负判定 + 六维对比雷达 + LLM 简短评语
- [ ] 对战结果可保存 → 在 Bench 页面可回看历史对战
- [ ] 对战过程中可暂停/取消

---

## C 线：零成本推广方案

> **目标：** 不需要云服务器、不需要备案、不需要为用户付 API 费。
> **策略：** Demo 模式让人零成本体验（预录回放，不花 API 费）→ 体验完想试试真的 → Git clone + pip install + 自己的 Key → 内容传播把流量引到 GitHub。

### 为什么 API Key 是流失黑洞 + 怎么填

```
传统路径（流失率极高）:
  看到视频 → 觉得有趣 → GitHub clone → pip install → 
  启动 → "请输入 API Key" → 去注册 DeepSeek → 充值 → 复制 Key → 粘贴 → 
  终于能用了
  ↑ 每一步都有 30-50% 的人走掉

新路径（用 Demo 模式堵住黑洞）:
  看到视频 → 觉得有趣 → GitHub Releases 下载 → 
  启动 → ✨ Demo 模式自动播放（预录的真实 agent 工作过程）
  → 终端滚动、文件产出——视觉完全一样
  → "这就是你自己的 agent 能做的事"
  → 想试试自己的任务？→ 输入 API Key → 开始
  ↑ 用户在掏钱之前已经"亲眼见过"了
```

### Demo 模式设计

**预录回放——不是模拟，是真实 agent 跑过的记录。**

```
录制（开发者做一次）:
  Worker 执行一个精心设计的 Demo 任务
  → 每个 SSE 事件 + timestamp 存入 demo-session.json
  → 每个 write_file 产出的文件内容也存入

回放（用户看到）:
  前端加载 demo-session.json
  → 按 timestamp 逐事件播放
  → 终端打字机效果、搜索卡片、文件面板——完全一样
  → 只是没有真正的 LLM 调用
  → 零 API 费用
```

**Demo session 数据结构：**

```json
{
  "demo_id": "research-report",
  "title": "调研 AI Agent 框架并写对比报告",
  "description": "看 Agent 如何搜索资料、分析数据、产出报告",
  "duration_secs": 45,
  "events": [
    {"t": 0.0, "type": "worker.started", "data": {...}},
    {"t": 1.5, "type": "worker.plan", "data": {...}},
    {"t": 3.2, "type": "worker.tool_start", "data": {"tool": "web_search", ...}},
    {"t": 6.1, "type": "worker.tool_result", "data": {...}},
    ...
  ],
  "output_files": {
    "report.md": "# AI Agent 框架对比报告\n\n...",
    "research_notes.md": "## 搜索记录\n\n..."
  }
}
```

**前端 Demo 播放器：**
- 和真实 Worker 终端共享同一套 UI 组件
- 唯一的区别：SSE 事件源换成 demo JSON 文件
- 顶部显示 "📺 Demo 模式 — 这是预录回放，不会消耗 API"
- 底部 CTA: "✨ 想试试你自己的任务？输入 API Key 开始 →"

### Git Releases 分发

**不打包 Tauri。** 太重了。用最简单的方案：

```
GitHub Releases 放 3 个东西:

1. 源码 zip（用户 git clone 也一样）
2. 一键启动脚本
   - Windows: start.bat （自动检查 Python → pip install → 启动）
   - macOS/Linux: start.sh
3. Demo session JSON 文件（内置在前端 public/ 目录中）
```

**用户安装流程（3 步）：**

```bash
# 1. 下载
git clone https://github.com/your/lifelab
cd lifelab

# 2. 安装
pip install -r requirements.txt

# 3. 启动
python backend/src/main.py
# → 打开浏览器 http://localhost:8000
# → 自动进入 Demo 模式
# → 观看 Agent 工作全过程
# → 想用自己的 → 设置页输入 API Key → 开始
```

**为什么不做 Tauri：**
- 引入 Rust 工具链——你一个人维护不了
- 打包 Python 运行时——跨平台兼容性噩梦
- 用户群已经是开发者——知道怎么 pip install
- 竞品（code agent、research agent）也都是 pip install——没人期望一个 `.exe`

### 内容传播策略

**核心理念：不是让用户"安装"。是让用户"想看，然后想试 Demo，然后想用自己的 Key"。**

**三条病毒视频：**

| # | 标题 | 内容 | 时长 | 平台 |
|---|------|------|------|------|
| 1 | "我让一个 AI Agent 帮我做了份行业调研——全过程实录" | Worker 终端录屏: 搜索→分析→自检→交付 | 90s | B站/抖音 |
| 2 | "AI 小人突然找我聊天了？！" | M11 主动搭话→跳动→横幅→对话 | 60s | 抖音/小红书 |
| 3 | "两个 AI 人格做同一件事——结果完全不同" | INTJ vs ENFP 对比产出 | 90s | B站/Twitter |

**传播链：**
```
视频发布 → 评论区置顶: "GitHub 搜 Life Lab，下载就能跑 Demo（不花钱）"
  → GitHub README: Demo GIF + 安装命令 + API Key 引导
  → 用户下载 → Demo 模式自动播放 → 被说服 → 输入 Key → 真正使用
```

### Step 103 — Demo 模式 + Git Releases

#### 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/public/demo/session-1.json` | **新建** | Demo session——预录的 worker SSE 事件流 |
| `frontend/public/demo/session-1-files/` | **新建** | Demo 产出文件（report.md 等） |
| `frontend/src/components/worker/DemoPlayer.tsx` | **新建** | Demo 播放器——读 JSON → 按时间戳逐事件渲染 |
| `frontend/src/components/worker/WorkerTerminal.tsx` | 修改 | 增加 `source: "live" | "demo"` prop——共用渲染逻辑 |
| `frontend/src/pages/WorkerBench.tsx` | 修改 | 无 Key 时自动进入 Demo 模式；增加"输入 Key 开始"入口 |
| `frontend/src/components/Onboarding.tsx` | **新建** | 首次启动引导——Demo 模式展示 + API Key 输入 |
| `scripts/record-demo.py` | **新建** | Demo 录制脚本——跑真实 Worker → 序列化事件到 JSON |
| `scripts/start.sh` / `scripts/start.bat` | **新建** | 一键启动脚本——检查依赖 + 安装 + 启动 |
| `.github/workflows/release.yml` | **新建** | GitHub Actions: push tag → 打包源码 → 发布到 Releases |
| `README.md` | 重写 | Demo GIF + 安装命令 + API Key 引导 + 视频链接 |

#### 验收标准

- [ ] 无 API Key 时 → Worker 页面自动播放 Demo session → 终端逐行渲染
- [ ] Demo 回放与真实执行视觉完全一致（打字机效果/搜索卡片/文件面板）
- [ ] Demo 顶部有 "📺 Demo 模式" 标识
- [ ] 点击 "输入 API Key 开始" → 跳转设置页 → 输入 Key → Demo 模式切换为真实模式
- [ ] `scripts/start.sh` 一键启动（python3 检查 → pip install -r requirements.txt → uvicorn）
- [ ] GitHub Releases 有源码 zip + 版本号 tag
- [ ] `scripts/record-demo.py` 可录制新的 Demo session

---

### Step 104 — 内容传播方案

#### 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `landing/index.html` | **新建** | GitHub Pages 落地页——Demo GIF + 下载按钮 + 快速开始 |
| `landing/assets/demo-worker.gif` | **新建** | Worker 终端录屏 GIF（90s 加速到 30s） |
| `landing/assets/demo-proactive.gif` | **新建** | M11 主动搭话录屏 GIF（60s） |
| `scripts/record-demo.sh` | **新建** | 自动化录屏脚本（生成 GIF） |
| `docs/social-content.md` | **新建** | 视频脚本 + 文案 + 发布时间表 |

#### 落地页（GitHub Pages，免费，不需要备案）

```
┌──────────────────────────────────────────┐
│  🧬 Life Lab                            │
│  AI Agent 不是来聊天的，是来干活的。        │
│                                          │
│  ┌──────────────────────────────────────┐│
│  │        Worker 终端录屏 GIF            ││
│  └──────────────────────────────────────┘│
│                                          │
│  [📥 下载 (GitHub Releases)]             │
│  v1.0.0 · 开源 (MIT) · 自带 Demo        │
│                                          │
│  ✨ 真实文件产出  👁️ 每步可见              │
│  🔧 CPU 就能跑  🆓 Demo 不花钱           │
│  🎮 Agent 还会主动找你聊天                │
│                                          │
│  3 步开始:                               │
│  1. git clone → 2. pip install →         │
│  3. python main.py → 打开浏览器          │
│     → Demo 模式自动开始                  │
│     → 想用自己的 → 输入 API Key          │
│                                          │
│  GitHub ⭐  |  @lifelab_dev |  文档       │
└──────────────────────────────────────────┘
```

#### 验收标准

- [ ] 落地页可通过 GitHub Pages 访问
- [ ] 录屏 GIF 清晰展示 Worker 工作过程
- [ ] 3 条视频脚本完成（含台词、时间轴）
- [ ] GitHub README 有安装命令 + Demo GIF + 视频链接

---

---

### Step T14 — 三线集成测试

| 被测模块 | 覆盖内容 |
|---------|---------|
| M11 主动搭话 | 触发频率/冷却/多 Agent 互斥/超时/对话流程 |
| M11 自动暂停 | 空闲检测/SSE 断开/Phaser 停止/EmotionEngine 停止/恢复 |
| M11 绘文字投掷 | 落地检测/Agent 反应/防连击/友尽冷却/暂停互斥 |
| M11 涂鸦指令 | 形状识别（线/圈/叉）/容错（短/乱/叠）/Agent 跟随/5s 淡出 |
| M11 对话选项 | 3 分支模板/情绪后果/选择历史→频率影响/持久化 |
| M12 工具增强 | pip install 隔离/venv 复用/Git clone 只读/引用 prompt 规范 |
| M12 展示墙 | 卡片数据完整性/飞入动画/文件预览/MD/JSON/代码渲染 |
| M10 对战 | 双 Worker 并行/实时评分/比分拉扯/结果六维对比/历史保存 |
| Demo 模式 | 回放忠实度/事件时间戳/文件产出/无 API 调用 |
| 打包 | GitHub Releases 完整性/一键脚本 Win+Mac/首次引导流程 |

---

## 附录：为什么 Demo 模式 + Git Releases 能解决推广问题

```
传统的 SaaS 推广路径（走不通）:
  云服务器 + 备案 + API 预算 → 网站上线 → 推广 → 用户注册 → 你付 API 费
  ↑ 每一步都要钱

Demo 模式 + Git Releases 路径（零成本）:
  录制 Demo session (一次性花 ¥0.05 API 费)
    → GitHub Releases 放源码 + 启动脚本
    → B站/抖音放视频 → "GitHub 搜 Life Lab，Demo 模式免费"
    → 用户 git clone → 启动 → Demo 自动播放 → 看到真实效果
    → 被说服 → 输入自己的 API Key → 真正使用
  ↑ 只花时间，不花钱

关键差异:
  - Demo 模式让用户"先看到，再掏 Key"——不是先掏 Key 再看
  - 你不需要为用户的 API 调用付费——用户用自己的 Key
  - 你不需要服务器——用户在自己电脑上跑
  - 你不需要备案——GitHub Pages 静态页面不需要
  - 打包不需要 Tauri——git clone + pip install 对目标用户（开发者）够用
```

**用户的 API 成本：DeepSeek V4 Flash ¥1/百万 token，一次 Worker 任务约 ¥0.005-0.01。一次充值 ¥10 够跑 1000 次。**

**M11 自动暂停：** 5 分钟无操作→真正停止 SSE+Phaser+EmotionEngine，不烧用户钱包。这是信任的基础——用户知道"放着不会偷偷花钱"。

---

> **最后更新:** 2026-07-31
> **维护者:** 晓音_Stingray
> **版本:** 6.0 (Plan State 6)
> **基准:** State 5 已完成（Worker 工作台 + 双轨 + 多 Agent + 管道 + 调度）
> **设计重点:** A 线让 Agent 主动社交（跳动+横幅），B 线让 Worker 对标专业 Agent（pip+Git+引用），C 线桌面端+视频传播（零成本推广）
