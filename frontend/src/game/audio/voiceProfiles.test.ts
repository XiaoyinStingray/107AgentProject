import { describe, expect, it } from "vitest";
import type { Emotion } from "../sprites/AgentSprite";
import { getEmotionMod, getVoiceProfile } from "./voiceProfiles";

describe("voiceProfiles", () => {
  it("generates a stable profile for the same Agent", () => {
    expect(getVoiceProfile("agent-lin")).toEqual(getVoiceProfile("agent-lin"));
  });

  it("keeps every generated parameter inside its documented range", () => {
    for (const id of ["agent-a", "agent-b", "agent-c", "真实角色-01"]) {
      const profile = getVoiceProfile(id);
      expect(profile.basePitch).toBeGreaterThanOrEqual(200);
      expect(profile.basePitch).toBeLessThan(380);
      expect(["sine", "triangle", "sawtooth", "square"]).toContain(
        profile.waveform,
      );
      expect(profile.brightness).toBeGreaterThanOrEqual(0.35);
      expect(profile.brightness).toBeLessThan(0.75);
      expect(profile.vibrato).toBeGreaterThanOrEqual(2);
      expect(profile.vibrato).toBeLessThan(10);
      expect(profile.speed).toBeGreaterThanOrEqual(0.85);
      expect(profile.speed).toBeLessThan(1.25);
    }
  });

  it("modulates pitch and tempo in the intended emotional directions", () => {
    const neutral = getEmotionMod("neutral");
    const happy = getEmotionMod("happy");
    const angry = getEmotionMod("angry");
    const sad = getEmotionMod("sad");
    const tired = getEmotionMod("tired");

    expect(happy.pitchShift).toBeGreaterThan(neutral.pitchShift);
    expect(happy.noteLength).toBeLessThan(neutral.noteLength);
    expect(angry.noteGap).toBeLessThan(neutral.noteGap);
    expect(sad.pitchShift).toBeLessThan(neutral.pitchShift);
    expect(sad.noteLength).toBeGreaterThan(neutral.noteLength);
    expect(tired.pitchShift).toBeLessThan(sad.pitchShift);
    expect(tired.noteGap).toBeGreaterThan(neutral.noteGap);
  });

  it("defines a modulation for every supported emotion", () => {
    const emotions: Emotion[] = [
      "neutral",
      "happy",
      "anxious",
      "angry",
      "sad",
      "surprised",
      "confused",
      "tired",
      "excited",
    ];

    for (const emotion of emotions) {
      expect(getEmotionMod(emotion)).toEqual({
        pitchShift: expect.any(Number),
        noteLength: expect.any(Number),
        noteGap: expect.any(Number),
        gainBoost: expect.any(Number),
      });
    }
  });
});
