/**
 * Progression suggestions — deciding whether an exercise's last two
 * sessions at the same weight justify suggesting more reps, more weight,
 * or easing off, and never nagging about the same thing twice.
 *
 * Scope: weighted, non-circuit exercises only. Distance/duration-based
 * exercises and circuit stations aren't evaluated — see how this gets
 * called from _app.workout.tsx.
 *
 * The model, in short (see the design discussion this came out of):
 *  - A session only counts against another if they're at the same
 *    weight — that's the "streak" double progression needs.
 *  - Clearing target reps by OVERSHOOT_MARGIN for both sessions suggests
 *    a rep bump — the gentle, no-new-equipment-needed default.
 *  - But reps can't climb forever: each weight has an implicit ceiling,
 *    CEILING_SPAN above the reps that weight started at (repFloor).
 *    Clearing the ceiling always suggests weight instead, however small
 *    the jump from the current target looks — otherwise the "+2" rule
 *    alone lets reps drift from 10 to 20 in small hops that each look
 *    individually reasonable.
 *  - Falling short of target for both sessions suggests holding or
 *    easing off — the symmetric, equally-important other direction.
 *  - A suggestion that's already been shown for this exact rep level
 *    doesn't repeat itself — except a ceiling breach, which is treated
 *    as a strong enough signal to keep resurfacing rather than go
 *    permanently quiet just because it was declined once.
 */

export type ProgressionSuggestionKind = "add-reps" | "add-weight" | "ease-off";

/** What to persist on the routine's exercise entry regardless of how the
 *  person answers — see RoutineExercise.progressionState in db.ts. */
export interface ProgressionState {
  weight: number;
  repFloor: number;
  lastPromptedReps: number;
  lastPromptedAt: number;
}

export interface ProgressionSuggestion {
  exerciseId: string;
  kind: ProgressionSuggestionKind;
  /** The weight and reps actually being done right now, for the prompt's copy. */
  currentWeight: number;
  currentReps: number;
  /** What to propose as the new target if accepted. */
  proposedWeight: number;
  proposedReps: number;
  nextState: ProgressionState;
}

interface SessionPoint {
  weight: number;
  /** The lowest completed-set rep count that session at `weight` — the
   *  binding number: every set needs to clear a bar for it to count. */
  worstReps: number;
}

/** Reps clear of target before anything fires. Below this, steady,
 *  on-target performance — showing up and matching the prescription —
 *  stays completely silent, by design. */
const OVERSHOOT_MARGIN = 2;

/** How far reps can climb above repFloor via suggestions before it
 *  converts to a weight suggestion instead. 4 gives a 5-number range
 *  (e.g. 10-14), the same width as a classic 8-12 scheme. */
const CEILING_SPAN = 4;

/** Flat weight step, matching the app's existing input step everywhere else. */
export const PROGRESSION_WEIGHT_STEP = 2.5;

export function evaluateExerciseProgression(
  exerciseId: string,
  targetReps: number,
  state: ProgressionState | undefined,
  previous: SessionPoint | undefined,
  latest: SessionPoint,
  now: number,
): ProgressionSuggestion | null {
  if (!previous || previous.weight !== latest.weight) {
    return null;
  }
  const weight = latest.weight;

  // Stale or absent state (weight has moved on since it was last
  // recorded, or this exercise has never been evaluated) starts fresh:
  // this weight's floor is wherever the routine's target reps sit today.
  const effective: ProgressionState =
    state && state.weight === weight
      ? state
      : { weight, repFloor: targetReps, lastPromptedReps: -Infinity, lastPromptedAt: 0 };

  const ceiling = effective.repFloor + CEILING_SPAN;
  const prevReps = previous.worstReps;
  const curReps = latest.worstReps;

  const bothAtCeiling = prevReps >= ceiling && curReps >= ceiling;
  const bothOvershoot =
    !bothAtCeiling &&
    prevReps >= targetReps + OVERSHOOT_MARGIN &&
    curReps >= targetReps + OVERSHOOT_MARGIN;
  const bothMissed = prevReps < targetReps && curReps < targetReps;
  const alreadyPromptedThisLevel = curReps === effective.lastPromptedReps;

  if (bothAtCeiling) {
    // Ceiling breaches ignore alreadyPromptedThisLevel on purpose — see
    // the module doc comment.
    return {
      exerciseId,
      kind: "add-weight",
      currentWeight: weight,
      currentReps: targetReps,
      proposedWeight: weight + PROGRESSION_WEIGHT_STEP,
      proposedReps: effective.repFloor,
      nextState: {
        weight,
        repFloor: effective.repFloor,
        lastPromptedReps: curReps,
        lastPromptedAt: now,
      },
    };
  }

  if (bothOvershoot && !alreadyPromptedThisLevel) {
    return {
      exerciseId,
      kind: "add-reps",
      currentWeight: weight,
      currentReps: targetReps,
      proposedWeight: weight,
      proposedReps: Math.min(curReps, ceiling),
      nextState: {
        weight,
        repFloor: effective.repFloor,
        lastPromptedReps: curReps,
        lastPromptedAt: now,
      },
    };
  }

  if (bothMissed && !alreadyPromptedThisLevel) {
    return {
      exerciseId,
      kind: "ease-off",
      currentWeight: weight,
      currentReps: targetReps,
      proposedWeight: Math.max(weight - PROGRESSION_WEIGHT_STEP, 0),
      proposedReps: targetReps,
      nextState: {
        weight,
        repFloor: effective.repFloor,
        lastPromptedReps: curReps,
        lastPromptedAt: now,
      },
    };
  }

  return null;
}

const STORAGE_KEY = "progressionSuggestionsEnabled";

export function getProgressionSuggestionsEnabled(): boolean {
  if (typeof window === "undefined") return true;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === null ? true : stored === "true";
}

export function setProgressionSuggestionsEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, String(enabled));
}
