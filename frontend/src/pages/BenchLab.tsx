import { useState } from "react";
import { useBenchRuns, useBenchRun, useCreateBenchRun, useDeleteBenchRun } from "../api/bench";
import Card from "../components/shared/Card";
import Badge from "../components/shared/Badge";
import EmptyState from "../components/shared/EmptyState";
import HexagonChart from "../components/bench/HexagonChart";

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
                  <button onClick={(e) => { e.stopPropagation(); if(confirm("删除此评测?")) deleteRun.mutate(r.id); }} className="text-xs font-mono text-text-secondary hover:text-accent-red transition-colors mr-2">删除</button><span className="text-xs text-text-secondary/50">{r.created_at.slice(0, 16).replace("T", " ")}</span>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** 叠加双六边形雷达图 + 图例。 */
function OverlayHexagon({
  scoresA, scoresB, labelA, labelB, size = 280,
}: {
  scoresA: Record<string, number>; scoresB: Record<string, number>;
  labelA: string; labelB: string; size?: number;
}) {
  const dims = ["人格一致性", "决策质量", "交互深度", "鲁棒性", "创造力", "适应性"] as const;
  const labels = ["一致性", "决策", "交互", "鲁棒", "创造", "适应"];
  const cx = size / 2, cy = size / 2, r = size * 0.36;

  const corners = dims.map((_, i) => {
    const a = (Math.PI * 2 * i) / 6 - Math.PI / 2;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  });

  const polyA = corners.map((c, i) => {
    const v = (scoresA[dims[i]] ?? 0) / 100;
    return `${cx + (c.x - cx) * v},${cy + (c.y - cy) * v}`;
  }).join(" ");
  const polyB = corners.map((c, i) => {
    const v = (scoresB[dims[i]] ?? 0) / 100;
    return `${cx + (c.x - cx) * v},${cy + (c.y - cy) * v}`;
  }).join(" ");

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="select-none">
        {[0.25, 0.5, 0.75].map((s) => (
          <polygon key={s}
            points={corners.map((c) => `${cx + (c.x - cx) * s},${cy + (c.y - cy) * s}`).join(" ")}
            fill="none" stroke="currentColor" strokeOpacity={0.1} strokeWidth={0.5} />
        ))}
        {corners.map((c, i) => (
          <line key={i} x1={cx} y1={cy} x2={c.x} y2={c.y} stroke="currentColor" strokeOpacity={0.15} strokeWidth={0.5} />
        ))}
        <polygon points={polyA} fill="rgba(249,115,22,0.2)" stroke="rgb(249,115,22)" strokeWidth={1.5} />
        <polygon points={polyB} fill="rgba(34,197,94,0.2)" stroke="rgb(34,197,94)" strokeWidth={1.5} />
        {corners.map((c, i) => (
          <text key={i} x={c.x + (c.x - cx) * 0.18} y={c.y + (c.y - cy) * 0.18}
            textAnchor="middle" dominantBaseline="middle"
            className="text-xs fill-text-secondary font-mono">{labels[i]}</text>
        ))}
      </svg>
      <div className="flex gap-4 mt-2 text-xs font-mono">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-accent-orange/60 inline-block" /> {labelA}</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-accent-green/60 inline-block" /> {labelB}</span>
      </div>
    </div>
  );
}

/** 并排对比两个评测的六维分数，差异高亮。 */
function CompareView({
  scoresA, scoresB, labelA, labelB,
}: {
  scoresA: Record<string, number>;
  scoresB: Record<string, number>;
  labelA: string;
  labelB: string;
}) {
  const dims = ["人格一致性", "决策质量", "交互深度", "鲁棒性", "创造力", "适应性"];
  const short = ["一致性", "决策", "交互", "鲁棒", "创造", "适应"];

  return (
    <div>
      <div className="flex justify-center mb-4">
        <OverlayHexagon scoresA={scoresA} scoresB={scoresB} labelA={labelA} labelB={labelB} size={400} />
      </div>
      <table className="w-full text-xs font-mono">
        <thead>
          <tr className="text-text-secondary/60 border-b border-border">
            <th className="text-left py-1">维度</th>
            <th className="text-right py-1">{labelA}</th>
            <th className="text-right py-1">{labelB}</th>
            <th className="text-right py-1">差值</th>
          </tr>
        </thead>
        <tbody>
          {dims.map((d, i) => {
            const a = scoresA[d] ?? 0;
            const b = scoresB[d] ?? 0;
            const diff = a - b;
            const winner = diff > 0 ? "A" : diff < 0 ? "B" : null;
            return (
              <tr key={d} className="border-b border-border/30">
                <td className="py-1">{short[i]}</td>
                <td className={`text-right py-1 ${winner === "A" ? "text-accent-green" : ""}`}>{a}</td>
                <td className={`text-right py-1 ${winner === "B" ? "text-accent-green" : ""}`}>{b}</td>
                <td className={`text-right py-1 ${winner === "A" ? "text-accent-green" : winner === "B" ? "text-accent-red" : "text-text-secondary/50"}`}>
                  {diff > 0 ? "+" : ""}{diff.toFixed(1)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
