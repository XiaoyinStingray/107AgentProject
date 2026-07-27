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
