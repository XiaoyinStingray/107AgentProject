import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useCreateAgent } from "../../api/agents";
import { useAgentTemplates } from "../../api/templates";
import Card from "../../components/shared/Card";
import LoadingSpinner from "../../components/shared/LoadingSpinner";

export default function TemplateBrowser() {
  const navigate = useNavigate();
  const { data: templates = [], isLoading, error } = useAgentTemplates();
  const createAgent = useCreateAgent();
  const [category, setCategory] = useState("全部");
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [createdName, setCreatedName] = useState<string | null>(null);

  const categories = useMemo(
    () => ["全部", ...Array.from(new Set(templates.map((item) => item.category)))],
    [templates],
  );
  const visibleTemplates = category === "全部"
    ? templates
    : templates.filter((template) => template.category === category);

  const handleCreate = async (templateId: string, seedPrompt: string) => {
    setCreatingId(templateId);
    setCreatedName(null);
    try {
      const agent = await createAgent.mutateAsync(seedPrompt);
      setCreatedName(agent.name);
    } catch {
      // React Query 保留 error，交给统一错误块展示。
    } finally {
      setCreatingId(null);
    }
  };

  const handleEdit = (seedPrompt: string) => {
    navigate("/agents#item-1", {
      state: { initialDescription: seedPrompt },
    });
  };

  if (isLoading) return <LoadingSpinner title="正在读取模板库…" fullscreen />;

  return (
    <div className="p-6 max-w-6xl mx-auto animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-mono text-accent-green">Agent 模板库</h1>
          <p className="text-sm text-text-secondary mt-1">
            选择描述种子，由 LLM 生成完整且独立的 Agent。
          </p>
        </div>
        <span className="text-sm font-mono text-text-secondary">
          {templates.length} 个模板
        </span>
      </div>

      {(error || createAgent.error) && (
        <p className="mb-4 p-3 rounded border border-accent-red/30 bg-accent-red/10 text-sm text-accent-red">
          {((error || createAgent.error) as Error).message}
        </p>
      )}
      {createdName && (
        <p className="mb-4 p-3 rounded border border-accent-green/30 bg-accent-green/10 text-sm text-accent-green">
          已从模板创建 Agent：{createdName}
        </p>
      )}

      <div className="flex flex-wrap gap-2 mb-5" aria-label="模板分类">
        {categories.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setCategory(item)}
            className={`px-3 py-1 rounded-full border text-sm transition-colors ${
              category === item
                ? "border-accent-green/50 bg-accent-green/10 text-accent-green"
                : "border-border text-text-secondary hover:text-text-primary"
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {visibleTemplates.map((template) => (
          <Card key={template.id} className="flex flex-col">
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-mono text-text-primary">{template.name}</h2>
              <span className="shrink-0 text-xs text-accent-purple bg-accent-purple/10 px-2 py-0.5 rounded">
                {template.category}
              </span>
            </div>
            <p className="text-sm text-text-secondary mt-2 mb-3">
              {template.summary}
            </p>
            <div className="flex flex-wrap gap-1 mb-4">
              {template.tags.map((tag) => (
                <span key={tag} className="text-xs text-text-secondary bg-bg-primary px-2 py-0.5 rounded">
                  {tag}
                </span>
              ))}
            </div>
            <div className="mt-auto grid grid-cols-2 gap-2">
              <button
                type="button"
                aria-label={`编辑模板：${template.name}`}
                onClick={() => handleEdit(template.seed_prompt)}
                disabled={createAgent.isPending}
                className="py-2 rounded text-sm font-mono bg-accent-green/10 border border-accent-green/30 text-accent-green hover:bg-accent-green/20 disabled:opacity-30 transition-colors"
              >
                编辑后创建
              </button>
              <button
                type="button"
                aria-label={`直接创建：${template.name}`}
                onClick={() => handleCreate(template.id, template.seed_prompt)}
                disabled={createAgent.isPending}
                className="py-2 rounded text-sm font-mono border border-border text-text-secondary hover:text-text-primary hover:border-accent-green/30 disabled:opacity-30 transition-colors"
              >
                {creatingId === template.id ? "正在创建…" : "直接创建"}
              </button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
