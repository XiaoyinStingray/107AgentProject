import { describe, expect, it } from "vitest";
import art from "../data/scenes/art.json";
import classroom from "../data/scenes/classroom.json";
import dorm from "../data/scenes/dorm.json";
import lab from "../data/scenes/lab.json";
import library from "../data/scenes/library.json";
import sakura from "../data/scenes/sakura.json";
import {
  DECOR_FRAME,
  FG_FRAME,
  ITEM_FRAME,
  WALL_DECOR_FRAME,
} from "./tileset";

interface SceneEntry {
  id: string;
  name: string;
  width: number;
  height: number;
  tileSize: number;
  weather: string;
  ground: number[][];
  items: Array<{
    id: string;
    type: string;
    tileX: number;
    tileY: number;
  }>;
  decors: Array<{ type: string; tileX: number; tileY: number }>;
  foregrounds: Array<{ type: string; tileX: number; tileY: number }>;
  spawns: Array<{ x: number; y: number }>;
}

const SCENES = [
  art,
  classroom,
  dorm,
  lab,
  library,
  sakura,
] as SceneEntry[];

describe("Phase 16 scene data", () => {
  it("contains the six planned scenes with matching IDs", () => {
    expect(SCENES.map((scene) => scene.id).sort()).toEqual([
      "art",
      "classroom",
      "dorm",
      "lab",
      "library",
      "sakura",
    ]);
  });

  it.each(SCENES)("$id has a complete rectangular tile grid", (scene) => {
    expect(scene.name.trim()).not.toBe("");
    expect(scene.width).toBe(16);
    expect(scene.height).toBe(12);
    expect(scene.tileSize).toBe(32);
    expect(scene.ground).toHaveLength(scene.height);
    expect(scene.ground.every((row) => row.length === scene.width)).toBe(true);
    expect(["clear", "sakura", "rain"]).toContain(scene.weather);
  });

  it.each(SCENES)("$id keeps items and spawns inside the map", (scene) => {
    const inBounds = (x: number, y: number) =>
      x >= 0 && x < scene.width && y >= 0 && y < scene.height;

    expect(scene.items.every((item) => inBounds(item.tileX, item.tileY))).toBe(true);
    expect(scene.spawns.every((spawn) => inBounds(spawn.x, spawn.y))).toBe(true);
    expect(new Set(scene.items.map((item) => item.id)).size).toBe(scene.items.length);
  });

  it.each(SCENES)("$id only references registered art assets", (scene) => {
    expect(scene.items.every((item) => item.type in ITEM_FRAME)).toBe(true);
    expect(
      scene.decors.every(
        (decor) => decor.type in DECOR_FRAME || decor.type in WALL_DECOR_FRAME,
      ),
    ).toBe(true);
    expect(
      scene.foregrounds.every((foreground) => foreground.type in FG_FRAME),
    ).toBe(true);
  });
});
