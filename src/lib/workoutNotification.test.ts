import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActiveWorkoutDraft, ActiveSessionExercise, LiveWorkoutSet } from "@/lib/db";
import { buildWorkoutNotificationPayload, restStatusLine } from "@/lib/workoutNotification";

afterEach(() => {
  vi.restoreAllMocks();
});

function setNow(now: number): void {
  vi.spyOn(Date, "now").mockReturnValue(now);
}

function makeSet(overrides: Partial<LiveWorkoutSet> = {}): LiveWorkoutSet {
  return { weight: 20, reps: 8, completed: true, ...overrides };
}

function makeExercises(entries: Array<[string, LiveWorkoutSet[]]>): ActiveSessionExercise[] {
  return entries.map(([exerciseId, sets]) => ({ exerciseId, sets }));
}

function makeDraft(overrides: Partial<ActiveWorkoutDraft> = {}): ActiveWorkoutDraft {
  return {
    routine: null,
    name: "",
    startedAt: 0,
    exercises: [],
    ...overrides,
  };
}

function makeRestTimer(endsAt: number): ActiveWorkoutDraft["restTimer"] {
  return { endsAt, durationSec: 90 };
}

describe("restStatusLine", () => {
  it("is undefined with no rest timer running", () => {
    expect(restStatusLine(makeDraft())).toBeUndefined();
  });

  it("reads Resting (no figure - that's the chronometer's job) while time remains", () => {
    setNow(0);
    const draft = makeDraft({ restTimer: makeRestTimer(90_500) });
    expect(restStatusLine(draft)).toBe("Resting");
  });

  it("reads Ready once the rest period has elapsed", () => {
    setNow(0);
    const draft = makeDraft({ restTimer: makeRestTimer(-1) });
    expect(restStatusLine(draft)).toBe("Ready ✓");
  });
});

describe("buildWorkoutNotificationPayload", () => {
  it("reports the elapsed anchor and not paused/resting while just running", () => {
    const draft = makeDraft({ startedAt: 10_000, totalPausedMs: 3_000 });
    const payload = buildWorkoutNotificationPayload(draft);
    expect(payload.paused).toBe(false);
    expect(payload.resting).toBe(false);
    expect(payload.elapsedAnchorMs).toBe(13_000);
  });

  it("never mentions an elapsed figure in the text while running - the chronometer owns that", () => {
    const draft = makeDraft({ startedAt: 0 });
    const payload = buildWorkoutNotificationPayload(draft);
    expect(payload.largeBody).not.toMatch(/Elapsed/);
  });

  it("reports resting with the correct restEndsAtMs while a rest timer is running", () => {
    setNow(0);
    const draft = makeDraft({ restTimer: makeRestTimer(45_000) });
    const payload = buildWorkoutNotificationPayload(draft);
    expect(payload.resting).toBe(true);
    expect(payload.restEndsAtMs).toBe(45_000);
    expect(payload.paused).toBe(false);
  });

  it("reports not resting once the rest period has naturally elapsed", () => {
    setNow(100_000);
    const draft = makeDraft({ restTimer: makeRestTimer(45_000) });
    expect(buildWorkoutNotificationPayload(draft).resting).toBe(false);
  });

  it("reports not resting while paused, even with a rest timer present", () => {
    const draft = makeDraft({ pausedAt: 0, restTimer: makeRestTimer(45_000) });
    expect(buildWorkoutNotificationPayload(draft).resting).toBe(false);
  });

  it("falls back to a static elapsed figure and reports paused with no chronometer", () => {
    const draft = makeDraft({ startedAt: 0, pausedAt: 90_000, totalPausedMs: 0 });
    const payload = buildWorkoutNotificationPayload(draft);
    expect(payload.paused).toBe(true);
    expect(payload.title).toBe("Workout paused");
    expect(payload.largeBody).toContain("Paused · Elapsed: 1:30");
  });

  it("always tells the user to return to the workout, phrased the same whether paused or not", () => {
    const running = buildWorkoutNotificationPayload(makeDraft());
    const paused = buildWorkoutNotificationPayload(makeDraft({ pausedAt: 0 }));
    expect(running.largeBody).toContain("Tap to return to your workout.");
    expect(paused.largeBody).toContain("Tap to return to your workout.");
  });

  it("includes the current exercise when one is in progress", () => {
    const draft = makeDraft({
      exercises: makeExercises([["bench-press", [makeSet({ completed: false })]]]),
    });
    const payload = buildWorkoutNotificationPayload(draft);
    expect(payload.body).toContain("Bench Press");
    expect(payload.largeBody).toContain("Current exercise: Bench Press");
  });

  it("omits the current-exercise line cleanly when nothing is in progress", () => {
    const payload = buildWorkoutNotificationPayload(makeDraft({ exercises: [] }));
    expect(payload.largeBody).not.toMatch(/Current exercise/);
  });

  it("folds an active rest status into the body only while running", () => {
    setNow(0);
    const restingDraft = makeDraft({ restTimer: makeRestTimer(30_500) });
    const payload = buildWorkoutNotificationPayload(restingDraft);
    expect(payload.body).toContain("Resting");

    // Paused suppresses it, since endsAt isn't corrected for the pause and
    // would otherwise read as still counting down.
    const pausedDraft = makeDraft({ pausedAt: 0, restTimer: makeRestTimer(30_500) });
    expect(buildWorkoutNotificationPayload(pausedDraft).body).not.toMatch(/Resting/);
  });
});
