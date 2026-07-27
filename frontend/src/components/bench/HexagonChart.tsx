/** SVG 六边形雷达图——展示六维评测分数。 */
interface Props {
  scores: Record<string, number>;
  size?: number;
}

const DIMS = ["人格一致性", "决策质量", "交互深度", "鲁棒性", "创造力", "适应性"] as const;
const LABELS = ["一致性", "决策", "交互", "鲁棒", "创造", "适应"];

export default function HexagonChart({ scores, size = 200 }: Props) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.38;

  const points = DIMS.map((_, i) => {
    const angle = (Math.PI * 2 * i) / 6 - Math.PI / 2;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  });

  const scorePoints = DIMS.map((d, i) => {
    const val = (scores[d] ?? 0) / 100;
    return {
      x: cx + r * val * Math.cos((Math.PI * 2 * i) / 6 - Math.PI / 2),
      y: cy + r * val * Math.sin((Math.PI * 2 * i) / 6 - Math.PI / 2),
    };
  });

  const bgPoly = points.map((p) => `${p.x},${p.y}`).join(" ");
  const scorePoly = scorePoints.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="mx-auto select-none">
      {/* 背景网格 */}
      {[0.25, 0.5, 0.75].map((scale) => (
        <polygon
          key={scale}
          points={points.map((p) => `${cx + (p.x - cx) * scale},${cy + (p.y - cy) * scale}`).join(" ")}
          fill="none" stroke="currentColor" strokeOpacity={0.15} strokeWidth={0.5}
        />
      ))}
      {/* 轴线 */}
      {points.map((p, i) => (
        <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="currentColor" strokeOpacity={0.2} strokeWidth={0.5} />
      ))}
      {/* 分数区域 */}
      <polygon points={scorePoly} fill="rgba(249,115,22,0.25)" stroke="rgb(249,115,22)" strokeWidth={1.5} />
      {/* 分数点 */}
      {scorePoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={2.5} fill="rgb(249,115,22)" />
      ))}
      {/* 标签 */}
      {points.map((p, i) => (
        <text
          key={i}
          x={p.x + (p.x - cx) * 0.18}
          y={p.y + (p.y - cy) * 0.18}
          textAnchor="middle"
          dominantBaseline="middle"
          className="text-[9px] fill-text-secondary font-mono"
        >
          {LABELS[i]}
        </text>
      ))}
      {/* 中心分数 */}
      <text x={cx} y={cy - 4} textAnchor="middle" className="text-xs fill-accent-orange font-mono">
        {Math.round(Object.values(scores).reduce((a, b) => a + b, 0) / 6)}分
      </text>
    </svg>
  );
}
