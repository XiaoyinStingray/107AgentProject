import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
} from "recharts";
import type { BigFive } from "../../types/agent";

interface PersonaRadarProps {
  bigFive: BigFive;
  className?: string;
}

/** 大五人格雷达图——Recharts RadarChart 封装 */
export default function PersonaRadar({
  bigFive,
  className = "",
}: PersonaRadarProps) {
  const data = [
    { dimension: "开放性", value: bigFive.openness, fullMark: 1 },
    { dimension: "尽责性", value: bigFive.conscientiousness, fullMark: 1 },
    { dimension: "外向性", value: bigFive.extraversion, fullMark: 1 },
    { dimension: "宜人性", value: bigFive.agreeableness, fullMark: 1 },
    { dimension: "神经质", value: bigFive.neuroticism, fullMark: 1 },
  ];

  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height={220}>
        <RadarChart data={data} cx="50%" cy="50%" outerRadius="70%">
          <PolarGrid stroke="#2a2a3a" />
          <PolarAngleAxis
            dataKey="dimension"
            tick={{ fill: "#8888aa", fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 1]}
            tick={{ fill: "#8888aa", fontSize: 9 }}
            axisLine={false}
          />
          <Radar
            name="大五人格"
            dataKey="value"
            stroke="#00ff88"
            fill="#00ff88"
            fillOpacity={0.15}
            strokeWidth={1.5}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
