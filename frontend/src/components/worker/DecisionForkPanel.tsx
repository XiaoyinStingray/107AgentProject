import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";

import {
  bindWorkerAgent,
  generateWorkerForkOptions,
  getWorkerDecisionLog,
  type WorkerDecisionStep,
  type WorkerForkOption,
} from "../../api/workers";


export interface ForkableWorkerRun {
  run_id: string;
  agent_name: string;
  task: string;
  running: boolean;
}

interface DecisionForkPanelProps {
  runs: ForkableWorkerRun[];
  currentRunId: string | null;
  connected: boolean;
  currentAgentId: string;
  currentAgentName: string;
  onSelectRun: (runId: string) => void;
  onFork: (runId: string, stepIndex: number, alternativeDecision: string) => void;
}

function actionLabel(step: WorkerDecisionStep) {
  if (step.action === "tool_call") return step.tool_name ? `调用 ${step.tool_name}` : "调用工具";
  if (step.action === "done") return "完成任务";
  return step.action || "继续执行";
}

export default function DecisionForkPanel({
  runs,
  currentRunId,
  connected,
  currentAgentId,
  currentAgentName,
  onSelectRun,
  onFork,
}: DecisionForkPanelProps) {
  const { hash } = useLocation();
  const [expanded, setExpanded] = useState(false);
  const [decisions, setDecisions] = useState<WorkerDecisionStep[]>([]);
  const [selectedStep, setSelectedStep] = useState<number | null>(null);
  const [options, setOptions] = useState<WorkerForkOption[]>([]);
  const [selectedOption, setSelectedOption] = useState("");
  const [customDecision, setCustomDecision] = useState("");
  const [loadingDecisions, setLoadingDecisions] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [binding, setBinding] = useState(false);
  const [decisionAgentId, setDecisionAgentId] = useState("");
  const [decisionAgentName, setDecisionAgentName] = useState("");
  const [message, setMessage] = useState("");

  const completedRuns = useMemo(() => runs.filter((run) => !run.running), [runs]);
  const selectedRunId = currentRunId && completedRuns.some((run) => run.run_id === currentRunId)
    ? currentRunId
    : completedRuns[0]?.run_id ?? "";
  const selected = decisions.find((step) => step.step_index === selectedStep);
  const finalDecision = customDecision.trim() || selectedOption;
  const needsAgentBinding = Boolean(selectedRunId && !decisionAgentId);
  const canBindCurrentAgent = Boolean(
    currentAgentId
    && currentAgentId !== "worker-default"
    && decisionAgentName
    && decisionAgentName.trim().toLocaleLowerCase() === currentAgentName.trim().toLocaleLowerCase()
  );

  useEffect(() => {
    if (hash === "#branches") setExpanded(true);
  }, [hash]);

  useEffect(() => {
    if (!selectedRunId) {
      setDecisions([]);
      setSelectedStep(null);
      setDecisionAgentId("");
      setDecisionAgentName("");
      return;
    }
    let active = true;
    setLoadingDecisions(true);
    setMessage("");
    setDecisionAgentId("");
    setDecisionAgentName("");
    getWorkerDecisionLog(selectedRunId)
      .then((log) => {
        if (!active) return;
        setDecisionAgentId(log.agent_id);
        setDecisionAgentName(log.agent_name);
        setDecisions(log.decisions);
        setSelectedStep(log.decisions[0]?.step_index ?? null);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setDecisions([]);
        setSelectedStep(null);
        setMessage(error instanceof Error ? error.message : "无法读取决策记录");
      })
      .finally(() => {
        if (active) setLoadingDecisions(false);
      });
    return () => { active = false; };
  }, [selectedRunId]);

  useEffect(() => {
    setOptions([]);
    setSelectedOption("");
    setCustomDecision("");
    setMessage("");
  }, [selectedStep]);

  const handleGenerate = async () => {
    if (!selectedRunId || selectedStep === null || needsAgentBinding) return;
    setGenerating(true);
    setMessage("");
    try {
      const nextOptions = await generateWorkerForkOptions(selectedRunId, selectedStep);
      setOptions(nextOptions);
      setSelectedOption(nextOptions[0]?.decision ?? "");
    } catch (error: unknown) {
      setOptions([]);
      setSelectedOption("");
      setMessage(error instanceof Error ? error.message : "候选路线生成失败");
    } finally {
      setGenerating(false);
    }
  };

  const handleBind = async () => {
    if (!selectedRunId || !canBindCurrentAgent) return;
    setBinding(true);
    setMessage("");
    try {
      const result = await bindWorkerAgent(selectedRunId, currentAgentId);
      setDecisionAgentId(result.agent_id);
      setDecisionAgentName(result.agent_name);
      setMessage(`已绑定到 ${result.agent_name}，现在可以生成候选路线`);
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "旧历史绑定失败");
    } finally {
      setBinding(false);
    }
  };

  return (
    <section id="section-branches" className="shrink-0 border-b border-border bg-violet-950/10">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="w-full px-4 py-2 flex items-center justify-between text-left hover:bg-violet-500/5 transition-colors"
        aria-expanded={expanded}
      >
        <span className="flex items-center gap-2">
          <span>🔀</span>
          <span className="text-xs font-mono font-semibold text-violet-300">决策分叉</span>
          <span className="text-[10px] font-mono text-text-muted">回到真实决策点，换一条路线继续执行</span>
        </span>
        <span className="text-xs text-text-muted">{expanded ? "收起 ▲" : "展开 ▼"}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 grid grid-cols-[220px_minmax(0,1fr)] gap-4">
          <div className="space-y-2">
            <label className="block text-[10px] font-mono text-text-muted">1. 选择已完成任务</label>
            <select
              value={selectedRunId}
              onChange={(event) => onSelectRun(event.target.value)}
              disabled={connected || completedRuns.length === 0}
              className="w-full bg-bg-primary border border-border rounded px-2 py-2 text-xs font-mono text-text-secondary outline-none focus:border-violet-500/50 disabled:opacity-50"
            >
              {completedRuns.length === 0 && <option value="">暂无可分叉任务</option>}
              {completedRuns.map((run) => (
                <option key={run.run_id} value={run.run_id}>
                  {run.agent_name} · {run.task.slice(0, 30)}
                </option>
              ))}
            </select>
            <p className="text-[10px] leading-relaxed font-mono text-text-muted/70">
              分叉会保留原任务；新路线单独生成一条历史，不覆盖原结果。
            </p>
          </div>

          <div className="min-w-0 space-y-3">
            {needsAgentBinding && decisionAgentName && (
              <div className="flex items-center justify-between gap-3 rounded border border-amber-600/40 bg-amber-500/10 px-3 py-2">
                <div className="min-w-0">
                  <div className="text-xs font-mono text-amber-300">这条旧历史还没有保存 Agent ID</div>
                  <p className="text-[10px] font-mono text-text-muted mt-0.5">
                    历史名称：{decisionAgentName} · 当前选择：{currentAgentName || "未选择 Agent"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleBind}
                  disabled={!canBindCurrentAgent || binding || connected}
                  className="shrink-0 px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-500 disabled:bg-bg-secondary disabled:text-text-muted text-white text-xs font-mono transition-colors"
                >
                  {binding ? "正在绑定…" : canBindCurrentAgent ? `绑定到 ${currentAgentName}` : `请先选择 ${decisionAgentName}`}
                </button>
              </div>
            )}

            <div>
              <div className="text-[10px] font-mono text-text-muted mb-1.5">2. 选择决策节点</div>
              {loadingDecisions ? (
                <div className="text-xs font-mono text-violet-300 animate-pulse">正在读取决策记录…</div>
              ) : decisions.length === 0 ? (
                <div className="text-xs font-mono text-text-muted">这条任务没有可分叉的决策；请先完成一次新的 M12 任务。</div>
              ) : (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {decisions.map((step) => (
                    <button
                      type="button"
                      key={step.step_index}
                      onClick={() => setSelectedStep(step.step_index)}
                      className={`shrink-0 px-3 py-2 rounded border text-left transition-colors ${
                        selectedStep === step.step_index
                          ? "border-violet-500/60 bg-violet-500/10"
                          : "border-border bg-bg-primary hover:border-violet-700/40"
                      }`}
                    >
                      <div className="text-[10px] font-mono text-violet-300">Step {step.step_index}</div>
                      <div className="text-[10px] font-mono text-text-secondary max-w-[150px] truncate">
                        {actionLabel(step)}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selected && (
              <div className="space-y-2">
                <div className="rounded border border-border/70 bg-bg-primary/70 px-3 py-2">
                  <div className="text-[10px] font-mono text-text-muted">原决策</div>
                  <p className="text-xs font-mono text-text-secondary mt-1 line-clamp-2">
                    {selected.reason || actionLabel(selected)}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleGenerate}
                    disabled={generating || connected || needsAgentBinding}
                    className="px-3 py-1.5 rounded bg-violet-700 hover:bg-violet-600 disabled:bg-bg-secondary disabled:text-text-muted text-white text-xs font-mono transition-colors"
                  >
                    {generating ? "正在生成…" : "✨ 生成 3 条候选路线"}
                  </button>
                  <span className="text-[10px] font-mono text-text-muted">候选由当前任务所用的同一个 Agent 生成</span>
                </div>

                {options.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {options.map((option) => (
                      <button
                        type="button"
                        key={`${option.title}-${option.decision}`}
                        onClick={() => { setSelectedOption(option.decision); setCustomDecision(""); }}
                        className={`p-2 rounded border text-left transition-colors ${
                          selectedOption === option.decision && !customDecision
                            ? "border-violet-500/60 bg-violet-500/10"
                            : "border-border bg-bg-primary hover:border-violet-700/40"
                        }`}
                      >
                        <div className="text-xs font-mono text-violet-300">{option.title}</div>
                        <p className="text-[10px] font-mono text-text-secondary mt-1 line-clamp-2">{option.decision}</p>
                        {option.rationale && (
                          <p className="text-[10px] font-mono text-text-muted mt-1 line-clamp-2">取舍：{option.rationale}</p>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <input
                    value={customDecision}
                    onChange={(event) => setCustomDecision(event.target.value)}
                    placeholder="也可以手动写一条替代决策，例如：先核验数据来源，再重写结论"
                    maxLength={500}
                    disabled={connected || needsAgentBinding}
                    className="flex-1 bg-bg-primary border border-border rounded px-3 py-2 text-xs font-mono text-text-primary placeholder-text-muted/50 outline-none focus:border-violet-500/50 disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedRunId && selectedStep !== null && finalDecision) {
                        onFork(selectedRunId, selectedStep, finalDecision);
                      }
                    }}
                    disabled={!finalDecision || connected || needsAgentBinding}
                    className="shrink-0 px-4 py-2 rounded bg-cyan-700 hover:bg-cyan-600 disabled:bg-bg-secondary disabled:text-text-muted text-white text-xs font-mono transition-colors"
                  >
                    从 Step {selectedStep ?? "?"} 分叉执行
                  </button>
                </div>
              </div>
            )}

            {message && (
              <div role="alert" className="text-[10px] font-mono text-amber-300">{message}</div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
