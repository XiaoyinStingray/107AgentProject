import { beforeEach, describe, expect, it } from "vitest";

import {
  createMockAgent,
  listMockAgents,
  remixMockAgent,
  resetMockAgents,
} from "./agentApi";

beforeEach(() => resetMockAgents());

describe("Step 39 mock Agent API", () => {
  it("creates Agents without network access", async () => {
    const before = await listMockAgents();
    const created = await createMockAgent("Mock 模板描述");
    const after = await listMockAgents();

    expect(created.persona.narrative).toBe("Mock 模板描述");
    expect(after).toHaveLength(before.length + 1);
  });

  it("previews without persistence and creates a fresh Remix copy", async () => {
    const source = (await listMockAgents())[0]!;
    const spec = {
      instruction: "更外向",
      trait_targets: { extraversion: 0.8 },
      preserve_fields: ["name", "background", "goals"] as const,
    };

    const preview = await remixMockAgent(source.id, {
      action: "preview",
      spec: {
        ...spec,
        preserve_fields: [...spec.preserve_fields],
      },
      draft: null,
    });
    expect((await listMockAgents())).toHaveLength(3);
    expect(preview.draft.persona.name).toBe(source.persona.name);
    expect(preview.draft.persona.big_five.extraversion).toBe(0.8);

    const created = await remixMockAgent(source.id, {
      action: "create",
      spec: preview.spec,
      draft: preview.draft,
    });
    expect(created.agent?.id).not.toBe(source.id);
    expect(created.agent?.energy).toBe(100);
    expect((await listMockAgents())).toHaveLength(4);
  });
});
