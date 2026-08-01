/**
 * ShowcaseWall — 产出纪念墙。
 *
 * 只展示已验收 + 状态为 done 的作品。
 * 每张卡片信息层次:
 *   1. 奖杯等级（按步数+文件数评 🥇🥈🥉）
 *   2. Agent 名字 + 头像色
 *   3. 任务描述
 *   4. 产出文件预览（最多 3 个）
 *   5. 关键发现（Agent 的自评亮点）
 *   6. 耗时 + 步数 + 自评星级
 *   7. 一句随机趣味标语
 */

import { useMemo, useState } from "react";
import CardFlyIn from "../components/showcase/CardFlyIn";
import { useWorkerHistory } from "../api/workers";

// ── 奖杯等级 ──
type Trophy = "🥇" | "🥈" | "🥉" | "📋";

function trophyTier(steps: number, fileCount: number): { emoji: Trophy; label: string; color: string } {
  if (steps >= 8 && fileCount >= 3) return { emoji: "🥇", label: "深度交付", color: "#FFD700" };
  if (steps >= 5 || fileCount >= 2) return { emoji: "🥈", label: "标准交付", color: "#C0C0C0" };
  if (fileCount >= 1) return { emoji: "🥉", label: "快速交付", color: "#CD7F32" };
  return { emoji: "📋", label: "基础交付", color: "#888888" };
}

// ── Agent 颜色 ──
const PALETTE = ["#5588CC","#EE8899","#DD9944","#66AA88","#8866CC","#CC6655","#5599AA","#AA77BB","#88AA55","#CC8866"];
function aColor(n: string): string { let h = 0; for (let i = 0; i < n.length; i++) h = ((h << 5) - h + n.charCodeAt(i)) | 0; return PALETTE[Math.abs(h) % PALETTE.length]; }

