import {
  getDb,
  type Workout,
  type WorkoutExerciseLog,
  type LiveWorkoutSet,
  type Routine,
  type RestTimerState,
} from "@/lib/db";
import { DEFAULT_REST_DURATION_SEC } from "@/lib/exercises";
import { recordNewWorkoutPRs } from "@/lib/workoutIntegrity";
import { haptics } from "@/lib/haptics";
import { selectCompletionMessage, type CompletionMessage } from "@/lib/completionMessages";
import {
  evaluateExerciseProgression,
  type ProgressionSuggestion,
} from "@/lib/progressionSuggestions";

// ─────────────────────────────────────────────────────────────────────────────
// Domain types
//
// The active session is now a persisted draft (see useActiveWorkoutDraft) —
// its shape lives in db.ts alongside the other persisted record types.
// Re-exported here under its original name so existing imports throughout
// the workout feature don't need to change.
// ─────────────────────────────────────────────────────────────────────────────

export type {
  ActiveWorkoutDraft as ActiveSession,
  ActiveSessionExercise,
  IntervalTimerState,
} from "@/lib/db";
import type { ActiveWorkoutDraft as ActiveSession } from "@/lib/db";

// ─────────────────────────────────────────────────────────────────────────────
// PR_CELEBRATION_VISIBLE_MS
//
// How long a live PR celebration's badge (WorkoutHUD) and exercise-card
// highlight (LiveSession) stay fully visible before starting to fade.
// Shared so the two pieces of UI — owned by separate components but
// triggered by the same event — read as one coherent moment rather than
// drifting out of sync with each other.
// ─────────────────────────────────────────────────────────────────────────────

export const PR_CELEBRATION_VISIBLE_MS = 2400;

// ─────────────────────────────────────────────────────────────────────────────
// FINISH_ANTICIPATION_MS
//
// Minimum time the Finish button stays in its "confirming" state before the
// screen swaps to Workout Complete — enforced as a floor via Promise.all
// against the real save (see WorkoutHUD's handleFinishClick), not a fixed
// delay before saving starts. A near-instant IndexedDB write shouldn't
// produce a confirm-state flash too brief to register; this guarantees a
// deliberate, consistent beat regardless of how fast the save itself is.
// ─────────────────────────────────────────────────────────────────────────────

export const FINISH_ANTICIPATION_MS = 350;

// ─────────────────────────────────────────────────────────────────────────────
// Rest timer
//
// See getRestDurationSec in @/lib/exercises for how a duration is chosen
// (exercise category default, currently — per-exercise overrides and a
// user-facing preference are future work, deliberately not built yet).
// This file only owns the timer's mechanics: starting it with whatever
// duration the caller passes in, extending, and auto-hiding.
// ─────────────────────────────────────────────────────────────────────────────

export const REST_EXTEND_SEC = 30;
/** How long "✓ Ready" stays visible before the timer hides itself and the
 *  HUD returns to normal — measured from the moment the countdown reaches
 *  zero, not from when the row first appeared. Mid-range of the requested
 *  20–30s window. */
export const REST_AUTO_HIDE_SEC = 25;

export function startRestTimer(durationSec: number = DEFAULT_REST_DURATION_SEC): RestTimerState {
  return { endsAt: Date.now() + durationSec * 1000, durationSec };
}

// ─────────────────────────────────────────────────────────────────────────────
// sessionHasData
//
// Whether a session has anything worth keeping — i.e. at least one set
// that's completed or has a non-zero weight/reps/duration entered. The one
// place both handleFinish's save-vs-discard-empty check and its
// cancel-vs-silently-clear check go through, so the two can't drift out of
// sync the way they had before this was extracted.
// ─────────────────────────────────────────────────────────────────────────────

