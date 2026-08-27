/**
 * WelcomeModal — 首次使用引导。左栏 API 配置，右栏数据库选择。
 */
import { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { unlock } from "../../game/achievements";

/* ── 步骤指示器 ── */
function Step({ num, title, children }: { num: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <div className="w-5 h-5 rounded-full bg-accent-orange/15 border border-accent-orange/30 flex items-center justify-center shrink-0 mt-0.5">
        <span className="text-[10px] font-mono font-bold text-accent-orange">{num}</span>
      </div>
      <div>
        <h4 className="text-[11px] font-mono font-semibold text-text-primary">{title}</h4>
        <p className="text-[11px] font-mono text-text-secondary/80 leading-relaxed mt-0.5">{children}</p>
      </div>
    </div>
  );
}

export default function WelcomeModal() {
  const queryClient = useQueryClient();
  const [needsSetup, setNeedsSetup] = useState(false);
  const [hasKey, setHasKey] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [done, setDone] = useState(false);
  const [msg, setMsg] = useState("");

  // API 配置表单
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://api.deepseek.com");
  const [model, setModel] = useState("deepseek-v4-flash");
  const [savingKey, setSavingKey] = useState(false);
  const [keySaved, setKeySaved] = useState(false);

  useEffect(() => {
    const forceShow = sessionStorage.getItem("forceWelcome") === "1";
    if (forceShow) {
      sessionStorage.removeItem("forceWelcome");
      setNeedsSetup(true);
      setKeySaved(false);
      return;
    }
    fetch("/api/status")
      .then(r => r.json())
      .then((s: any) => {
        setHasKey(s.has_llm_key);
        // 预填已有的模型信息（不覆盖用户已输入的内容）
        if (s.llm_model && !model) setModel(s.llm_model);
        if (!s.has_llm_key || s.needs_seed) setNeedsSetup(true);
        if (s.has_llm_key) setKeySaved(true);
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 保存 API 配置
  const handleSaveKey = useCallback(async () => {
    if (!apiKey.trim()) return;
    setSavingKey(true);
    try {
      const r = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          llm_api_key: apiKey.trim(),
          llm_base_url: baseUrl.trim() || "https://api.deepseek.com",
          llm_model: model.trim() || "deepseek-v4-flash",
        }),
      });
      const d = await r.json();
      if (d.ok) { setKeySaved(true); setHasKey(true); unlock("self-starter"); }
    } catch {}
    setSavingKey(false);
  }, [apiKey, baseUrl, model]);

  // 数据库操作
  const handleSeed = useCallback(async () => {
    setSeeding(true);
    try {
      const r = await fetch("/api/seed?keep_existing=false", { method: "POST" });
      const d = await r.json();
      if (d.ok) {
        queryClient.invalidateQueries();
        setDone(true); setMsg("✅ 预置数据已就绪");
      }
      else setMsg(`❌ ${d.error}`);
    } catch { setMsg("❌ 后端未启动"); }
    setSeeding(false);
  }, [queryClient]);
  const handleFresh = useCallback(async () => {
    try {
      const r = await fetch("/api/reset-db", { method: "POST" });
      const d = await r.json();
      if (d.ok) {
        queryClient.invalidateQueries();
        setDone(true); setMsg("✅ 空白数据库已就绪");
      } else {
        setMsg(`❌ ${d.detail || "清空失败"}`);
      }
    } catch {
      setMsg("❌ 后端未启动");
    }
  }, [queryClient]);

  // toast 3 秒消失
  useEffect(() => { if (done && msg) { const t = setTimeout(() => setMsg(""), 3000); return () => clearTimeout(t); } }, [done, msg]);

  if (!needsSetup || done) {
    if (done && msg) {
      return <div className="fixed bottom-4 right-4 z-[100] animate-fade-in pointer-events-none">
        <div className="bg-bg-primary border border-accent-green/30 rounded-xl px-4 py-3 shadow-xl">
          <p className="text-sm font-mono text-accent-green">{msg}</p>
        </div>
      </div>;
    }
    return null;
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-4">
      <div className="w-[820px] max-w-[98vw] max-h-[90vh] overflow-y-auto bg-bg-primary rounded-2xl border border-border shadow-2xl">

        {/* 头部 */}
        <div className="px-6 py-4 border-b border-border bg-gradient-to-r from-accent-green/5 via-accent-orange/5 to-accent-purple/5">
          <h2 className="text-lg font-mono font-bold text-text-primary">🎉 欢迎使用人生实验室</h2>
          <p className="text-xs font-mono text-text-secondary mt-1">完成两步配置，即可开始探索</p>
        </div>

        {/* 两栏布局 */}
        <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-border">

          {/* ── 左栏：API 配置 ── */}
          <div className="flex-1 p-5 space-y-4">
            <div className="flex items-center gap-2">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono font-bold shrink-0 ${keySaved ? "bg-accent-green/20 text-accent-green border border-accent-green/40" : "bg-accent-orange/15 text-accent-orange border border-accent-orange/30"}`}>
                {keySaved ? "✓" : "1"}
              </span>
              <h3 className="text-sm font-mono font-bold text-text-primary">配置 API Key</h3>
            </div>

            {keySaved ? (
              <div className="bg-accent-green/5 border border-accent-green/20 rounded-xl p-3 space-y-2">
                <p className="text-xs font-mono text-accent-green flex items-center gap-1.5">✅ API 配置已完成</p>
                <p className="text-[10px] font-mono text-text-muted/60">模型: {model} · 端点: {baseUrl}</p>
                <button onClick={() => setKeySaved(false)}
                  className="text-[10px] font-mono text-text-muted hover:text-text-secondary transition-colors">
                  修改配置
                </button>
              </div>
            ) : (
              <>
                {/* 注册引导 */}
                <div className="space-y-2">
                  <Step num={1} title="注册并获取 Key">
                    访问{" "}
                    <a href="https://platform.deepseek.com" target="_blank" rel="noopener noreferrer" className="text-accent-green hover:underline font-semibold">platform.deepseek.com</a>
                    {" "}→ 注册 → 充值（最低 10 元）→{" "}
                    <a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noopener noreferrer" className="text-accent-green hover:underline font-semibold">API Keys</a>
                    {" "}→ 创建 Key
                  </Step>
                  <Step num={2} title="填写配置">
                    将获取的 API Key 填入下方，Base URL 和模型名已有推荐默认值。
                  </Step>
                </div>

                {/* 输入框 */}
                <div className="space-y-2">
                  <label className="block">
                    <span className="text-[10px] font-mono text-text-muted">LLM_API_KEY</span>
                    <input value={apiKey} onChange={e => setApiKey(e.target.value)}
                      placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxx"
                      className="w-full mt-0.5 px-3 py-2 text-xs font-mono bg-bg-secondary border border-border rounded-lg text-text-primary placeholder:text-text-muted/40 outline-none focus:border-accent-green/40 transition-all" />
                  </label>
                  <label className="block">
                    <span className="text-[10px] font-mono text-text-muted">LLM_BASE_URL（OpenAI 兼容地址）</span>
                    <input value={baseUrl} onChange={e => setBaseUrl(e.target.value)}
                      placeholder="https://api.deepseek.com"
                      className="w-full mt-0.5 px-3 py-2 text-xs font-mono bg-bg-secondary border border-border rounded-lg text-text-primary placeholder:text-text-muted/40 outline-none focus:border-accent-green/40 transition-all" />
                  </label>
                  <label className="block">
                    <span className="text-[10px] font-mono text-text-muted">LLM_MODEL</span>
                    <input value={model} onChange={e => setModel(e.target.value)}
                      placeholder="deepseek-v4-flash"
                      className="w-full mt-0.5 px-3 py-2 text-xs font-mono bg-bg-secondary border border-border rounded-lg text-text-primary placeholder:text-text-muted/40 outline-none focus:border-accent-green/40 transition-all" />
                  </label>
                </div>

                <button onClick={handleSaveKey} disabled={savingKey || !apiKey.trim()}
                  className="w-full py-2.5 rounded-lg bg-accent-green text-white text-sm font-mono font-semibold hover:bg-accent-green/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm">
                  {savingKey ? "保存中…" : "💾 保存配置"}
                </button>

                <p className="text-[10px] font-mono text-text-muted/50 flex items-center gap-1">
                  🔒 Key 仅储存在本地 <code className="text-text-muted/60">.env</code> 文件中，不会上传或分享。
                </p>
              </>
            )}
          </div>

          {/* ── 右栏：数据库选择 ── */}
          <div className="flex-1 p-5 space-y-4">
            <div className="flex items-center gap-2">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono font-bold shrink-0 ${keySaved ? "bg-accent-green/20 text-accent-green border border-accent-green/40" : "bg-bg-secondary text-text-muted border border-border"}`}>
                2
              </span>
              <h3 className="text-sm font-mono font-bold text-text-primary">选择数据库</h3>
            </div>

            {!keySaved && (
              <div className="bg-accent-orange/5 border border-accent-orange/20 rounded-xl p-3">
                <p className="text-xs font-mono text-accent-orange">⚠️ 请先完成左侧 API 配置</p>
              </div>
            )}

            <button onClick={handleSeed} disabled={!keySaved || seeding}
              className="w-full text-left p-4 rounded-xl border-2 border-accent-green/30 bg-accent-green/5 hover:border-accent-green/60 hover:bg-accent-green/10 transition-all group disabled:opacity-30 disabled:cursor-not-allowed">
              <div className="flex items-start gap-3">
                <span className="text-3xl shrink-0">🎭</span>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-mono font-bold text-accent-green">直接开始玩</h3>
                  <p className="text-sm font-mono text-text-secondary mt-1 leading-relaxed">载入完整预置数据——6 Agent / 23 World / 竞技/Bench/Team……</p>
                  <p className="text-xs font-mono text-text-muted/60 mt-1.5">15 张表 · 3000+ 记录 · 开箱即用</p>
                </div>
                <span className="text-accent-green text-xl shrink-0 group-hover:translate-x-1 transition-transform">→</span>
              </div>
            </button>

            <button onClick={handleFresh} disabled={!keySaved}
              className="w-full text-left p-4 rounded-xl border-2 border-border bg-bg-secondary/50 hover:border-text-secondary/40 hover:bg-bg-secondary transition-all group disabled:opacity-30 disabled:cursor-not-allowed">
              <div className="flex items-start gap-3">
                <span className="text-3xl shrink-0">🧹</span>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-mono font-bold text-text-primary">清空开始</h3>
                  <p className="text-sm font-mono text-text-secondary mt-1 leading-relaxed">空白数据库，自己创建一切</p>
                </div>
                <span className="text-text-muted/30 text-xl shrink-0 group-hover:translate-x-1 transition-transform">→</span>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
