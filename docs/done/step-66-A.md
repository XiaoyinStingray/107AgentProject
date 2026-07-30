# Step 66-A — Agent 情绪拟声 + 音频控制

> **日期:** 2026-07-30 | **估时:** 3h | **状态:** ✅

---

## 架构

```
对话事件 {agentId, text, emotion}
  → DialoguePlaybackQueue（全局串行单例）
    → 文本分页（标点+长度切分，不丢字）
    → AgentVoiceEngine 合成当前页拟声
    → ActionBubble 显示当前页文字
    → 页间阅读停顿 0.6-1s
    → 全部页面播完 → 下一条消息
```

## 交付模块

### 1. voiceProfiles.ts

声线生成规则（稳定 hash，同一 Agent 始终相同）：

| 参数 | 来源 |
|------|------|
| basePitch (200-380Hz) | `hash(agentId)` → 音高中心 |
| waveform | hash → sine/triangle/sawtooth/square |
| brightness (0.35-0.75) | hash → 谐波含量 |
| vibrato (2-10Hz) | hash → 颤音频率 |
| speed (0.85-1.25) | hash → 语速 |

情绪调制（叠加到 base）：

| 情绪 | 音高偏移 | 音符长度 | 间隔 | 增益 |
|------|---------|---------|------|------|
| happy | +60Hz | 0.7 | 0.5 | +0.15 |
| angry | +40Hz | 0.4 | 0.3 | +0.1 |
| sad | -30Hz | 1.6 | 0.9 | -0.15 |
| tired | -50Hz | 1.8 | 1.2 | -0.2 |
| excited | +80Hz | 0.55 | 0.4 | +0.2 |

### 2. AgentVoiceEngine

Web Audio 拟声合成：
- 主振荡器（basePitch × 语调曲线 × 情绪偏移）
- 谐波层（亮度>0.4时激活 1.5×freq 泛音）
- 颤音（LFO 调制主频）
- 标点→停顿（句号0.35s，逗号0.15s）
- 文本→音节数映射（3-20 个音符）
- 分页：标点优先切分，每页 8-18 字
- 暂停/恢复/打断支持

### 3. DialoguePlaybackQueue

全局串行队列（单例，跨 Agent）：
- `enqueue()` — 加入队尾，idle 时立即播放
- 严格串行：前一条全部分页播完 + 100ms 间隔后才消费下一条
- `pause()`/`resume()` — 场景暂停/恢复
- `clear()` — 场景切换/卸载时清空
- 音量/静音持久化到 localStorage
- `setEnabled()` — 用户点击启用后创建 AudioContext

### 4. AudioControls

React UI 组件：
- 🔊「启用声音」按钮（首次点击创建 AudioContext）
- 🔇 静音切换
- 音量滑块（0-100%），localStorage 持久化

### 5. ActionBubble.setText()

新增分页文字更新方法 — 重建气泡背景尺寸适配新文字。

## 涉及文件

| 文件 | 操作 |
|------|------|
| `frontend/src/game/audio/voiceProfiles.ts` | **新建** |
| `frontend/src/game/audio/AgentVoiceEngine.ts` | **新建** |
| `frontend/src/game/audio/DialoguePlaybackQueue.ts` | **新建** |
| `frontend/src/components/scene/AudioControls.tsx` | **新建** |
| `frontend/src/game/scenes/MapScene.ts` | 新增 queueDialogue + 暂停/恢复联动 |
| `frontend/src/pages/GameScene.tsx` | 添加 AudioControls 组件 |
| `frontend/src/game/sprites/ActionBubble.ts` | 新增 setText() 方法 |

## 验收

- [x] 串行队列：前一条完整结束后才播放下一条，无声音重叠
- [x] 文本分页：长消息按标点切分，拼接后与原始完全一致
- [x] 声线稳定：同一 Agent 始终同音高/波形
- [x] 情绪可区分：happy 高快、sad 低慢、angry 短促
- [x] 静音/音量持久化到 localStorage
- [x] 暂停/恢复不丢消息
- [x] 场景切换/卸载清空队列，无残留声音
- [x] 292 前端测试全过
