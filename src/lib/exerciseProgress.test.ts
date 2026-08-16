import { describe, expect, it } from "vitest";
import {
  computeExerciseStatusFromValues,
  computeExpectedRepRange,
  formatStatusConfidence,
  getTrendConfidence,
  trendConfidenceLabel,
} from "@/lib/exerciseProgress";

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
  it("returns null with fewer than 2 historical values at that set position", () => {
    expect(computeExpectedRepRange([], 0)).toBeNull();
    expect(computeExpectedRepRange([[10, 8, 6]], 0)).toBeNull();
  });

  it("returns the observed min/max at that exact set position", () => {
    const sessions = [
      [10, 8, 6],
      [9, 7],
      [11, 9, 7],
    ];
    // set index 0 (1st set): 10, 9, 11
    expect(computeExpectedRepRange(sessions, 0)).toEqual({ min: 9, max: 11 });
    // set index 1 (2nd set): 8, 7, 9
    expect(computeExpectedRepRange(sessions, 1)).toEqual({ min: 7, max: 9 });
  });

  it("ignores sessions that didn't reach that set position", () => {
    const sessions = [
      [10, 8, 6],
      [9], // only 1 set logged that session
    ];
    // set index 2 (3rd set) — only the first session has data there,
    // below the 2-value minimum
    expect(computeExpectedRepRange(sessions, 2)).toBeNull();
  });

  it("ignores a zero rep count at that position (not a real set)", () => {
    const sessions = [
      [10, 8],
      [9, 0],
      [11, 7],
    ];
    // set index 1: 8, 0(excluded), 7 — only 2 real values, right at the floor
    expect(computeExpectedRepRange(sessions, 1)).toEqual({ min: 7, max: 8 });
  });
});
