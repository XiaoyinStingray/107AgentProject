/** 叠加双六边形雷达图 + 图例。Step 60 */

const DIMS = ["人格一致性", "决策质量", "交互深度", "鲁棒性", "创造力", "适应性"] as const;
const LABELS = ["一致性", "决策", "交互", "鲁棒", "创造", "适应"];

export interface OverlayHexagonProps {
  scoresA: Record<string, number>;
  scoresB: Record<string, number>;
  labelA: string;
  labelB: string;
  size?: number;
}

export default function OverlayHexagon({
  scoresA, scoresB, labelA, labelB, size = 280,
}: OverlayHexagonProps) {
  const cx = size / 2, cy = size / 2, r = size * 0.36;

  const corners = DIMS.map((_, i) => {
    const a = (Math.PI * 2 * i) / 6 - Math.PI / 2;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  });

  const polyA = corners.map((c, i) => {
    const v = (scoresA[DIMS[i]] ?? 0) / 100;
    return `${cx + (c.x - cx) * v},${cy + (c.y - cy) * v}`;
  }).join(" ");
  const polyB = corners.map((c, i) => {
    const v = (scoresB[DIMS[i]] ?? 0) / 100;
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
            className="text-xs fill-text-secondary font-mono">{LABELS[i]}</text>
        ))}
      </svg>
      <div className="flex gap-4 mt-2 text-xs font-mono">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-accent-orange/60 inline-block" /> {labelA}</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-accent-green/60 inline-block" /> {labelB}</span>
      </div>
    </div>
  );
}
