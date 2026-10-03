// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getRestSoundEnabled,
  playRestSound,
  setRestSoundEnabled,
  shouldPlayRestSound,
} from "@/lib/restSound";

const playRestSoundNative = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("@/lib/workoutForegroundServicePlugin", () => ({
  WorkoutForegroundService: { playRestSound: playRestSoundNative },
}));

describe("shouldPlayRestSound", () => {
  it("plays for a live transition with the app visible", () => {
    expect(shouldPlayRestSound(10_000, 10_100, true)).toBe(true);
  });

  it("still plays right at the lateness limit", () => {
    expect(shouldPlayRestSound(10_000, 12_000, true)).toBe(true);
  });

  it("stays quiet when the timer only catches up long after the rest ended", () => {
    expect(shouldPlayRestSound(10_000, 12_001, true)).toBe(false);
    expect(shouldPlayRestSound(10_000, 600_000, true)).toBe(false);
  });

  it("stays quiet while the app isn't visible, however on-time", () => {
    expect(shouldPlayRestSound(10_000, 10_100, false)).toBe(false);
  });
});

describe("rest sound preference", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defaults to enabled", () => {
    expect(getRestSoundEnabled()).toBe(true);
  });

  it("round-trips through localStorage", () => {
    setRestSoundEnabled(false);
    expect(getRestSoundEnabled()).toBe(false);
    setRestSoundEnabled(true);
    expect(getRestSoundEnabled()).toBe(true);
  });
});

describe("playRestSound", () => {
  beforeEach(() => {
    window.localStorage.clear();
    playRestSoundNative.mockClear();
    vi.spyOn(Date, "now").mockReturnValue(10_100);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("plays through the native plugin when enabled", async () => {
    await playRestSound(10_000);
    expect(playRestSoundNative).toHaveBeenCalledTimes(1);
  });

  it("stays silent when the preference is off", async () => {
    setRestSoundEnabled(false);
    await playRestSound(10_000);
    expect(playRestSoundNative).not.toHaveBeenCalled();
  });
});
