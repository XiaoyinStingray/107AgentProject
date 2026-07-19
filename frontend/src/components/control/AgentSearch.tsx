import { useMemo, useState } from "react";
import type { AgentSearchProps } from "../../types/control";
import { highlightMatch, searchAgents } from "../../mocks/control";
import Card from "../shared/Card";
import Badge from "../shared/Badge";
import StatusDot from "../shared/StatusDot";

/* ================================================================
   M6 控制台 — Agent 搜索 (P2)
   实时模糊匹配 name/MBTI/narrative/goals/values/background。
   ================================================================ */

export default function AgentSearch({
  agents,
  className = "",
}: AgentSearchProps) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchAgents(agents, query), [agents, query]);

  return (
    <div className={`space-y-4 ${className}`}>
      {/* 搜索框 */}
      <Card>
        <div className="flex items-center gap-3">
          <span className="text-xl select-none">🔍</span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索 Agent：姓名 / MBTI / 画像 / 目标 / 价值观 / 家乡…"
            className="flex-1 bg-bg-secondary border border-border rounded px-3 py-2 text-sm font-mono text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:border-accent-green transition-colors"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="text-xs font-mono text-text-secondary hover:text-text-primary transition-colors"
            >
              ✕ 清除
            </button>
          )}
        </div>
        <p className="text-xs font-mono text-text-secondary/60 mt-2">
          {query
            ? `匹配 ${results.length} / ${agents.length} 个 Agent`
            : `共 ${agents.length} 个 Agent——输入关键词开始搜索`}
        </p>
      </Card>

      {/* 搜索结果 */}
      {results.length === 0 ? (
        <Card>
          <p className="text-sm text-text-secondary font-mono text-center py-6">
            没有匹配「{query}」的 Agent
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {results.map((agent) => (
            <AgentResultCard key={agent.id} agent={agent} query={query} />
          ))}
        </div>
      )}
    </div>
  );
}

function AgentResultCard({
  agent,
  query,
}: {
  agent: import("../../types/agent").AgentResponse;
  query: string;
}) {
  const nameParts = highlightMatch(agent.name, query);
  const narrativeParts = highlightMatch(agent.persona.narrative, query);

  return (
    <Card hover className="space-y-3">
      {/* 头部 */}
      <div className="flex items-center gap-2">
        <div className="w-10 h-10 rounded-full bg-accent-green/10 border border-accent-green/30 flex items-center justify-center text-lg select-none shrink-0">
          {agent.name.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-mono text-sm text-text-primary">
              {nameParts.map((part, i) =>
                part.matched ? (
                  <mark
                    key={i}
                    className="bg-accent-green/30 text-accent-green rounded px-0.5"
                  >
                    {part.text}
                  </mark>
                ) : (
                  <span key={i}>{part.text}</span>
                ),
              )}
            </h3>
            <StatusDot status={agent.energy > 60 ? "active" : "idle"} label="" />
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-xs font-mono text-accent-purple/70 bg-accent-purple/10 px-1.5 py-0.5 rounded">
              {agent.persona.mbti}
            </span>
            <span className="text-xs font-mono text-text-secondary/60">
              ⚡ {agent.energy}%
            </span>
          </div>
        </div>
      </div>

      {/* 画像（高亮匹配） */}
      <p className="text-xs text-text-secondary leading-relaxed line-clamp-3">
        {narrativeParts.map((part, i) =>
          part.matched ? (
            <mark
              key={i}
              className="bg-accent-green/30 text-accent-green rounded px-0.5"
            >
              {part.text}
            </mark>
          ) : (
            <span key={i}>{part.text}</span>
          ),
        )}
      </p>

      {/* 价值观 */}
      <div className="flex flex-wrap gap-1">
        {agent.persona.values.map((v) => {
          const parts = highlightMatch(v, query);
          const isMatch = parts.some((p) => p.matched);
          return (
            <span
              key={v}
              className={`text-xs font-mono px-1.5 py-0.5 rounded border ${
                isMatch
                  ? "bg-accent-green/20 border-accent-green/40 text-accent-green"
                  : "bg-accent-blue/10 border-accent-blue/20 text-accent-blue/70"
              }`}
            >
              {v}
            </span>
          );
        })}
      </div>

      {/* 目标 */}
      {agent.goals.length > 0 && (
        <div>
          <p className="text-xs font-mono text-text-secondary/70 mb-1">🎯 目标</p>
          <ul className="space-y-0.5">
            {agent.goals.slice(0, 2).map((g) => {
              const parts = highlightMatch(g.description, query);
              const isMatch = parts.some((p) => p.matched);
              return (
                <li
                  key={g.id}
                  className="text-xs text-text-primary font-mono flex items-start gap-1"
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                      g.status === "active" ? "bg-accent-green" : "bg-text-secondary"
                    }`}
                  />
                  <span>
                    {parts.map((part, i) =>
                      part.matched ? (
                        <mark
                          key={i}
                          className="bg-accent-green/30 text-accent-green rounded px-0.5"
                        >
                          {part.text}
                        </mark>
                      ) : (
                        <span key={i}>{part.text}</span>
                      ),
                    )}
                  </span>
                  {isMatch && <Badge label="匹配" variant="P1" className="ml-1" />}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
}
