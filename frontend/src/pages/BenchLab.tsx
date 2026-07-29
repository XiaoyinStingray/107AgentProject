import { useState } from "react";
import { useBenchRuns, useBenchRun, useCreateBenchRun, useDeleteBenchRun } from "../api/bench";
import Card from "../components/shared/Card";
import Badge from "../components/shared/Badge";
import EmptyState from "../components/shared/EmptyState";
import HexagonChart from "../components/bench/HexagonChart";
import CompareView from "../components/bench/CompareView";

export default function BenchLab() {
  const { data: runs = [] } = useBenchRuns();
  const createRun = useCreateBenchRun();
  const deleteRun = useDeleteBenchRun();

  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://api.deepseek.com");
  const [model, setModel] = useState("deepseek-v4-flash");
  const [msg, setMsg] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const { data: detail } = useBenchRun(selectedRunId);

  const [testing, setTesting] = useState(false);

  // 对比 + 盲测
  const [compareA, setCompareA] = useState<string>("");
  const [compareB, setCompareB] = useState<string>("");
  const [blindMode, setBlindMode] = useState(false);
  const [revealed, setRevealed] = useState(false);
  // 盲测时随机洗牌：X/Y 映射到实际 Run ID
  const [blindMap, setBlindMap] = useState<{ x: string; y: string } | null>(null);
  const { data: detailA } = useBenchRun((blindMode ? blindMap?.x : compareA) || null);
  const { data: detailB } = useBenchRun((blindMode ? blindMap?.y : compareB) || null);
  const doneRuns = runs.filter((r) => r.status === "done" && r.scores);

  const startBlindCompare = () => {
    const pool = doneRuns.filter((r) => r.status === "done" && r.scores);
    if (pool.length < 2) return;
    // 随机选两个不同的 Run，随机分配 X/Y
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    setBlindMap({ x: shuffled[0].id, y: shuffled[1].id });
    setBlindMode(true);
    setRevealed(false);
  };

  const handleStart = async () => {
    if (!apiKey || !baseUrl || !model) return;
    // 先测连通性
    setTesting(true); setMsg("正在测试 API 连通性…");
    try {
      const testRes = await fetch("/api/bench/test-api", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: apiKey, base_url: baseUrl, model }),
      });
      const testData = await testRes.json();
      if (!testData.ok) {
        setMsg(`API 连接失败: ${testData.error}`); setTesting(false); return;
      }
      setMsg(`API 连通 (${testData.elapsed}s) → 启动评测…`);
    } catch { setMsg("API 测试请求失败"); setTesting(false); return; }

    try {
      const result = await createRun.mutateAsync({ api_key: apiKey, base_url: baseUrl, model, name: `${model} 评测` });
      setSelectedRunId(result.id);
      setApiKey("");
      setMsg("评测已启动，后台运行中…");
    } catch { setMsg("启动失败"); }
    setTesting(false);
  };

  const selectedRun = runs.find((r) => r.id === selectedRunId);

  return (
    <div className="h-full overflow-y-auto p-6 animate-fade-in">
      <h1 className="text-2xl font-mono text-accent-orange mb-1">M10 LLM Bench</h1>
      <p className="text-sm text-text-secondary font-mono mb-6">导入大模型 → 标准化套件评测 → 六维度分析报告</p>

      {/* 配置表单 */}
      <Card className="mb-6">
        <h2 className="text-sm font-mono text-text-primary mb-3">🔧 LLM 配置</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
            placeholder="API Key" className="bg-bg-secondary border border-border rounded px-3 py-2 text-xs font-mono text-text-primary focus:outline-none focus:border-accent-orange" />
          <input type="text" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="Base URL" className="bg-bg-secondary border border-border rounded px-3 py-2 text-xs font-mono text-text-primary focus:outline-none focus:border-accent-orange" />
          <input type="text" value={model} onChange={(e) => setModel(e.target.value)}
            placeholder="Model" className="bg-bg-secondary border border-border rounded px-3 py-2 text-xs font-mono text-text-primary focus:outline-none focus:border-accent-orange" />
        </div>
        <button type="button" disabled={createRun.isPending || testing || !apiKey}
          onClick={handleStart}
          className="px-6 py-2 rounded-lg bg-accent-orange text-bg-primary font-mono text-sm hover:bg-accent-orange/90 disabled:opacity-40 transition-colors">
          {testing ? "测试中…" : createRun.isPending ? "启动中…" : "▶ 开始评测"}
        </button>
        <p className="text-xs text-text-secondary/50 font-mono mt-2">
          标准化套件：3 Agent × 3 场景 × 3 次重复 = 27 条评测 · 6 并发 · 预计 ~3 分钟
        </p>
        {msg && <p className="text-xs font-mono text-accent-green mt-2">{msg}</p>}
      </Card>

      {/* 对比 + 盲测 */}
      {doneRuns.length >= 2 && (
        <Card className="mb-6">
          <h2 className="text-sm font-mono text-text-primary mb-3">⚖️ 对比评测</h2>
          {/* 盲测模式：一键随机 */}
          <div className="mb-3">
            <button type="button" onClick={startBlindCompare}
              className="px-4 py-1.5 text-xs font-mono rounded border border-accent-orange/60 text-accent-orange hover:bg-accent-orange/10 transition-colors">
              🔒 盲测对比（随机选两个，隐藏身份）
            </button>
            {blindMode && !revealed && (
              <span className="ml-3 text-xs font-mono text-accent-orange">盲测中——身份已隐藏</span>
            )}
            {blindMode && revealed && (
              <span className="ml-3 text-xs font-mono text-accent-green">
                🔓 已揭盲：X = {detailA?.name} · Y = {detailB?.name}
              </span>
            )}
          </div>
          {/* 手动对比 */}
          <div className="flex items-center gap-2 mb-3 pt-3 border-t border-border">
            <span className="text-xs text-text-secondary/50">或手动选择：</span>
            <select value={compareA} onChange={(e) => { setCompareA(e.target.value); setBlindMode(false); setRevealed(false); }}
              className="bg-bg-secondary border border-border rounded px-2 py-1 text-xs font-mono text-text-primary">
              <option value="">Run A</option>
              {doneRuns.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <span className="text-text-secondary text-xs">vs</span>
            <select value={compareB} onChange={(e) => { setCompareB(e.target.value); setBlindMode(false); setRevealed(false); }}
              className="bg-bg-secondary border border-border rounded px-2 py-1 text-xs font-mono text-text-primary">
              <option value="">Run B</option>
              {doneRuns.filter((r) => r.id !== compareA).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          {/* 结果显示 */}
          {(blindMode || (compareA && compareB)) && detailA?.scores && detailB?.scores && (
            <div>
              {blindMode && !revealed && (
                <button type="button" onClick={() => setRevealed(true)}
                  className="mb-3 text-xs font-mono text-text-secondary hover:text-accent-green transition-colors">🔓 揭盲</button>
              )}
              <CompareView
                scoresA={detailA.scores!} scoresB={detailB.scores!}
                labelA={blindMode && !revealed ? "Model X" : detailA.name}
                labelB={blindMode && !revealed ? "Model Y" : detailB.name}
              />
            </div>
          )}
        </Card>
      )}

      {/* 结果展示 */}
      {selectedRunId && (detail || selectedRun) ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setSelectedRunId(null)} className="text-xs font-mono text-text-secondary hover:text-text-primary">← 返回列表</button>
            <h3 className="text-sm font-mono text-text-primary">{detail?.name ?? selectedRun?.name}</h3>
            <Badge label={(detail?.status ?? selectedRun?.status) === "running" ? "运行中" : detail?.status === "failed" ? "失败" : "完成"} variant={detail?.status === "done" ? "P1" : "P2"} />
            {detail && <span className="text-xs text-text-secondary/50 font-mono">{detail.completed_tasks}/{detail.total_tasks}</span>}
          </div>

          {/* 六边形图 */}
          {detail?.scores && (
            <div className="flex flex-col md:flex-row gap-6 items-start">
              <HexagonChart scores={detail.scores} size={220} />
              <div className="flex-1">
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(detail.scores).map(([k, v]) => (
                    <div key={k} className="flex justify-between text-xs font-mono">
                      <span className="text-text-secondary">{k}</span>
                      <span className={v >= 70 ? "text-accent-green" : v >= 40 ? "text-accent-orange" : "text-accent-red"}>{typeof v === 'number' ? v.toFixed(1) : v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 报告 */}
          {detail?.report && (
            <Card className="p-4">
              <div className="text-xs text-text-primary leading-relaxed whitespace-pre-wrap font-mono">{detail.report}</div>
            </Card>
          )}

          {/* 详细结果表 */}
          {detail?.results && detail.results.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono border-collapse">
                <thead>
                  <tr className="text-text-secondary/60 border-b border-border">
                    <th className="text-left py-1.5 px-2">Agent</th>
                    <th className="text-left py-1.5 px-2">场景</th>
                    <th className="text-center py-1.5 px-2">#</th>
                    <th className="text-right py-1.5 px-2">一致性</th>
                    <th className="text-right py-1.5 px-2">决策</th>
                    <th className="text-right py-1.5 px-2">交互</th>
                    <th className="text-right py-1.5 px-2">鲁棒</th>
                    <th className="text-right py-1.5 px-2">创造</th>
                    <th className="text-right py-1.5 px-2">适应</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.results.map((r) => (
                    <tr key={r.id} className="border-b border-border/30">
                      <td className="py-1 px-2">{r.agent_template}</td>
                      <td className="py-1 px-2">{r.scenario}</td>
                      <td className="text-center py-1 px-2 text-text-secondary/50">{r.repeat_index + 1}</td>
                      {r.scores && Object.keys(r.scores).length > 0 ? (
                        <>
                          <td className="text-right py-1 px-2">{r.scores["人格一致性"] ?? "-"}</td>
                          <td className="text-right py-1 px-2">{r.scores["决策质量"] ?? "-"}</td>
                          <td className="text-right py-1 px-2">{r.scores["交互深度"] ?? "-"}</td>
                          <td className="text-right py-1 px-2">{r.scores["鲁棒性"] ?? "-"}</td>
                          <td className="text-right py-1 px-2">{r.scores["创造力"] ?? "-"}</td>
                          <td className="text-right py-1 px-2">{r.scores["适应性"] ?? "-"}</td>
                        </>
                      ) : (
                        <td colSpan={6} className="text-center py-1 px-2 text-accent-red">{r.status}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div>
          <h3 className="text-sm font-mono text-text-secondary mb-3">历史评测</h3>
          {runs.length === 0 ? (
            <EmptyState title="暂无评测记录" description="配置 LLM 并开始第一次评测" />
          ) : (
            <div className="space-y-2">
              {runs.map((r) => (
                <Card key={r.id} className="p-3 flex items-center gap-3 cursor-pointer hover:border-accent-orange/30 transition-colors" onClick={() => setSelectedRunId(r.id)}>
                  <span className={r.status === "running" ? "text-accent-green animate-pulse" : r.status === "done" ? "text-accent-green" : "text-accent-red"}>●</span>
                  <div className="flex-1">
                    <p className="text-xs font-mono text-text-primary">{r.name}</p>
                    <p className="text-xs text-text-secondary/50">{r.llm_model} · {r.completed_tasks}/{r.total_tasks}</p>
                  </div>
                  <button
                    type="button"
                    disabled={r.status === "running" || deleteRun.isPending}
                    title={r.status === "running" ? "运行中的评测不可删除" : "删除评测"}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm("删除此评测?")) deleteRun.mutate(r.id);
                    }}
                    className="text-xs font-mono text-text-secondary hover:text-accent-red transition-colors mr-2 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    删除
                  </button>
                  <span className="text-xs text-text-secondary/50">
                    {r.created_at.slice(0, 16).replace("T", " ")}
                  </span>
                </Card>
              ))}
            </div>
          )}

          {/* 排行榜 */}
          {doneRuns.length >= 2 && <LeaderboardTable runs={doneRuns} />}

          {/* 趋势 */}
          {doneRuns.length >= 2 && <TrendView runs={doneRuns} />}
        </div>
      )}
    </div>
  );
}

const DIMS = ["人格一致性", "决策质量", "交互深度", "鲁棒性", "创造力", "适应性"] as const;

function avgScore(s: Record<string, number> | null) {
  if (!s) return 0;
  const vals = DIMS.map((d) => s[d] ?? 0);
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

function LeaderboardTable({ runs }: { runs: { id: string; name: string; llm_model: string; scores: Record<string, number> | null; created_at: string }[] }) {
  const [sortBy, setSortBy] = useState<string>("综合");
  const [filterModel, setFilterModel] = useState<string>("");
  const models = [...new Set(runs.map((r) => r.llm_model))];
  const filtered = runs.filter((r) => !filterModel || r.llm_model === filterModel);
  const sorted = [...filtered].sort((a, b) => (sortBy === "综合" ? avgScore(b.scores) - avgScore(a.scores) : (b.scores?.[sortBy] ?? 0) - (a.scores?.[sortBy] ?? 0)));

  return (
    <Card className="p-4 mt-6">
      <h3 className="text-sm font-mono text-text-primary mb-3">🏆 排行榜</h3>
      <div className="flex gap-2 mb-3">
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="bg-bg-secondary border border-border rounded px-2 py-1 text-xs font-mono text-text-primary">
          <option value="综合">综合分</option>
          {DIMS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={filterModel} onChange={(e) => setFilterModel(e.target.value)} className="bg-bg-secondary border border-border rounded px-2 py-1 text-xs font-mono text-text-primary">
          <option value="">全部模型</option>
          {models.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <table className="w-full text-xs font-mono">
        <thead><tr className="text-text-secondary/60 border-b border-border"><th className="text-left py-1 w-6">#</th><th className="text-left py-1">模型</th><th className="text-right py-1">综合</th>{DIMS.map((d) => <th key={d} className="text-right py-1">{d.slice(0, 2)}</th>)}</tr></thead>
        <tbody>{sorted.map((r, i) => (<tr key={r.id} className="border-b border-border/20"><td className="py-1 text-text-secondary/50">{i + 1}</td><td className="py-1">{r.name}</td><td className="py-1 text-right text-accent-orange">{avgScore(r.scores)}</td>{DIMS.map((d) => <td key={d} className="py-1 text-right">{r.scores?.[d] ?? "-"}</td>)}</tr>))}</tbody>
      </table>
    </Card>
  );
}

function TrendView({ runs }: { runs: { id: string; name: string; llm_model: string; scores: Record<string, number> | null; created_at: string }[] }) {
  const [model, setModel] = useState<string>(runs[0]?.llm_model ?? "");
  const [dim, setDim] = useState<string>("综合");
  const models = [...new Set(runs.map((r) => r.llm_model))];
  const data = runs.filter((r) => r.llm_model === model && r.scores).sort((a, b) => a.created_at.localeCompare(b.created_at)).map((r) => ({ date: r.created_at.slice(0, 10), score: dim === "综合" ? avgScore(r.scores) : (r.scores?.[dim] ?? 0) }));
  if (data.length < 2) return null;
  const maxS = Math.max(...data.map((d) => d.score), 1);
  const h = 120, w = 400, pad = 30;
  const pts = data.map((d, i) => `${pad + (i / Math.max(data.length - 1, 1)) * (w - pad * 2)},${h - pad - (d.score / maxS) * (h - pad * 2)}`).join(" ");
  const declining = data.length >= 3 && data.slice(-3).every((d, i, arr) => i === 0 || d.score < arr[i - 1].score);

  return (
    <Card className="p-4 mt-6">
      <h3 className="text-sm font-mono text-text-primary mb-3">📈 趋势</h3>
      <div className="flex gap-2 mb-3">
        <select value={model} onChange={(e) => setModel(e.target.value)} className="bg-bg-secondary border border-border rounded px-2 py-1 text-xs font-mono text-text-primary">{models.map((m) => <option key={m} value={m}>{m}</option>)}</select>
        <select value={dim} onChange={(e) => setDim(e.target.value)} className="bg-bg-secondary border border-border rounded px-2 py-1 text-xs font-mono text-text-primary"><option value="综合">综合分</option>{DIMS.map((d) => <option key={d} value={d}>{d}</option>)}</select>
      </div>
      <svg width={w} height={h} className="select-none"><polyline points={pts} fill="none" stroke="rgb(249,115,22)" strokeWidth={2} />{data.map((d, i) => (<circle key={i} cx={pad + (i / Math.max(data.length - 1, 1)) * (w - pad * 2)} cy={h - pad - (d.score / maxS) * (h - pad * 2)} r={3} fill="rgb(249,115,22)" />))}</svg>
      <div className="flex justify-between text-[10px] font-mono text-text-secondary/50 mt-1">{data.map((d, i) => <span key={i}>{d.date.slice(5)}</span>)}</div>
      {declining && <p className="text-xs font-mono text-accent-red mt-2">⚠️ {dim}连续下降，可能退化</p>}
    </Card>
  );
}


