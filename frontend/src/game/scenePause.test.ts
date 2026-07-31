import { describe, expect, it, vi } from "vitest";
import { synchronizeScenePause } from "./scenePause";

function setup(paused: boolean, brainEnabled = true) {
  return {
    paused,
    scene: {
      pauseSimulation: vi.fn(),
      resumeSimulation: vi.fn(),
    },
    brainEnabled,
    worldId: brainEnabled ? "world-1" : null,
    pauseWorld: vi.fn(async () => undefined),
    resumeWorld: vi.fn(async () => undefined),
  };
}

describe("synchronizeScenePause", () => {
  it("pauses both the local scene and Brain World", async () => {
    const request = setup(false);

    await expect(synchronizeScenePause(request)).resolves.toEqual({
      paused: true,
      error: null,
    });
    expect(request.scene.pauseSimulation).toHaveBeenCalledOnce();
    expect(request.pauseWorld).toHaveBeenCalledWith("world-1");
  });

  it("rolls the local pause back when the Brain pause fails", async () => {
    const request = setup(false);
    request.pauseWorld.mockRejectedValueOnce(new Error("offline"));

    const result = await synchronizeScenePause(request);

    expect(result.paused).toBe(false);
    expect(result.error).toContain("暂停失败");
    expect(request.scene.pauseSimulation).toHaveBeenCalledOnce();
    expect(request.scene.resumeSimulation).toHaveBeenCalledOnce();
  });

  it("resumes Brain before resuming the local scene", async () => {
    const request = setup(true);

    await expect(synchronizeScenePause(request)).resolves.toEqual({
      paused: false,
      error: null,
    });
    expect(request.resumeWorld).toHaveBeenCalledWith("world-1");
    expect(request.scene.resumeSimulation).toHaveBeenCalledOnce();
  });

  it("keeps the local scene paused when Brain resume fails", async () => {
    const request = setup(true);
    request.resumeWorld.mockRejectedValueOnce(new Error("offline"));

    const result = await synchronizeScenePause(request);

    expect(result.paused).toBe(true);
    expect(result.error).toContain("恢复失败");
    expect(request.scene.resumeSimulation).not.toHaveBeenCalled();
  });

  it("controls only Phaser when Brain mode is disabled", async () => {
    const request = setup(false, false);

    const result = await synchronizeScenePause(request);

    expect(result.paused).toBe(true);
    expect(request.pauseWorld).not.toHaveBeenCalled();
    expect(request.scene.pauseSimulation).toHaveBeenCalledOnce();
  });
});
