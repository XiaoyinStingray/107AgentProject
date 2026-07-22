import { useEffect, useState } from "react";
import type { AgentResponse } from "../../types/agent";
import type { RelationshipState } from "../../types/relationships";
import Card from "../shared/Card";
import RelationshipGraphCanvas from "./RelationshipGraphCanvas";
import { relationshipPairKey } from "./relationshipGraphLayout";

interface RelationshipGraphProps {
  agents: AgentResponse[];
  relationships: RelationshipState[];
  lastRelationshipKey?: string | null;
  className?: string;
}

/** Render a relationship snapshot supplied by the page/store data pipeline. */
export default function RelationshipGraph({
  agents,
  relationships,
  lastRelationshipKey = null,
  className = "",
}: RelationshipGraphProps) {
  const [highlightedPairKey, setHighlightedPairKey] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (!lastRelationshipKey) return;
    const [source, target] = lastRelationshipKey.split("::");
    if (!source || !target) return;
    setHighlightedPairKey(relationshipPairKey(source, target));
    const timer = window.setTimeout(() => setHighlightedPairKey(null), 1200);
    return () => window.clearTimeout(timer);
  }, [lastRelationshipKey]);

  if (agents.length < 2) {
    return (
      <Card className={`flex items-center justify-center ${className}`}>
        <p className="text-sm text-text-secondary font-mono">
          需要至少 2 个 Agent 才能展示关系网络
        </p>
      </Card>
    );
  }

  return (
    <Card className={`flex flex-col ${className}`}>
      <div className="px-4 py-3 border-b border-border -mx-5 -mt-5 mb-3">
        <h2 className="font-mono text-sm text-text-primary">
          RELATIONSHIP MAP
        </h2>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center">
        <RelationshipGraphCanvas
          agents={agents}
          relationships={relationships}
          highlightedPairKey={highlightedPairKey}
        />
      </div>
      <div className="flex items-center justify-center gap-4 mt-3 pt-3 border-t border-border">
        <LegendItem color="#00ff88" label="友好" />
        <LegendItem color="#8888aa" label="中立" />
        <LegendItem color="#ff4466" label="敌对" />
      </div>
    </Card>
  );
}

interface LegendItemProps {
  color: string;
  label: string;
}

function LegendItem({ color, label }: LegendItemProps) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="w-4 h-0.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="text-xs font-mono text-text-secondary">{label}</span>
    </div>
  );
}
