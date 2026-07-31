export interface PausableScene {
  pauseSimulation: () => void;
  resumeSimulation: () => void;
}

interface ScenePauseRequest {
  paused: boolean;
  scene: PausableScene;
  brainEnabled: boolean;
  worldId: string | null;
  pauseWorld: (worldId: string) => Promise<unknown>;
  resumeWorld: (worldId: string) => Promise<unknown>;
}

export interface ScenePauseResult {
  paused: boolean;
  error: string | null;
}

/** Keep Phaser and the optional Brain World on the same pause state. */
export async function synchronizeScenePause(
  request: ScenePauseRequest,
): Promise<ScenePauseResult> {
  const hasBrain = request.brainEnabled && Boolean(request.worldId);

  if (request.paused) {
    if (hasBrain) {
      try {
        await request.resumeWorld(request.worldId!);
      } catch {
        return { paused: true, error: "AI 世界恢复失败，场景仍保持暂停" };
      }
    }
    request.scene.resumeSimulation();
    return { paused: false, error: null };
  }

  request.scene.pauseSimulation();
  if (hasBrain) {
    try {
      await request.pauseWorld(request.worldId!);
    } catch {
      request.scene.resumeSimulation();
      return { paused: false, error: "AI 世界暂停失败，已恢复本地场景" };
    }
  }
  return { paused: true, error: null };
}
