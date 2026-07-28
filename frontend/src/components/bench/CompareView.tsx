/** 并排对比两个评测的六维分数，差异高亮。Step 58/60 */
import OverlayHexagon from "./OverlayHexagon";

const DIMS = ["人格一致性", "决策质量", "交互深度", "鲁棒性", "创造力", "适应性"];
const SHORT = ["一致性", "决策", "交互", "鲁棒", "创造", "适应"];

export interface CompareViewProps {
  scoresA: Record<string, number>;
  scoresB: Record<string, number>;
  labelA: string;
  labelB: string;
}

export default function CompareView({ scoresA, scoresB, labelA, labelB }: CompareViewProps) {
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
          {DIMS.map((d, i) => {
            const a = scoresA[d] ?? 0;
            const b = scoresB[d] ?? 0;
            const diff = a - b;
            const winner = diff > 0 ? "A" : diff < 0 ? "B" : null;
            return (
              <tr key={d} className="border-b border-border/30">
                <td className="py-1">{SHORT[i]}</td>
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
