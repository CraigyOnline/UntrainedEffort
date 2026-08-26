import { describe, expect, it } from "vitest";
import type { Workout, WorkoutSet } from "@/lib/db";
import {
  computeExerciseStatus,
  computeExerciseStatusFromValues,
  computeExpectedRepRange,
  formatStatusConfidence,
  getTrendConfidence,
  trendConfidenceLabel,
} from "@/lib/exerciseProgress";

function makeSet(weight: number): WorkoutSet {
  return { weight, reps: 10, completed: true };
}

/** Sessions most-recent-first, one completed set of the given weight each —
 *  matches how computeExerciseStatus expects `workouts` to already be
 *  ordered (see ExerciseStatusSummary.values' doc comment). */
function makeSessions(exerciseId: string, weightsMostRecentFirst: number[]): Workout[] {
  return weightsMostRecentFirst.map((weight, i) => ({
    id: i,
    name: "Workout",
    startedAt: Date.now() - i * 86400000,
    endedAt: Date.now() - i * 86400000,
    durationSec: 1800,
    exercises: [{ exerciseId, sets: [makeSet(weight)] }],
  }));
}

describe("computeExerciseStatusFromValues", () => {
  it("returns needs-more-data with fewer than 2 sessions", () => {
    expect(computeExerciseStatusFromValues([])).toBe("needs-more-data");
    expect(computeExerciseStatusFromValues([100])).toBe("needs-more-data");
  });

  describe("below the plateau window (2-3 sessions) — plain two-point comparison", () => {
    it("reports improving when the latest session beats the previous one", () => {
      expect(computeExerciseStatusFromValues([110, 100])).toBe("improving");
    });

    it("reports declining, not plateauing, when the latest session is lower", () => {
      // The bug this replaces: a drop used to be mislabeled "plateauing".
      expect(computeExerciseStatusFromValues([90, 100])).toBe("declining");
    });

    it("reports stable, not plateauing, for a flat two-point reading", () => {
      expect(computeExerciseStatusFromValues([100, 100])).toBe("stable");
      // A 3rd (older) session doesn't matter below the window — only
      // values[0] vs values[1] (latest vs previous) is compared.
      expect(computeExerciseStatusFromValues([100, 100, 999])).toBe("stable");
    });
  });

  describe("at the plateau window (4+ sessions) — oldest vs newest across the window", () => {
    it("reports plateauing once there's enough history for an identical oldest/newest pair", () => {
      expect(computeExerciseStatusFromValues([100, 90, 110, 100])).toBe("plateauing");
    });

    it("is not fooled by a mid-window blip — only oldest vs newest in the window matters", () => {
      // Latest (100) equals the 4th-most-recent (100); the dip to 80 in
      // between doesn't change the result, matching the documented scope.
      expect(computeExerciseStatusFromValues([100, 130, 80, 100, 60])).toBe("plateauing");
    });

    it("reports improving/declining from oldest vs newest, ignoring sessions beyond the window", () => {
      expect(computeExerciseStatusFromValues([120, 90, 90, 100, 40])).toBe("improving");
      expect(computeExerciseStatusFromValues([80, 90, 90, 100, 40])).toBe("declining");
    });
  });

  describe("lowerIsBetter (pace)", () => {
    it("flips the improving/declining direction for a falling value", () => {
      // Latest pace is lower (faster) than previous — an improvement.
      expect(computeExerciseStatusFromValues([300, 320], true)).toBe("improving");
      // Latest pace is higher (slower) than previous — a decline.
      expect(computeExerciseStatusFromValues([320, 300], true)).toBe("declining");
    });

    it("still reports stable/plateauing for an exact match regardless of direction", () => {
      expect(computeExerciseStatusFromValues([300, 300], true)).toBe("stable");
      expect(computeExerciseStatusFromValues([300, 280, 310, 300], true)).toBe("plateauing");
    });
  });
});

describe("computeExerciseStatus", () => {
  it("pairs comparisonPrevious with values[1] below the plateau window (2-3 sessions)", () => {
    const result = computeExerciseStatus(makeSessions("bench-press", [110, 100]), "bench-press");
    expect(result.values).toEqual([110, 100]);
    expect(result.comparisonPrevious).toBe(100);
    expect(result.status).toBe("improving");
  });

  it("pairs comparisonPrevious with values[3] at the plateau window (4+ sessions), not values[1]", () => {
    // The bug this replaces: an evidence line built from values[0]/values[1]
    // could show two equal numbers ("15 → 15") right next to an "improving"
    // arrow, because the status compares against 4 sessions back, not the
    // immediately-prior one.
    const result = computeExerciseStatus(
      makeSessions("bench-press", [15, 15, 15, 10]),
      "bench-press",
    );
    expect(result.status).toBe("improving");
    expect(result.comparisonPrevious).toBe(10);
    expect(result.values[1]).toBe(15); // the mismatched value the bug displayed
  });

  it("returns a null comparisonPrevious below 2 sessions", () => {
    const result = computeExerciseStatus(makeSessions("bench-press", [100]), "bench-press");
    expect(result.comparisonPrevious).toBeNull();
    expect(result.status).toBe("needs-more-data");
  });
});

