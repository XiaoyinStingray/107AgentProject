/**
 * SettingsPage — Step 103: 用户可调参数面板。
 *
 * 8 个滑块 + 开关，改完即生效。支持恢复默认值 + 数据库管理。
 */

import { useState, useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Card from "../components/shared/Card";
import { useSettings, useUpdateSettings, useResetSettings, type UserSettingsData } from "../api/settings";
import { unlock } from "../game/achievements";

/* ── 数据库操作按钮 ── */
function DBButton({ label, desc, url, method, confirm: confirmMsg, onSuccess }: {
  label: string; desc: string; url: string; method: string; confirm: string; onSuccess?: () => void;
}) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handle = useCallback(async () => {
    if (!window.confirm(confirmMsg)) return;
    setLoading(true); setResult(null);
    try {
      const r = await fetch(url, { method });
      const d = await r.json();
      if (d.ok) {
        setResult(`✅ ${d.message || "操作成功"}`);
        // 数据库变更后刷新所有 React Query 缓存，无需手动刷新页面
        queryClient.invalidateQueries();
        onSuccess?.();
      }
      else setResult(`❌ ${d.error || "操作失败"}`);
    } catch { setResult("❌ 后端未启动"); }
    setLoading(false);
  }, [url, method, confirmMsg, onSuccess, queryClient]);

  return (
    <div className="flex flex-col gap-1">
      <button type="button" onClick={handle} disabled={loading}
        className="px-4 py-2 rounded-lg border border-red-500/20 bg-red-500/5 text-red-400 text-sm font-mono
          hover:bg-red-500/10 transition-colors disabled:opacity-50">
        {loading ? "执行中…" : label}
      </button>
      <p className="text-[10px] font-mono text-text-muted/50">{desc}</p>
      {result && <p className="text-[10px] font-mono text-text-secondary">{result}</p>}
    </div>
  );
}

/* ── 滑块定义 ── */
interface SliderDef {
  key: keyof UserSettingsData;
  label: string;
  desc: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  group: string;
}

const SLIDERS: SliderDef[] = [
  // Agent 决策
  { key: "temperature_think", label: "思考深度", desc: "低=更确定，高=更多样", min: 0.1, max: 1.5, step: 0.1, unit: "", group: "🧠 Agent 决策" },
  { key: "temperature_act", label: "执行温度", desc: "低=更精确，高=更灵活", min: 0.1, max: 1.5, step: 0.1, unit: "", group: "🧠 Agent 决策" },
  { key: "randomness_pct", label: "决策随机性", desc: "Agent 偶尔做反常选择的概率", min: 0, max: 30, step: 1, unit: "%", group: "🧠 Agent 决策" },

  // M11 场景
  { key: "proactive_chat_interval_min", label: "主动搭话频率", desc: "两次搭话之间的间隔", min: 1, max: 30, step: 1, unit: "分钟", group: "💬 M11 场景" },
  { key: "idle_pause_minutes", label: "空闲暂停时间", desc: "无交互多久后自动暂停场景", min: 1, max: 60, step: 1, unit: "分钟", group: "💬 M11 场景" },
  { key: "emotion_decay_seconds", label: "情绪衰减速度", desc: "情绪向中性回归的间隔", min: 5, max: 60, step: 5, unit: "秒", group: "💬 M11 场景" },

  // M12 Worker
  { key: "worker_max_steps", label: "最大步数", desc: "Agent 单次任务最多执行多少步", min: 5, max: 50, step: 5, unit: "步", group: "🛠️ M12 Worker" },
  { key: "worker_max_revisions", label: "自我修正次数", desc: "Agent 最多允许改几版", min: 1, max: 10, step: 1, unit: "次", group: "🛠️ M12 Worker" },
  { key: "worker_timeout_minutes", label: "超时时间", desc: "单次任务全局超时", min: 5, max: 30, step: 5, unit: "分钟", group: "🛠️ M12 Worker" },
];

const GROUPS = [...new Set(SLIDERS.map((s) => s.group))];

