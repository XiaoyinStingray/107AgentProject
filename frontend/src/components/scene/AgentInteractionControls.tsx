import { useEffect, useMemo, useState } from "react";
import { ListChecks, MessageCircle, Send } from "lucide-react";
import type { AgentSpriteData } from "../../game/sprites/AgentSprite";
import {
  localCommandNeedsMessage,
  localCommandNeedsTarget,
  type LocalAgentCommand,
  type LocalCommandType,
} from "../../game/whisper";

interface Props {
  agent: AgentSpriteData;
  availableAgents: AgentSpriteData[];
  brainEnabled: boolean;
  brainPending?: boolean;
  onWhisper?: (message: string) => void;
  onTalk?: (message: string) => void;
  onLocalCommand?: (command: LocalAgentCommand) => void;
}

const COMMAND_OPTIONS: Array<{ value: LocalCommandType; label: string }> = [
  { value: "talk", label: "对话" },
  { value: "move", label: "移动" },
  { value: "move_then_talk", label: "移动后对话" },
  { value: "observe", label: "观察周围" },
  { value: "wait", label: "原地等待" },
  { value: "end_dialogue", label: "结束对话" },
  { value: "cancel", label: "取消指令" },
];

export default function AgentInteractionControls({
  agent,
  availableAgents,
  brainEnabled,
  brainPending = false,
  onWhisper,
  onTalk,
  onLocalCommand,
}: Props) {
  const [mode, setMode] = useState<"talk" | "command">("talk");
  const [freeText, setFreeText] = useState("");
  const [commandType, setCommandType] = useState<LocalCommandType>("talk");
  const [targetAgentId, setTargetAgentId] = useState("");
  const [commandMessage, setCommandMessage] = useState("");
  const targets = useMemo(
    () => availableAgents.filter((candidate) => candidate.agentId !== agent.agentId),
    [agent.agentId, availableAgents],
  );

  useEffect(() => {
    setMode("talk");
    setFreeText("");
    setCommandMessage("");
  }, [agent.agentId]);

  useEffect(() => {
    if (!targets.some((target) => target.agentId === targetAgentId)) {
      setTargetAgentId(targets[0]?.agentId ?? "");
    }
  }, [targetAgentId, targets]);

  const submitFreeText = () => {
    if (brainPending) return;
    const message = freeText.trim();
    if (!message) return;
    if (brainEnabled) {
      onWhisper?.(message);
    } else {
      onTalk?.(message);
    }
    setFreeText("");
  };

  const submitCommand = () => {
    if (brainPending) return;
    const command = buildCommand(
      commandType,
      agent.agentId,
      targetAgentId,
      commandMessage,
    );
    if (!command) return;
    onLocalCommand?.(command);
    setCommandMessage("");
  };

  if (brainEnabled || brainPending) {
    return (
      <div className="px-4 py-3 border-t border-border space-y-1.5">
        <p className="text-[10px] font-mono text-text-secondary">
          {brainPending ? "正在连接 AI 世界" : "AI 自由指令"}
        </p>
        <InputWithSend
          value={freeText}
          placeholder={`告诉 ${agent.name} 要做什么…`}
          buttonLabel="发送 AI 指令"
          disabled={brainPending}
          onChange={setFreeText}
          onSubmit={submitFreeText}
        />
      </div>
    );
  }

  return (
    <div className="px-4 py-3 border-t border-border space-y-3">
      <div className="grid grid-cols-2 gap-1 rounded bg-bg-primary p-1">
        <ModeButton
          active={mode === "talk"}
          label="和 TA 说话"
          icon={<MessageCircle size={13} />}
          onClick={() => setMode("talk")}
        />
        <ModeButton
          active={mode === "command"}
          label="给 TA 指令"
          icon={<ListChecks size={13} />}
          onClick={() => setMode("command")}
        />
      </div>

      {mode === "talk" ? (
        <div>
          <InputWithSend
            value={freeText}
            placeholder={`对 ${agent.name} 说…`}
            buttonLabel="发送给 Agent"
            onChange={setFreeText}
            onSubmit={submitFreeText}
          />
        </div>
      ) : (
        <CommandForm
          commandType={commandType}
          targetAgentId={targetAgentId}
          commandMessage={commandMessage}
          targets={targets}
          onTypeChange={setCommandType}
          onTargetChange={setTargetAgentId}
          onMessageChange={setCommandMessage}
          onSubmit={submitCommand}
        />
      )}
    </div>
  );
}