describe("getTrendConfidence", () => {
  it("returns null below 2 sessions — no trend to attach confidence to", () => {
    expect(getTrendConfidence(0)).toBeNull();
    expect(getTrendConfidence(1)).toBeNull();
  });

  it("reports early confidence, capped at 2 sessions used, below the plateau window", () => {
    expect(getTrendConfidence(2)).toEqual({ confidence: "early", sessionsUsed: 2 });
    expect(getTrendConfidence(3)).toEqual({ confidence: "early", sessionsUsed: 2 });
  });

  it("reports established confidence, capped at 4 sessions used, at or above the plateau window", () => {
    expect(getTrendConfidence(4)).toEqual({ confidence: "established", sessionsUsed: 4 });
    // A much larger history still names only the 4 sessions the underlying
    // classifier actually compares (oldest/newest in the window) — never
    // overstating the evidence beyond what was really used.
    expect(getTrendConfidence(50)).toEqual({ confidence: "established", sessionsUsed: 4 });
  });
});

describe("trendConfidenceLabel", () => {
  it("labels each tier", () => {
    expect(trendConfidenceLabel("early")).toBe("Early signal");
    expect(trendConfidenceLabel("established")).toBe("Well-established");
  });
});

describe("formatStatusConfidence", () => {
  it("returns null below 2 sessions", () => {
    expect(formatStatusConfidence(1)).toBeNull();
  });

  it("names exactly 2 sessions below the window, regardless of how many actually exist", () => {
    expect(formatStatusConfidence(2)).toBe("Early signal · Based on your last 2 sessions");
    expect(formatStatusConfidence(3)).toBe("Early signal · Based on your last 2 sessions");
  });

  it("names exactly 4 sessions at or above the window, regardless of how many actually exist", () => {
    expect(formatStatusConfidence(4)).toBe("Well-established · Based on your last 4 sessions");
    expect(formatStatusConfidence(20)).toBe("Well-established · Based on your last 4 sessions");
  });
});

describe("computeExpectedRepRange", () => {
  const at = (weight: number, reps: number) => ({ weight, reps });

  it("returns null with fewer than 2 historical values at that set position", () => {
    expect(computeExpectedRepRange([], 0, 10)).toBeNull();
    expect(computeExpectedRepRange([[at(10, 10), at(10, 8), at(10, 6)]], 0, 10)).toBeNull();
  });

  it("returns the observed min/max at that exact set position, at the matching weight", () => {
    const sessions = [
      [at(10, 10), at(10, 8), at(10, 6)],
      [at(10, 9), at(10, 7)],
      [at(10, 11), at(10, 9), at(10, 7)],
    ];
    // set index 0 (1st set): 10, 9, 11
    expect(computeExpectedRepRange(sessions, 0, 10)).toEqual({ min: 9, max: 11 });
    // set index 1 (2nd set): 8, 7, 9
    expect(computeExpectedRepRange(sessions, 1, 10)).toEqual({ min: 7, max: 9 });
  });

  it("ignores sessions that didn't reach that set position", () => {
    const sessions = [
      [at(10, 10), at(10, 8), at(10, 6)],
      [at(10, 9)], // only 1 set logged that session
    ];
    // set index 2 (3rd set) — only the first session has data there,
    // below the 2-value minimum
    expect(computeExpectedRepRange(sessions, 2, 10)).toBeNull();
  });

  it("ignores a zero rep count at that position (not a real set)", () => {
    const sessions = [
      [at(10, 10), at(10, 8)],
      [at(10, 9), at(10, 0)],
      [at(10, 11), at(10, 7)],
    ];
    // set index 1: 8, 0(excluded), 7 — only 2 real values, right at the floor
    expect(computeExpectedRepRange(sessions, 1, 10)).toEqual({ min: 7, max: 8 });
  });

  it("only counts sessions logged at (near enough) the current weight", () => {
    const sessions = [
      [at(20, 10)], // heavy, low reps
      [at(10, 20)], // light, high reps
      [at(10, 18)],
    ];
    // Without weight-matching this would wrongly report {min:10, max:20}.
    expect(computeExpectedRepRange(sessions, 0, 10)).toEqual({ min: 18, max: 20 });
    // Only one session at 20kg — below the 2-value minimum.
    expect(computeExpectedRepRange(sessions, 0, 20)).toBeNull();
  });

  it("treats near-identical weights as a match (float rounding), not different weights", () => {
    const sessions = [[at(10.0000001, 10)], [at(9.9999999, 8)]];
    expect(computeExpectedRepRange(sessions, 0, 10)).toEqual({ min: 8, max: 10 });
  });
});
