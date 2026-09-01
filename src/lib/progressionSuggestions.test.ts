import { describe, expect, it } from "vitest";
import { evaluateExerciseProgression, type ProgressionState } from "@/lib/progressionSuggestions";

const NOW = 1_000_000;

describe("evaluateExerciseProgression", () => {
  it("suggests no change when reps land right on target", () => {
    const result = evaluateExerciseProgression(
      "bench-press",
      10,
      undefined,
      { weight: 15, worstReps: 10 },
      { weight: 15, worstReps: 10 },
      NOW,
    );
    expect(result).toBeNull();
  });

  it("suggests no change for a +1 overshoot — under the +2 margin", () => {
    const result = evaluateExerciseProgression(
      "bench-press",
      10,
      undefined,
      { weight: 15, worstReps: 11 },
      { weight: 15, worstReps: 11 },
      NOW,
    );
    expect(result).toBeNull();
  });

  it("suggests more reps for a +2 overshoot held across two sessions", () => {
    const result = evaluateExerciseProgression(
      "bench-press",
      10,
      undefined,
      { weight: 15, worstReps: 12 },
      { weight: 15, worstReps: 12 },
      NOW,
    );
    expect(result).toMatchObject({ kind: "add-reps", proposedWeight: 15, proposedReps: 12 });
  });

  it("does not fire on a single overshoot session — needs both", () => {
    const result = evaluateExerciseProgression(
      "bench-press",
      10,
      undefined,
      { weight: 15, worstReps: 8 },
      { weight: 15, worstReps: 12 },
      NOW,
    );
    expect(result).toBeNull();
  });

  it("breaks the streak when the two sessions used different weights", () => {
    const result = evaluateExerciseProgression(
      "bench-press",
      10,
      undefined,
      { weight: 12.5, worstReps: 12 },
      { weight: 15, worstReps: 12 },
      NOW,
    );
    expect(result).toBeNull();
  });

  it("suggests weight, not reps, once performance clears the ceiling (repFloor + 4)", () => {
    // repFloor defaults to targetReps (10) when there's no prior state,
    // so the ceiling here is 14.
    const result = evaluateExerciseProgression(
      "db-row",
      10,
      undefined,
      { weight: 10, worstReps: 22 },
      { weight: 10, worstReps: 20 },
      NOW,
    );
    expect(result).toMatchObject({ kind: "add-weight", proposedWeight: 12.5, proposedReps: 10 });
  });

  it("suggests easing off when both sessions fall short of target", () => {
    const result = evaluateExerciseProgression(
      "db-shoulder-press",
      10,
      undefined,
      { weight: 15, worstReps: 8 },
      { weight: 15, worstReps: 7 },
      NOW,
    );
    expect(result).toMatchObject({ kind: "ease-off", proposedWeight: 12.5 });
  });

  it("never suggests a negative weight when easing off from a light weight", () => {
    const result = evaluateExerciseProgression(
      "lateral-raise",
      10,
      undefined,
      { weight: 2, worstReps: 6 },
      { weight: 2, worstReps: 5 },
      NOW,
    );
    expect(result?.proposedWeight).toBe(0);
  });

  it("does not repeat a reps suggestion already shown for this exact level", () => {
    const state: ProgressionState = {
      weight: 15,
      repFloor: 10,
      lastPromptedReps: 12,
      lastPromptedAt: NOW - 1,
    };
    const result = evaluateExerciseProgression(
      "bench-press",
      10,
      state,
      { weight: 15, worstReps: 12 },
      { weight: 15, worstReps: 12 },
      NOW,
    );
    expect(result).toBeNull();
  });

  it("does suggest again once performance clears a level higher than what was already prompted", () => {
    const state: ProgressionState = {
      weight: 15,
      repFloor: 10,
      lastPromptedReps: 12,
      lastPromptedAt: NOW - 1,
    };
    const result = evaluateExerciseProgression(
      "bench-press",
      10,
      state,
      { weight: 15, worstReps: 13 },
      { weight: 15, worstReps: 13 },
      NOW,
    );
    expect(result).toMatchObject({ kind: "add-reps", proposedReps: 13 });
  });

  it("keeps resurfacing a ceiling breach even after the same level was already prompted", () => {
    const state: ProgressionState = {
      weight: 15,
      repFloor: 10,
      lastPromptedReps: 15,
      lastPromptedAt: NOW - 1,
    };
    const result = evaluateExerciseProgression(
      "bench-press",
      10,
      state,
      { weight: 15, worstReps: 15 },
      { weight: 15, worstReps: 15 },
      NOW,
    );
    expect(result).toMatchObject({ kind: "add-weight" });
  });

  it("does not repeat an ease-off suggestion already shown for this exact level", () => {
    const state: ProgressionState = {
      weight: 15,
      repFloor: 10,
      lastPromptedReps: 7,
      lastPromptedAt: NOW - 1,
    };
    const result = evaluateExerciseProgression(
      "db-shoulder-press",
      10,
      state,
      { weight: 15, worstReps: 7 },
      { weight: 15, worstReps: 7 },
      NOW,
    );
    expect(result).toBeNull();
  });

  it("returns null with no previous session to compare against", () => {
    const result = evaluateExerciseProgression(
      "bench-press",
      10,
      undefined,
      undefined,
      { weight: 15, worstReps: 12 },
      NOW,
    );
    expect(result).toBeNull();
  });

  // Replays the real Untrained Effort data that motivated the ceiling
  // rule: bench press sits at 15kg the whole time, climbs from 10 to 12
  // reps (suggest +reps once), holds at 12 for several sessions (quiet),
  // then jumps to 15. That first 15 is a single data point compared
  // against the prior 12, so — same "needs two in a row" rule as
  // everything else in this module — it's capped as a reps suggestion
  // at the ceiling (14) rather than instantly jumping to weight; only
  // once 15 holds for a second session does it convert to weight.
  it("replays the bench-press scenario: reps once, quiet, capped at the ceiling, then weight once it holds", () => {
    let state: ProgressionState | undefined;
    const sessions = [12, 12, 12, 12, 12, 12, 15, 15];
    const results: (ReturnType<typeof evaluateExerciseProgression> | null)[] = [];

    for (let i = 1; i < sessions.length; i++) {
      const result = evaluateExerciseProgression(
        "db-bench-press",
        10,
        state,
        { weight: 15, worstReps: sessions[i - 1] },
        { weight: 15, worstReps: sessions[i] },
        NOW + i,
      );
      results.push(result);
      if (result) state = result.nextState;
    }

    expect(results[0]).toMatchObject({ kind: "add-reps", proposedReps: 12 }); // sessions[0..1]: 12,12
    expect(results.slice(1, 5).every((r) => r === null)).toBe(true); // holding at 12
    expect(results[5]).toMatchObject({ kind: "add-reps", proposedReps: 14 }); // 12 -> 15: capped at the ceiling, not weight yet
    expect(results[6]).toMatchObject({
      kind: "add-weight",
      proposedWeight: 17.5,
      proposedReps: 10,
    }); // 15 -> 15: now both clear the ceiling
  });
});