function buildCommand(
  type: LocalCommandType,
  actorAgentId: string,
  targetAgentId: string,
  rawMessage: string,
): LocalAgentCommand | null {
  const message = rawMessage.trim();
  if (type === "talk" || type === "move_then_talk") {
    if (!targetAgentId || !message) return null;
    return { type, actorAgentId, targetAgentId, message };
  }
  if (type === "move") {
    return targetAgentId ? { type, actorAgentId, targetAgentId } : null;
  }
  return { type, actorAgentId };
}

function CommandForm({
  commandType,
  targetAgentId,
  commandMessage,
  targets,
  onTypeChange,
  onTargetChange,
  onMessageChange,
  onSubmit,
}: {
  commandType: LocalCommandType;
  targetAgentId: string;
  commandMessage: string;
  targets: AgentSpriteData[];
  onTypeChange: (type: LocalCommandType) => void;
  onTargetChange: (agentId: string) => void;
  onMessageChange: (message: string) => void;
  onSubmit: () => void;
}) {
  const disabled =
    (localCommandNeedsTarget(commandType) && !targetAgentId) ||
    (localCommandNeedsMessage(commandType) && !commandMessage.trim());
  return (
    <div className="space-y-2">
      <select
        aria-label="指令类型"
        value={commandType}
        onChange={(event) => onTypeChange(event.target.value as LocalCommandType)}
        className="w-full bg-bg-primary border border-border rounded px-2 py-1.5 text-[11px] font-mono text-text-primary focus:outline-none focus:border-accent-orange/50"
      >
        {COMMAND_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      {localCommandNeedsTarget(commandType) && (
        <select
          aria-label="目标 Agent"
          value={targetAgentId}
          onChange={(event) => onTargetChange(event.target.value)}
          className="w-full bg-bg-primary border border-border rounded px-2 py-1.5 text-[11px] font-mono text-text-primary focus:outline-none focus:border-accent-orange/50"
        >
          {targets.map((target) => (
            <option key={target.agentId} value={target.agentId}>{target.name}</option>
          ))}
        </select>
      )}
      {localCommandNeedsMessage(commandType) && (
        <input
          type="text"
          aria-label="说话内容"
          value={commandMessage}
          onChange={(event) => onMessageChange(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") onSubmit(); }}
          placeholder="输入要说的话…"
          className="w-full bg-bg-primary border border-border rounded px-2 py-1.5 text-[11px] font-mono text-text-primary placeholder-text-secondary/40 focus:outline-none focus:border-accent-orange/50"
        />
      )}
      <button
        type="button"
        onClick={onSubmit}
        disabled={disabled}
        className="w-full py-1.5 text-[11px] font-mono rounded bg-accent-orange/20 text-accent-orange border border-accent-orange/40 hover:bg-accent-orange/30 disabled:opacity-30 transition-colors"
      >
        执行指令
      </button>
    </div>
  );
}

function ModeButton({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-7 flex items-center justify-center gap-1 rounded text-[10px] font-mono transition-colors ${
        active
          ? "bg-bg-secondary text-accent-orange"
          : "text-text-secondary hover:text-text-primary"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function InputWithSend({
  value,
  placeholder,
  buttonLabel,
  disabled = false,
  onChange,
  onSubmit,
}: {
  value: string;
  placeholder: string;
  buttonLabel: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="flex gap-1.5">
      <input
        type="text"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter") onSubmit(); }}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-bg-primary border border-border rounded px-2 py-1.5 text-[11px] font-mono text-text-primary placeholder-text-secondary/40 focus:outline-none focus:border-accent-orange/50"
      />
      <button
        type="button"
        onClick={onSubmit}
        disabled={disabled || !value.trim()}
        aria-label={buttonLabel}
        title={buttonLabel}
        className="w-8 h-8 flex items-center justify-center rounded bg-accent-orange/20 text-accent-orange border border-accent-orange/40 hover:bg-accent-orange/30 disabled:opacity-30 transition-colors"
      >
        <Send size={14} />
      </button>
    </div>
  );
}
