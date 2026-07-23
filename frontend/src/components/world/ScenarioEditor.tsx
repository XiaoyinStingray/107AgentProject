import { useState } from "react";
import { useCreateScenario } from "../../api/scenarios";
import type { ScenarioCreate } from "../../api/scenarios";
import Card from "../shared/Card";

interface ScenarioEditorProps {
  onClose: () => void;
}

const EMPTY: ScenarioCreate = {
  name: "",
  description: "",
  time_range: "1-20",
  initial_events: [""],
  environment_params: { location: "" },
};

/** 自定义场景创建表单——内联弹窗。 */
export default function ScenarioEditor({ onClose }: ScenarioEditorProps) {
  const [form, setForm] = useState<ScenarioCreate>({ ...EMPTY });
  const [error, setError] = useState<string | null>(null);
  const createScenario = useCreateScenario();

  const canSave = form.name.trim().length > 0 && !createScenario.isPending;

  const update = <K extends keyof ScenarioCreate>(
    key: K,
    value: ScenarioCreate[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    if (!canSave) return;
    setError(null);
    try {
      await createScenario.mutateAsync({
        ...form,
        initial_events: form.initial_events.filter((e) => e.trim()),
        environment_params: Object.fromEntries(
          Object.entries(form.environment_params).filter(
            ([, v]) => v.trim(),
          ),
        ),
      });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "创建失败");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <Card className="w-full max-w-lg max-h-[80vh] overflow-y-auto mx-4 p-6 space-y-4">
        <h2 className="text-sm font-mono text-text-primary">＋ 新建场景</h2>

        {/* 名称 */}
        <label className="block">
          <span className="text-xs font-mono text-text-secondary">名称 *</span>
          <input
            type="text"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="例如：考研冲刺周"
            className="w-full mt-1 rounded border border-border bg-bg-secondary px-3 py-2 text-sm font-mono text-text-primary placeholder:text-text-secondary/40 focus:border-accent-green focus:outline-none"
          />
        </label>

        {/* 描述 */}
        <label className="block">
          <span className="text-xs font-mono text-text-secondary">描述</span>
          <textarea
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
            placeholder="例如：距离考研还有一周，图书馆通宵开放……"
            rows={2}
            className="w-full mt-1 rounded border border-border bg-bg-secondary px-3 py-2 text-sm font-mono text-text-primary placeholder:text-text-secondary/40 focus:border-accent-green focus:outline-none resize-none"
          />
        </label>

        {/* 时间范围 */}
        <label className="block">
          <span className="text-xs font-mono text-text-secondary">
            时间范围
          </span>
          <input
            type="text"
            value={form.time_range}
            onChange={(e) => update("time_range", e.target.value)}
            placeholder="1-20"
            className="w-full mt-1 rounded border border-border bg-bg-secondary px-3 py-2 text-sm font-mono text-text-primary placeholder:text-text-secondary/40 focus:border-accent-green focus:outline-none"
          />
        </label>

        {/* 初始事件 */}
        <fieldset className="block">
          <legend className="text-xs font-mono text-text-secondary mb-1">
            初始事件
          </legend>
          {form.initial_events.map((event, i) => (
            <div key={i} className="flex gap-1 mb-1">
              <input
                type="text"
                value={event}
                onChange={(e) => {
                  const next = [...form.initial_events];
                  next[i] = e.target.value;
                  update("initial_events", next);
                }}
                placeholder="例如：考表公布"
                className="flex-1 rounded border border-border bg-bg-secondary px-3 py-1.5 text-sm font-mono text-text-primary placeholder:text-text-secondary/40 focus:border-accent-green focus:outline-none"
              />
              <button
                type="button"
                onClick={() =>
                  update(
                    "initial_events",
                    form.initial_events.filter((_, j) => j !== i),
                  )
                }
                className="text-xs font-mono text-accent-red/60 hover:text-accent-red px-2"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              update("initial_events", [...form.initial_events, ""])
            }
            className="text-xs font-mono text-accent-blue hover:text-accent-blue/80"
          >
            ＋ 添加事件
          </button>
        </fieldset>

        {/* 环境参数 */}
        <fieldset className="block">
          <legend className="text-xs font-mono text-text-secondary mb-1">
            环境参数
          </legend>
          {Object.entries(form.environment_params).map(([key, val], i) => (
            <div key={i} className="flex gap-1 mb-1">
              <input
                type="text"
                value={key}
                onChange={(e) => {
                  const entries = Object.entries(form.environment_params);
                  entries[i] = [e.target.value, val];
                  update("environment_params", Object.fromEntries(entries));
                }}
                placeholder="key"
                className="w-24 rounded border border-border bg-bg-secondary px-2 py-1.5 text-sm font-mono text-text-primary placeholder:text-text-secondary/40 focus:border-accent-green focus:outline-none"
              />
              <input
                type="text"
                value={val}
                onChange={(e) => {
                  const entries = Object.entries(form.environment_params);
                  entries[i] = [key, e.target.value];
                  update("environment_params", Object.fromEntries(entries));
                }}
                placeholder="value"
                className="flex-1 rounded border border-border bg-bg-secondary px-2 py-1.5 text-sm font-mono text-text-primary placeholder:text-text-secondary/40 focus:border-accent-green focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  const { [key]: _, ...rest } = form.environment_params;
                  update("environment_params", rest);
                }}
                className="text-xs font-mono text-accent-red/60 hover:text-accent-red px-2"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              update("environment_params", {
                ...form.environment_params,
                "": "",
              })
            }
            className="text-xs font-mono text-accent-blue hover:text-accent-blue/80"
          >
            ＋ 添加参数
          </button>
        </fieldset>

        {error && (
          <p className="text-xs font-mono text-accent-red">{error}</p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-mono text-text-secondary hover:text-text-primary transition-colors"
          >
            取消
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={handleSave}
            className="px-4 py-2 rounded text-xs font-mono bg-accent-green text-bg-primary hover:bg-accent-green/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {createScenario.isPending ? "保存中…" : "保存"}
          </button>
        </div>
      </Card>
    </div>
  );
}
