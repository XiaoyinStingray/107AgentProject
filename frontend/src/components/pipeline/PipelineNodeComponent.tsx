/**
 * PipelineNodeComponent — React Flow 自定义节点渲染。
 * 按 role 着色：analyst(紫) / writer(绿) / reviewer(琥珀) / executor(灰蓝) / worker(灰)
 */
import { Handle, Position } from "@xyflow/react";
import type { Node } from "@xyflow/react";

const ROLE_COLORS: Record<string, { border: string; bg: string; icon: string }> = {
  analyst:  { border: "#7c3aed", bg: "rgba(124,58,237,0.10)", icon: "📊" },
  writer:   { border: "#059669", bg: "rgba(5,150,105,0.10)",  icon: "✍️" },
  reviewer: { border: "#d97706", bg: "rgba(217,119,6,0.10)",  icon: "🔍" },
  executor: { border: "#4b5563", bg: "rgba(75,85,99,0.10)",   icon: "⚡" },
  worker:   { border: "#6b7280", bg: "rgba(107,114,128,0.10)", icon: "🔧" },
};

export interface PipelineNodeData {
  title: string;
  agent_id: string;
  task: string;
  role: string;
  produces: string[];
  extra_tools: string[];
  [key: string]: unknown;
}

export default function PipelineNodeComponent({ data, selected }: Node & { data: PipelineNodeData; selected?: boolean }) {
  const c = ROLE_COLORS[data.role] ?? ROLE_COLORS.worker;

  return (
    <div
      className="rounded-lg border-2 shadow-lg min-w-[160px] max-w-[200px]"
      style={{
        borderColor: selected ? "#f59e0b" : c.border,
        background: c.bg,
        boxShadow: selected ? `0 0 12px rgba(245,158,11,0.3)` : undefined,
      }}
    >
      {/* 输入桩 */}
      <Handle type="target" position={Position.Left}
        className="!w-3 !h-3 !border-2 !bg-bg-primary"
        style={{ borderColor: c.border }}
      />

      {/* 节点头部 */}
      <div className="px-3 py-2 border-b" style={{ borderColor: c.border + "40" }}>
        <div className="flex items-center gap-1.5">
          <span className="text-sm">{c.icon}</span>
          <span className="text-xs font-mono font-semibold text-text-primary truncate">
            {data.title || "未命名"}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px] font-mono px-1 rounded"
            style={{ background: c.border + "30", color: c.border }}>
            {data.role}
          </span>
          {data.extra_tools && data.extra_tools.length > 0 && (
            <span className="text-[10px] font-mono text-text-secondary/60">
              🧰 {data.extra_tools.length}
            </span>
          )}
        </div>
      </div>

      {/* 节点内容 */}
      <div className="px-3 py-1.5">
        <p className="text-[10px] font-mono text-text-secondary/70 leading-relaxed line-clamp-2">
          {data.task || "（无任务描述）"}
        </p>
        {data.produces && data.produces.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-0.5">
            {data.produces.map((f: string) => (
              <span key={f} className="text-[9px] font-mono px-1 rounded bg-bg-primary text-text-secondary/60">
                → {f}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 输出桩 */}
      <Handle type="source" position={Position.Right}
        className="!w-3 !h-3 !border-2 !bg-bg-primary"
        style={{ borderColor: c.border }}
      />
    </div>
  );
}