export default function SettingsPage() {
  const { data, isLoading, error } = useSettings();
  const update = useUpdateSettings();
  const reset = useResetSettings();
  const [local, setLocal] = useState<UserSettingsData | null>(null);
  const [saved, setSaved] = useState(false);

  // 同步远程数据到本地
  useEffect(() => {
    if (data && !local) setLocal(data);
  }, [data, local]);

  const values = local ?? data;

  const handleChange = useCallback((key: keyof UserSettingsData, value: number) => {
    setLocal((prev) => prev ? { ...prev, [key]: value } : null);
    setSaved(false);
  }, []);

  const [saveCount, setSaveCount] = useState(() => { try { const v = parseInt(localStorage.getItem("settings-save-count") || "0", 10); return isNaN(v) ? 0 : v; } catch { return 0; } });

  const handleSave = useCallback(() => {
    if (!local) return;
    update.mutate(local, {
      onSuccess: () => {
        setSaved(true);
        const next = saveCount + 1;
        setSaveCount(next);
        localStorage.setItem("settings-save-count", String(next));
        if (next >= 3) unlock("settings-master");
      },
    });
  }, [local, update, saveCount]);

  const handleResetGroup = useCallback((group: string) => {
    if (!local) return;
    const groupKeys = SLIDERS.filter((s) => s.group === group).map((s) => s.key);
    // Fix: 使用真正的硬编码默认值（与后端 UserSettings Field(default=...) 一致）
    const DEFAULTS: UserSettingsData = {
      temperature_think: 0.8, temperature_act: 0.5, randomness_pct: 5.0,
      proactive_chat_interval_min: 6, idle_pause_minutes: 5, emotion_decay_seconds: 15,
      worker_max_steps: 30, worker_max_revisions: 3, worker_timeout_minutes: 15,
    };
    const resetValues: Partial<UserSettingsData> = {};
    for (const key of groupKeys) resetValues[key] = DEFAULTS[key];
    setLocal((prev) => prev ? { ...prev, ...resetValues } : null);
    setSaved(false);
  }, [local]);

  const handleResetAll = useCallback(() => {
    reset.mutate(undefined, {
      onSuccess: (fresh) => { setLocal(fresh); setSaved(true); },
    });
  }, [reset]);

  if (isLoading) {
    return <div className="p-6 animate-fade-in"><p className="text-sm font-mono text-text-secondary">加载中…</p></div>;
  }

  if (error || !values) {
    return <div className="p-6 animate-fade-in"><p className="text-sm font-mono text-red-400">加载失败: {String(error)}</p></div>;
  }

  return (
    <div className="p-6 max-w-2xl animate-fade-in">
      <h1 className="text-2xl font-mono text-accent-green mb-1">⚙️ 参数设置</h1>
      <p className="text-sm text-text-secondary font-mono mb-6">
        拖动滑块调整参数，点击「保存」立即生效。修改持久化到磁盘。
      </p>

      <div className="space-y-6">
        {GROUPS.map((group) => {
          const groupSliders = SLIDERS.filter((s) => s.group === group);
          return (
            <Card key={group} className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-mono text-text-primary font-semibold">{group}</h2>
                <button
                  type="button"
                  onClick={() => handleResetGroup(group)}
                  className="text-[10px] font-mono text-text-secondary hover:text-accent-orange transition-colors"
                >
                  恢复此组默认
                </button>
              </div>
              <div className="space-y-4">
                {groupSliders.map((s) => {
                  const val = values[s.key] as number;
                  const pct = ((val - s.min) / (s.max - s.min)) * 100;
                  return (
                    <div key={s.key} className="flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-mono text-text-primary">{s.label}</label>
                        <span className="text-xs font-mono text-accent-green tabular-nums">
                          {s.step < 1 ? val.toFixed(1) : val}{s.unit}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={s.min}
                        max={s.max}
                        step={s.step}
                        value={val}
                        onChange={(e) => handleChange(s.key, parseFloat(e.target.value))}
                        className="w-full h-1.5 rounded-full appearance-none bg-bg-secondary cursor-pointer
                          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-green
                          [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-md"
                        style={{
                          background: `linear-gradient(to right, var(--accent-green) 0%, var(--accent-green) ${pct}%, var(--bg-secondary) ${pct}%, var(--bg-secondary) 100%)`,
                        }}
                      />
                      <p className="text-[10px] font-mono text-text-secondary/60">{s.desc}</p>
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>

      {/* 模型推荐 */}
      <Card className="p-4 mt-6 bg-gradient-to-r from-accent-green/5 to-accent-purple/5 border-accent-green/20">
        <div className="flex items-start gap-3">
          <span className="text-xl shrink-0">💡</span>
          <div>
            <h3 className="text-sm font-mono text-text-primary font-semibold">推荐模型</h3>
            <p className="text-xs font-mono text-text-secondary mt-1 leading-relaxed">
              建议在 <code className="px-1 rounded bg-bg-primary text-accent-green text-[10px]">.env</code> 中使用
              <b className="text-accent-green"> DeepSeek Chat (v3)</b> 或 <b className="text-accent-green">DeepSeek Flash</b>。
              Chat 更深思熟虑，适合 M11 场景对话；Flash 更快更便宜，适合 M12 Worker 大批量任务。
              联网搜索通过 Responses API（<code>api.deepseek.com/responses</code>，不带 /v1）自动工作。
            </p>
            <p className="text-[10px] font-mono text-text-muted/50 mt-1.5">
              配置：<code className="text-text-muted/70">LLM_BASE_URL=https://api.deepseek.com</code>
              {" "}<code className="text-text-muted/70">LLM_MODEL=deepseek-chat</code>
            </p>
          </div>
        </div>
      </Card>

      {/* 操作按钮 */}
      <div className="flex items-center gap-3 mt-6 flex-wrap">
        <button type="button" onClick={handleSave} disabled={update.isPending || saved}
          className="px-6 py-2 rounded-lg border border-accent-green/40 bg-accent-green/10 text-accent-green text-sm font-mono
            hover:bg-accent-green/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
          {update.isPending ? "保存中…" : saved ? "✓ 已保存" : "保存"}
        </button>
        <button type="button" onClick={handleResetAll} disabled={reset.isPending}
          className="px-4 py-2 rounded-lg border border-border text-text-secondary text-sm font-mono
            hover:border-text-secondary/40 transition-colors disabled:opacity-40">
          {reset.isPending ? "恢复中…" : "全部恢复默认"}
        </button>
        {update.isError && <span className="text-xs text-red-400 font-mono">保存失败: {String(update.error)}</span>}
      </div>

      {/* 数据库管理 */}
      <div className="mt-8 pt-6 border-t border-border">
        <h2 className="text-sm font-mono text-text-primary font-semibold mb-3">🗄️ 数据库管理</h2>
        <div className="flex items-center gap-3 flex-wrap">
          <DBButton label="载入预置数据" desc="用预置数据库替换当前数据（15 张表，3000+ 记录）" url="/api/seed?keep_existing=false" method="POST"
            confirm="确定要用预置数据替换当前数据库吗？当前数据将丢失。" onSuccess={() => unlock("data-steward")} />
          <DBButton label="清空数据库" desc="删除所有数据，创建空白数据库" url="/api/reset-db" method="POST"
            confirm="确定要清空所有数据吗？此操作不可撤销！" onSuccess={() => unlock("data-steward")} />
          <a href="/api/export-db" download="lifelab-backup.db"
            className="px-4 py-2 rounded-lg border border-border text-text-secondary text-sm font-mono hover:border-text-secondary/40 hover:bg-bg-primary/50 transition-colors inline-flex items-center gap-1.5">
            📥 导出数据库
          </a>
          <button type="button"
            onClick={() => { sessionStorage.setItem("forceWelcome", "1"); window.location.reload(); }}
            className="px-4 py-2 rounded-lg border border-accent-purple/30 bg-accent-purple/5 text-accent-purple text-sm font-mono
              hover:bg-accent-purple/10 transition-colors">
            🔄 重新显示新手引导
          </button>
        </div>
      </div>
    </div>
  );
}
