/** Agent data required to choose a local whisper target. */
export interface WhisperAgent {
  agentId: string;
  name: string;
  tileX: number;
  tileY: number;
}

export interface PendingWhisper {
  message: string;
  targetAgentId: string;
  targetName: string;
}

export interface WhisperTile {
  tileX: number;
  tileY: number;
}

const MAX_WHISPER_LENGTH = 300;
const SOCIAL_INTENT_PATTERN = /聊天|聊聊|交流|对话|谈谈|说话|讨论|打招呼|找.{0,4}人/;

/** Normalize a whisper before it enters local or Brain context. */
export function normalizeWhisper(message: string): string {
  return message.trim().slice(0, MAX_WHISPER_LENGTH);
}

/**
 * Resolve the intended conversation target.
 * An explicitly mentioned deployed name wins. Only an explicitly social but
 * unnamed instruction may fall back to the nearest Agent; environment and
 * self-directed actions must not invent a conversation target.
 */
export function resolveWhisperTarget(
  message: string,
  speakerId: string,
  agents: WhisperAgent[],
): WhisperAgent | null {
  const speaker = agents.find((agent) => agent.agentId === speakerId);
  if (!speaker) return null;

  const candidates = agents.filter((agent) => agent.agentId !== speakerId);
  const mentioned = candidates
    .filter((agent) => agent.name.length > 0 && message.includes(agent.name))
    .sort((a, b) => b.name.length - a.name.length)[0];
  if (mentioned) return mentioned;

  if (!SOCIAL_INTENT_PATTERN.test(message)) return null;

  return candidates
    .map((agent) => ({
      agent,
      distance:
        Math.abs(agent.tileX - speaker.tileX) +
        Math.abs(agent.tileY - speaker.tileY),
    }))
    .sort((a, b) => a.distance - b.distance)[0]?.agent ?? null;
}

/** Pick a free cardinal tile next to the target, closest to the speaker. */
export function chooseWhisperApproachTile(
  speaker: WhisperAgent,
  target: WhisperAgent,
  isAvailable: (tileX: number, tileY: number) => boolean,
): WhisperTile | null {
  return [
    { tileX: target.tileX - 1, tileY: target.tileY },
    { tileX: target.tileX + 1, tileY: target.tileY },
    { tileX: target.tileX, tileY: target.tileY - 1 },
    { tileX: target.tileX, tileY: target.tileY + 1 },
  ]
    .filter((tile) => isAvailable(tile.tileX, tile.tileY))
    .sort(
      (a, b) =>
        Math.abs(a.tileX - speaker.tileX) +
        Math.abs(a.tileY - speaker.tileY) -
        (Math.abs(b.tileX - speaker.tileX) +
          Math.abs(b.tileY - speaker.tileY)),
    )[0] ?? null;
}

/** Wrap user input so the LLM can distinguish an instruction from dialogue. */
export function buildWhisperContext(message: string): string {
  return `【用户只对你说的耳语指令】${normalizeWhisper(message)}`;
}
