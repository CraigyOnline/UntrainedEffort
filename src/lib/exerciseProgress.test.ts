import { describe, expect, it } from "vitest";
import { computeExerciseStatusFromValues } from "@/lib/exerciseProgress";

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
