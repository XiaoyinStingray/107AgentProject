/**
 * WelcomeModal — 首次使用引导。
 * 一个清晰的二选一：直接玩（预置数据）或清空开始。
 */
import { useState, useEffect, useCallback } from "react";

export default function WelcomeModal() {
  const [needsSetup, setNeedsSetup] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [done, setDone] = useState(false);
  const [msg, setMsg] = useState("");
  const [hasKey, setHasKey] = useState(true);

  useEffect(() => {
    // 检查是否被强制呼出（Settings 里清除标记后触发）
    const forceShow = sessionStorage.getItem("forceWelcome") === "1";
    if (forceShow) {
      sessionStorage.removeItem("forceWelcome");
      setNeedsSetup(true);
      return;
    }
    fetch("/api/status")
      .then(r => r.json())
      .then((s: any) => {
        setHasKey(s.has_llm_key);
        if (!s.has_llm_key || s.needs_seed) setNeedsSetup(true);
      })
      .catch(() => {});
  }, []);

  const handleSeed = useCallback(async () => {
    setSeeding(true);
    try {
      const r = await fetch("/api/seed?keep_existing=false", { method: "POST" });
      const d = await r.json();
      if (d.ok) {
        setDone(true);
        setMsg(`✅ 预置数据已就绪（${d.mode === "replace" ? "15 张表，3000+ 条记录" : ""}）`);
      } else {
        setMsg(`❌ ${d.error}`);
      }
    } catch { setMsg("❌ 后端未启动，请先运行 python run.py"); }
    setSeeding(false);
  }, []);

  const handleFresh = useCallback(() => {
    setDone(true);
    setMsg("✅ 空白数据库已就绪，从零开始创建一切吧");
  }, []);

  // toast 3 秒后自动消失
  useEffect(() => { if (done && msg) { const t = setTimeout(() => setMsg(""), 3000); return () => clearTimeout(t); } }, [done, msg]);

  if (!needsSetup || done) {
    if (done && msg) {
      return (
        <div className="fixed bottom-4 right-4 z-[100] animate-fade-in pointer-events-none">
          <div className="bg-bg-primary border border-accent-green/30 rounded-xl px-4 py-3 shadow-xl">
            <p className="text-sm font-mono text-accent-green">{msg}</p>
          </div>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="w-[520px] max-w-[95vw] bg-bg-primary rounded-2xl border border-border shadow-2xl overflow-hidden">

        {/* 头部 */}
        <div className="px-6 py-5 border-b border-border bg-gradient-to-r from-accent-green/5 to-accent-purple/5">
          <h2 className="text-xl font-mono font-bold text-text-primary">🎉 欢迎使用人生实验室</h2>
          <p className="text-sm font-mono text-text-secondary mt-2 leading-relaxed">
            检测到这是你第一次使用。请选择启动方式：
          </p>
        </div>

        <div className="px-6 py-5 space-y-3">
          {/* Option 1: Pre-seeded */}
          <button
            onClick={handleSeed}
            disabled={seeding}
            className="w-full text-left p-4 rounded-xl border-2 border-accent-green/30 bg-accent-green/5 hover:border-accent-green/60 hover:bg-accent-green/10 transition-all group disabled:opacity-50"
          >
            <div className="flex items-start gap-3">
              <span className="text-3xl shrink-0">🎭</span>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-mono font-bold text-accent-green group-hover:scale-[1.02] transition-transform">
                  直接开始玩
                </h3>
                <p className="text-sm font-mono text-text-secondary mt-1 leading-relaxed">
                  载入完整的预置数据——6 个性格各异的 Agent、23 个世界、竞技记录、团队协作、Bench 评测结果、管线模板……
                </p>
                <p className="text-xs font-mono text-text-muted/60 mt-2">
                  15 张数据表 · 3000+ 条记录 · 开箱即用
                </p>
              </div>
              <span className="text-accent-green text-xl shrink-0 group-hover:translate-x-1 transition-transform">→</span>
            </div>
          </button>

          {/* Option 2: Fresh start */}
          <button
            onClick={handleFresh}
            className="w-full text-left p-4 rounded-xl border-2 border-border bg-bg-secondary/50 hover:border-text-secondary/40 hover:bg-bg-secondary transition-all group"
          >
            <div className="flex items-start gap-3">
              <span className="text-3xl shrink-0">🧹</span>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-mono font-bold text-text-primary group-hover:scale-[1.02] transition-transform">
                  清空开始
                </h3>
                <p className="text-sm font-mono text-text-secondary mt-1 leading-relaxed">
                  从空白数据库开始，自己创建每一个 Agent，搭建每一个世界。就像第一天打开这个项目一样。
                </p>
              </div>
              <span className="text-text-muted/30 text-xl shrink-0 group-hover:translate-x-1 transition-transform">→</span>
            </div>
          </button>

          {/* API Key warning */}
          {!hasKey && (
            <div className="bg-accent-orange/5 border border-accent-orange/20 rounded-xl p-3">
              <p className="text-xs font-mono text-accent-orange leading-relaxed">
                ⚠️ 未检测到 LLM API Key。请编辑项目根目录的 <code className="px-1 py-0.5 rounded bg-accent-orange/10 text-accent-orange">.env</code> 文件，填入
                <code className="px-1 py-0.5 rounded bg-accent-orange/10 text-accent-orange">LLM_API_KEY</code>。
                Key 仅储存在本地，不会上传或分享。
              </p>
              <a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noopener noreferrer"
                className="inline-block mt-2 text-xs font-mono text-accent-green hover:underline">
                获取 DeepSeek Key →
              </a>
            </div>
          )}
        </div>

        {/* 加载状态 */}
        {seeding && (
          <div className="px-6 pb-4">
            <div className="flex items-center gap-2 text-sm font-mono text-text-secondary">
              <span className="animate-spin">⏳</span> 正在载入预置数据…
            </div>
          </div>
        )}

        {msg && !done && (
          <div className="px-6 pb-4">
            <p className="text-xs font-mono text-red-400">{msg}</p>
          </div>
        )}
      </div>
    </div>
  );
}