export function sessionHasData(active: ActiveSession): boolean {
  if (active.circuit) return active.circuit.state !== undefined;
  return active.exercises.some((e) =>
    e.sets.some(
      (s) =>
        s.completed ||
        (Number(s.weight) || 0) > 0 ||
        (Number(s.reps) || 0) > 0 ||
        (Number(s.duration) || 0) > 0,
    ),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// detectRoutineChange
//
// Compares the routine a workout was started from against the exercise list
// it actually finished with — order, additions, and removals all count.
// Returns true when they differ at all, false when the workout's exercise
// list is identical (same exercises, same order) to the routine it started
// from. Building the actual updated RoutineExercise[] (including seeding
// target sets for anything newly added) happens where this is resolved —
// see resolvePendingRoutineUpdate in _app.workout.tsx.
// ─────────────────────────────────────────────────────────────────────────────

export function detectRoutineChange(
  routine: Routine,
  finishedExercises: WorkoutExerciseLog[],
): boolean {
  const originalIds = routine.exercises.map((e) => e.exerciseId);
  const finalIds = finishedExercises.map((e) => e.exerciseId);
  if (originalIds.length !== finalIds.length) return true;
  return !originalIds.every((id, i) => id === finalIds[i]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Progression suggestions — see @/lib/progressionSuggestions for the
// decision logic; this is the glue reading real Routine/Workout data into
// it. Only ever checked when detectRoutineChange() above is false — an
// exercise-list change and a progression suggestion are kept mutually
// exclusive so a workout never surfaces two completion prompts at once.
// See resolvePendingProgressionSuggestion in _app.workout.tsx.
// ─────────────────────────────────────────────────────────────────────────────

/** Reduces one exercise's logged sets to the single point the progression
 *  check reasons about: whichever weight most of the completed sets used,
 *  and the worst (lowest) rep count among sets at that weight — the
 *  binding number, since every set needs to clear a bar for it to count. */
function sessionPoint(log: WorkoutExerciseLog): { weight: number; worstReps: number } | null {
  const completed = log.sets.filter((s) => s.completed && s.weight > 0);
  if (completed.length === 0) return null;

  const counts = new Map<number, number>();
  for (const s of completed) counts.set(s.weight, (counts.get(s.weight) ?? 0) + 1);
  let dominantWeight = completed[0].weight;
  let bestCount = 0;
  for (const [weight, count] of counts) {
    if (count > bestCount) {
      dominantWeight = weight;
      bestCount = count;
    }
  }

  const repsAtWeight = completed.filter((s) => s.weight === dominantWeight).map((s) => s.reps);
  return { weight: dominantWeight, worstReps: Math.min(...repsAtWeight) };
}

/** Checks every weighted exercise in `routine` against how it went in
 *  `finishedWorkout` and its most recent prior session (found by scanning
 *  `allWorkouts`, newest first), returning the first qualifying
 *  suggestion. Duration-based and circuit exercises aren't evaluated —
 *  only ones with a routine-defined target weight and reps. */
export function findProgressionSuggestion(
  routine: Routine,
  finishedWorkout: Workout,
  allWorkouts: Workout[],
): ProgressionSuggestion | null {
  for (const exercise of routine.exercises) {
    const target = exercise.sets[0];
    if (!target?.targetWeight || !target?.targetReps) continue;

    const finishedLog = finishedWorkout.exercises.find((e) => e.exerciseId === exercise.exerciseId);
    const latest = finishedLog ? sessionPoint(finishedLog) : null;
    if (!latest) continue;

    let previous: { weight: number; worstReps: number } | undefined;
    for (const w of allWorkouts) {
      if (w.id === finishedWorkout.id) continue;
      const log = w.exercises.find((e) => e.exerciseId === exercise.exerciseId);
      const point = log ? sessionPoint(log) : null;
      if (point) {
        previous = point;
        break;
      }
    }

    const suggestion = evaluateExerciseProgression(
      exercise.exerciseId,
      target.targetReps,
      exercise.progressionState,
      previous,
      latest,
      Date.now(),
    );
    if (suggestion) return suggestion;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Set factory helpers
// ─────────────────────────────────────────────────────────────────────────────

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `s_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function makeSet(): LiveWorkoutSet {
  return { id: newId(), weight: 0, reps: 0, duration: 0, completed: false, timerStart: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// doSaveWorkout
//
// Persists the completed session to IndexedDB and records any new PRs.
// A brand-new workout only ever adds data on top of an already-consistent
// history, so the incremental "does this beat the current best" check
// (recordNewWorkoutPRs) remains correct and sufficient here — unlike edits,
// deletes, or imports, nothing here can retract an existing PR, so there's
// no need for a full rebuild on this path.
//
// Kept outside components so it is independently testable and has no
// React dependency.
// ─────────────────────────────────────────────────────────────────────────────

export async function doSaveWorkout(
  exercises: WorkoutExerciseLog[],
  active: ActiveSession,
  setActive: (v: null) => void,
  setSummary: (w: Workout) => void,
  setSaveErrorDialogOpen: (v: boolean) => void,
  setCompletionMessage: (m: CompletionMessage) => void,
): Promise<void> {
  const startedSavingAt = Date.now();
  const endedAt = startedSavingAt;
  const workout: Workout = {
    routineId: active.routine?.id,
    name: active.name,
    startedAt: active.startedAt,
    endedAt,
    durationSec: Math.max(1, Math.round((endedAt - active.startedAt) / 1000)),
    exercises,
    circuit: active.circuit
      ? {
          config: active.circuit.config,
          // "Fully completed" rounds only — round N isn't counted until
          // its last station's rest has actually finished (see
          // CircuitTimer's advance()), so a session stopped mid-round
          // reports the last round it *finished*, not the one it was in
          // the middle of. Clamped to config.rounds for the done case,
          // where state.round is deliberately left one past the max.
          roundsCompleted: Math.min(
            active.circuit.config.rounds,
            Math.max(0, (active.circuit.state?.round ?? 1) - 1),
          ),
        }
      : undefined,
  };
  try {
    const db = getDb();
    let workoutId!: number;
    // Saving the workout and recording its PRs happen in one transaction —
    // if PR recording fails, the workout save rolls back too, rather than
    // leaving a saved workout with incomplete PR data.
    await db.transaction("rw", db.workouts, db.prHistory, async () => {
      workoutId = (await db.workouts.add(workout)) as number;
      await recordNewWorkoutPRs({ ...workout, id: workoutId });
    });
    const savedWorkout = { ...workout, id: workoutId };
    const hasPR = (await db.prHistory.where("workoutId").equals(workoutId).count()) > 0;
    const completionMessage = await selectCompletionMessage(savedWorkout, hasPR);
    // This is what actually triggers the screen swap (via setActive/
    // setSummary below) — a WorkoutHUD-local timer has no influence over
    // when THIS fires, so the Finish button's anticipation floor has to be
    // enforced right here. A local IndexedDB write typically resolves in a
    // handful of ms, so without this the swap would happen almost
    // instantly regardless of whatever the button itself is displaying.
    // Measured against real elapsed time so a save that's already slower
    // than the floor doesn't get an unnecessary extra delay stacked on top.
    const elapsed = Date.now() - startedSavingAt;
    if (elapsed < FINISH_ANTICIPATION_MS) {
      await new Promise((resolve) => setTimeout(resolve, FINISH_ANTICIPATION_MS - elapsed));
    }
    setActive(null);
    setCompletionMessage(completionMessage);
    setSummary(savedWorkout);
    haptics.workoutFinish();
  } catch (err) {
    console.error("Failed to save workout", err);
    setSaveErrorDialogOpen(true);
    haptics.error();
  }
}