function fmtTime(iso: string): string {
  try { return new Date(iso).toLocaleString("zh-CN", { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" }); }
  catch { return ""; }
}
function fmtDuration(ms: number): string {
  if (!ms || ms <= 0) return "";
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(0)}秒`;
  return `${Math.floor(sec / 60)}分${(sec % 60).toFixed(0)}秒`;
}

// ── 随机趣味标语 ──
const FUN_FACTS = [
  "Agent 独立完成了这个任务，人类只负责验收 ✅",
  "这份报告，Agent 查了至少 3 个来源 🔍",
  "Agent 在交付前自检了一遍，修正了矛盾数据 🔄",
  "整个过程中，Agent 没有摸鱼（大概）🎯",
  "这份产出是 Agent 的「代表作」之一 🖼️",
  "Agent 说：为了这个任务，我思考了人生 🤔",
  "自主搜索 + 分析 + 写作，一气呵成 ⚡",
  "人类只写了一句话，Agent 干了一个小时 🕐",
  "这份文件里有 Agent 偷偷写的注释 👀",
  "如果 Agent 有简历，这会写在「项目经验」里 📝",
];

const FILE_ICONS: Record<string, string> = {
  md:"📄", txt:"📝", json:"📋", csv:"📊", py:"🐍", js:"🟨", ts:"🔷", html:"🌐", png:"🖼️", svg:"🎨",
};
function fIcon(p: string): string { return FILE_ICONS[p.split(".").pop()?.toLowerCase()??""] ?? "📎"; }

// ── 星级 ──
function stars(rating: string): string {
  const n = parseInt(rating) || 0;
  return "⭐".repeat(Math.min(5, Math.max(1, n)));
}

// ============================================================================

export default function ShowcaseWall() {
  const { data: raw = [], isLoading } = useWorkerHistory();
  const [filter, setFilter] = useState("全部");

  // 只展示已验收 + done + 非运行中
  const history = useMemo(() =>
    raw.filter((h: any) => h.accepted && h.state === "done" && !h.running),
    [raw],
  );

  const agents = useMemo(() => {
    const names = new Set(history.map((h: any) => h.agent_name));
    return ["全部", ...Array.from(names)];
  }, [history]);

  const filtered = useMemo(() => {
    let list = filter === "全部" ? [...history] : history.filter((h: any) => h.agent_name === filter);
    list.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return list;
  }, [history, filter]);

  // ── 空状态（没有已验收的作品）──
  if (!isLoading && history.length === 0) {
    return (
      <div className="h-full flex items-center justify-center animate-fade-in">
        <div className="text-center space-y-6 max-w-lg px-4">
          <div className="text-6xl">🏛️</div>
          <h1 className="text-2xl font-mono text-text-primary">Agent 纪念墙</h1>
          <p className="text-sm font-mono text-text-secondary leading-relaxed">
            这里只展示 Agent 完成并经你验收的作品。<br/>
            去 Worker 工作台给 Agent 一个任务，完成后点"认可交付"——
            那份成果就会挂上这面墙。
          </p>
          <div className="flex items-center justify-center gap-2 text-3xl opacity-25">
            <span className="animate-bounce" style={{animationDelay:"0s"}}>📄</span>
            <span className="animate-bounce" style={{animationDelay:"0.15s"}}>✅</span>
            <span className="animate-bounce" style={{animationDelay:"0.3s"}}>🏆</span>
          </div>
          <a href="/worker" className="inline-block px-6 py-3 text-sm font-mono rounded-xl
            bg-gradient-to-r from-amber-600/20 to-orange-600/20
            border border-amber-500/40 text-amber-400
            hover:from-amber-600/30 hover:to-orange-600/30
            transition-all duration-300 hover:scale-105">
            🚀 去 Worker 工作台
          </a>
        </div>
      </div>
    );
  }

  // ── 统计 ──
  const totalFiles = filtered.reduce((s: number, h: any) => s + (h.files?.length ?? 0), 0);
  const totalSteps = filtered.reduce((s: number, h: any) => s + (h.steps ?? 0), 0);
  const goldCount = filtered.filter((h: any) => trophyTier(h.steps ?? 0, h.files?.length ?? 0).emoji === "🥇").length;

  return (
    <div className="h-full overflow-y-auto animate-fade-in">
      {/* 顶部横幅 */}
      <div className="sticky top-0 z-10 bg-bg-primary/95 backdrop-blur border-b border-border">
        <div className="px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-mono text-amber-400">🏛️ Agent 纪念墙</h1>
            <p className="text-xs font-mono text-text-secondary mt-1">
              {filtered.length} 件作品 · {totalFiles} 个文件 · {totalSteps} 步 · 🥇×{goldCount}
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {agents.map((name) => (
              <button key={name} type="button" onClick={() => setFilter(name)}
                className={`px-3 py-1 text-[10px] font-mono rounded-full border transition-colors ${
                  filter === name
                    ? "border-amber-500/60 bg-amber-500/10 text-amber-400"
                    : "border-border text-text-secondary hover:border-text-secondary/40"
                }`}>
                {name === "全部" ? "🏷️ 全部" : name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 卡片墙 */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <span className="text-sm font-mono text-text-secondary animate-pulse">加载中...</span>
        </div>
      ) : (
        <div className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filtered.map((item: any, i: number) => {
              const tier = trophyTier(item.steps ?? 0, item.files?.length ?? 0);
              const funFact = FUN_FACTS[Math.abs(hashCode(item.run_id)) % FUN_FACTS.length];
              const ratingStars = stars(item.self_rating);
              const dur = fmtDuration(item.duration_ms);
              const findings: string[] = item.key_findings ?? [];

              return (
                <CardFlyIn key={item.run_id} index={i}>
                  <div className="rounded-2xl border border-border bg-gradient-to-b from-bg-secondary/90 to-bg-secondary/40
                                  hover:border-amber-500/30 hover:from-bg-secondary hover:to-bg-secondary/60
                                  transition-all duration-300 overflow-hidden group shadow-lg shadow-black/10">
                    {/* 顶部色条 + 奖杯 */}
                    <div className="relative h-2" style={{ backgroundColor: aColor(item.agent_name) }}>
                      <span className="absolute -top-2 right-3 text-xl drop-shadow-lg"
                            title={tier.label}>{tier.emoji}</span>
                    </div>

                    <div className="p-4">
                      {/* Agent 信息行 */}
                      <div className="flex items-center gap-2.5 mb-3">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0"
                             style={{ background:`linear-gradient(135deg,${aColor(item.agent_name)}22,${aColor(item.agent_name)}11)`, border:`2px solid ${aColor(item.agent_name)}44` }}>
                          🤖
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-mono text-text-primary font-semibold truncate">{item.agent_name}</p>
                          <p className="text-[10px] font-mono text-text-secondary">{fmtTime(item.created_at)}</p>
                        </div>
                        {/* 奖杯等级标签 */}
                        <span className="shrink-0 text-[9px] font-mono px-1.5 py-0.5 rounded-full border"
                              style={{ borderColor: tier.color + "44", color: tier.color, backgroundColor: tier.color + "10" }}>
                          {tier.label}
                        </span>
                      </div>

                      {/* 任务 */}
                      <p className="text-xs font-mono text-text-primary leading-relaxed mb-3 line-clamp-2 min-h-[2.5em]">
                        {item.task?.slice(0, 100)}
                      </p>

                      {/* 文件列表 */}
                      {(item.files ?? []).length > 0 && (
                        <div className="space-y-1 mb-3">
                          {(item.files ?? []).slice(0, 3).map((f: any) => (
                            <div key={f.path} className="flex items-center gap-2 text-[10px] font-mono bg-black/25 rounded-lg px-2.5 py-1.5">
                              <span className="text-sm shrink-0">{fIcon(f.path)}</span>
                              <span className="text-text-primary truncate flex-1">{f.path}</span>
                              <span className="text-text-secondary/60 shrink-0">{(f.size/1024).toFixed(1)}KB</span>
                            </div>
                          ))}
                          {(item.files ?? []).length > 3 && (
                            <p className="text-[10px] font-mono text-text-secondary/50 text-center">+{(item.files??[]).length-3} 个文件</p>
                          )}
                        </div>
                      )}

                      {/* 关键发现（Agent 自评） */}
                      {findings.length > 0 && (
                        <div className="mb-3 px-2.5 py-2 rounded-lg bg-amber-500/5 border border-amber-500/10">
                          <p className="text-[9px] font-mono text-amber-400/70 mb-1">💡 Agent 的发现</p>
                          {findings.slice(0, 2).map((f: string, j: number) => (
                            <p key={j} className="text-[10px] font-mono text-text-secondary/80 leading-relaxed line-clamp-1">
                              · {f}
                            </p>
                          ))}
                        </div>
                      )}

                      {/* 趣味标语 */}
                      <p className="text-[9px] font-mono text-text-secondary/30 italic mb-3 text-center">
                        "{funFact}"
                      </p>

                      {/* 底部统计 + 自评 + 详情 */}
                      <div className="flex items-center justify-between pt-2.5 border-t border-border/40">
                        <div className="flex items-center gap-3 text-[10px] font-mono text-text-secondary/70">
                          {dur && <span>⏱ {dur}</span>}
                          <span>📊 {item.steps ?? 0}步</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {ratingStars && (
                            <span className="text-[10px]" title={`自评: ${item.self_rating}/5`}>{ratingStars}</span>
                          )}
                          <a
                            href={`/worker?run_id=${item.run_id}`}
                            className="text-[10px] font-mono px-2 py-0.5 rounded border border-amber-500/20
                                       text-amber-400/70 hover:text-amber-400 hover:bg-amber-500/10
                                       opacity-0 group-hover:opacity-100 transition-all"
                          >
                            📋 详情
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardFlyIn>
              );
            })}
          </div>

          {/* 底部 */}
          <div className="text-center mt-12 pb-8 space-y-1">
            <p className="text-xs font-mono text-text-secondary/30">—— Agent 为你交付的每一份成果，都是协作的见证 ——</p>
            <p className="text-[10px] font-mono text-text-secondary/20">
              {history.length - filtered.length > 0 ? `另有 ${history.length - filtered.length} 件作品等待验收` : "全部作品已验收 🎉"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/** 简单字符串 hash */
function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
