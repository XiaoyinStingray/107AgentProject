import type { ArenaMode } from "../../types/arena";
import Card from "../shared/Card";

interface ArenaTopicPickerProps {
  mode: ArenaMode;
  topic: string;
  presets: string[];
  onChange: (topic: string) => void;
}

/** 模式相关的预设主题与自定义输入。 */
export default function ArenaTopicPicker({
  mode,
  topic,
  presets,
  onChange,
}: ArenaTopicPickerProps) {
  return (
    <Card>
      <h2 className="text-sm font-mono text-text-secondary">竞技主题</h2>
      <div className="flex flex-wrap gap-2 mt-3" aria-label="预设竞技主题">
        {presets.map((preset) => (
          <button
            key={preset}
            type="button"
            aria-pressed={topic === preset}
            onClick={() => onChange(preset)}
            className={`rounded border px-3 py-2 text-left text-xs font-mono transition-colors ${
              topic === preset
                ? "border-accent-blue/60 bg-accent-blue/10 text-accent-blue"
                : "border-border bg-bg-secondary text-text-secondary hover:border-accent-blue/30"
            }`}
          >
            {preset}
          </button>
        ))}
      </div>
      <label htmlFor="arena-topic" className="block text-xs font-mono text-text-secondary mt-4">
        竞技主题
      </label>
      <input
        id="arena-topic"
        type="text"
        value={topic}
        onChange={(event) => onChange(event.target.value)}
        className="w-full mt-2 rounded border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary font-mono placeholder:text-text-secondary/50 focus:border-accent-orange focus:outline-none"
        placeholder={`输入${mode === "debate" ? "辩题" : mode === "interview" ? "岗位" : "路演方向"}`}
      />
      <p className="text-xs text-text-secondary mt-2">
        固定三轮，每个 Agent 每轮发言一次。
      </p>
    </Card>
  );
}
