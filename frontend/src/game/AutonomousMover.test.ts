import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("phaser", () => ({
  default: {},
}));

vi.mock("./sprites/AgentSprite", () => ({
  AgentSprite: class {},
}));

import { AutonomousMover, type MovementReservation } from "./AutonomousMover";

function createHarness(reservation: MovementReservation) {
  const sprite = {
    agentId: "agent-a",
    tileX: 1,
    tileY: 1,
    action: "idle",
    emotion: "neutral",
    setAction: vi.fn(function (this: { action: string }, action: string) {
      this.action = action;
    }),
  };
  const timer = { destroy: vi.fn() };
  const scene = {
    time: { delayedCall: vi.fn(() => timer) },
    tweens: { add: vi.fn() },
    game: { events: { emit: vi.fn() } },
  };
  const mover = new AutonomousMover(
    sprite as any,
    scene as any,
    { intervalMin: 1000, intervalMax: 1000, maxRange: 2, idleChance: 0 },
    () => true,
    () => false,
    { w: 8, h: 8 },
    reservation,
  );
  return { mover, scene, sprite, timer };
}

describe("AutonomousMover destination reservations", () => {
  let release: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    release = vi.fn();
  });

  it("uses the destination granted by the scene and releases it after moving", () => {
    const reserve = vi.fn(() => ({ tileX: 3, tileY: 5 }));
    const { mover, scene, sprite } = createHarness({ reserve, release });

    mover.start();
    mover.setSseDriven(true);
    mover.pushCommand(4, 5);

    expect(reserve).toHaveBeenCalledWith("agent-a", 4, 5);
    expect(scene.tweens.add).toHaveBeenCalledOnce();
    const tween = scene.tweens.add.mock.calls[0][0] as any;
    expect(tween).toMatchObject({ x: 3 * 64 + 32, y: 5 * 64 + 32 });

    tween.onComplete();

    expect(release).toHaveBeenCalledWith("agent-a");
    expect(sprite).toMatchObject({ tileX: 3, tileY: 5, action: "idle" });
    expect(scene.game.events.emit).toHaveBeenCalledWith(
      "agent-moved",
      "agent-a",
      3,
      5,
    );
  });

  it("does not start a tween when no destination can be reserved", () => {
    const reserve = vi.fn(() => null);
    const { mover, scene, sprite } = createHarness({ reserve, release });

    mover.start();
    mover.setSseDriven(true);
    mover.pushCommand(4, 5);

    expect(reserve).toHaveBeenCalledWith("agent-a", 4, 5);
    expect(scene.tweens.add).not.toHaveBeenCalled();
    expect(sprite.action).toBe("idle");
  });

  it("releases any outstanding destination when stopped", () => {
    const reserve = vi.fn(() => ({ tileX: 2, tileY: 2 }));
    const { mover, timer } = createHarness({ reserve, release });

    mover.start();
    mover.stop();

    expect(timer.destroy).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledWith("agent-a");
  });
});
