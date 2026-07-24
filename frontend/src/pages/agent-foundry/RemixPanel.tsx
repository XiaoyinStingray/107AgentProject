import { useState } from "react";

import { useAgents, useRemixAgent } from "../../api/agents";
import EmptyState from "../../components/shared/EmptyState";
import LoadingSpinner from "../../components/shared/LoadingSpinner";
import type { BigFive } from "../../types/agent";
import type {
  BigFivePatch,
  RemixField,
  RemixResponse,
  RemixSpec,
} from "../../types/remix";
import RemixControls from "./RemixControls";
import RemixPreview from "./RemixPreview";
import { DEFAULT_PRESERVE_FIELDS } from "./remixOptions";

export default function RemixPanel() {
  const { data: agents = [], isLoading, error: agentsError } = useAgents();
  const remix = useRemixAgent();
  const [selectedId, setSelectedId] = useState("");
  const [instruction, setInstruction] = useState("");
  const [traitTargets, setTraitTargets] = useState<BigFivePatch>({});
  const [preserveFields, setPreserveFields] = useState<RemixField[]>(
    DEFAULT_PRESERVE_FIELDS,
  );
  const [preview, setPreview] = useState<RemixResponse | null>(null);
  const [created, setCreated] = useState<RemixResponse | null>(null);
  const [pendingAction, setPendingAction] = useState<"preview" | "create" | null>(null);

  const effectiveId = agents.some((agent) => agent.id === selectedId)
    ? selectedId
    : agents[0]?.id ?? "";
  const source = agents.find((agent) => agent.id === effectiveId);

  const invalidatePreview = () => {
    setPreview(null);
    setCreated(null);
    remix.reset();
  };

  const buildSpec = (): RemixSpec => ({
    instruction: instruction.trim(),
    trait_targets: traitTargets,
    preserve_fields: preserveFields,
  });

  const handlePreview = async () => {
    if (!effectiveId) return;
    setPendingAction("preview");
    try {
      const result = await remix.mutateAsync({
        agentId: effectiveId,
        request: { action: "preview", spec: buildSpec(), draft: null },
      });
      setPreview(result);
      setCreated(null);
    } catch {
      setPreview(null);
    } finally {
      setPendingAction(null);
    }
  };

  const handleCreate = async () => {
    if (!effectiveId || !preview) return;
    setPendingAction("create");
    try {
      const result = await remix.mutateAsync({
        agentId: effectiveId,
        request: {
          action: "create",
          spec: preview.spec,
          draft: preview.draft,
        },
      });
      setCreated(result);
      setPreview(null);
    } catch {
      // React Query 保留 error，表单和预览不丢失，方便用户重试。
    } finally {
      setPendingAction(null);
    }
  };

  if (isLoading) return <LoadingSpinner title="正在读取 Agent…" fullscreen />;

  return (
    <div className="p-6 max-w-5xl mx-auto animate-fade-in">
      <h1 className="text-xl font-mono text-accent-green">Agent Remix</h1>
      <p className="text-sm text-text-secondary mt-1 mb-6">
        保留身份与经历，只修改你指定的特质；确认后创建独立副本。
      </p>

      {agentsError && (
        <p className="mb-4 text-sm text-accent-red">
          {(agentsError as Error).message}
        </p>
      )}
      {agents.length === 0 ? (
        <EmptyState
          title="还没有可 Remix 的 Agent"
          description="请先在自然语言创建页面生成一个 Agent。"
          tier="P2"
        />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
          <RemixControls
            agents={agents}
            selectedId={effectiveId}
            instruction={instruction}
            traitTargets={traitTargets}
            preserveFields={preserveFields}
            pending={remix.isPending}
            onSelectAgent={(id) => {
              setSelectedId(id);
              invalidatePreview();
            }}
            onInstructionChange={(value) => {
              setInstruction(value);
              invalidatePreview();
            }}
            onTraitChange={(key: keyof BigFive, value) => {
              setTraitTargets((current) => {
                const next = { ...current };
                if (value === null) delete next[key];
                else next[key] = value;
                return next;
              });
              invalidatePreview();
            }}
            onTogglePreserve={(field) => {
              if (field === "big_five" && !preserveFields.includes(field)) {
                setTraitTargets({});
              }
              setPreserveFields((current) => {
                if (current.includes(field)) {
                  return current.filter((item) => item !== field);
                }
                return [...current, field];
              });
              invalidatePreview();
            }}
            onPreview={handlePreview}
          />

          <div>
            {remix.error && (
              <p className="mb-4 p-3 rounded border border-accent-red/30 bg-accent-red/10 text-sm text-accent-red">
                {(remix.error as Error).message}
              </p>
            )}
            {created?.agent && (
              <div className="p-4 rounded border border-accent-green/30 bg-accent-green/10 text-sm text-accent-green">
                已创建副本：{created.agent.name}，新 ID 为 {created.agent.id}
              </div>
            )}
            {preview && source && (
              <RemixPreview
                source={source}
                preview={preview}
                pending={pendingAction === "create"}
                onCreate={handleCreate}
              />
            )}
            {!preview && !created && (
              <EmptyState
                title="等待生成预览"
                description="调整左侧要求后，先比较差异，再决定是否创建。"
                tier="P2"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
