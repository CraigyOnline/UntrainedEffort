import { getDb, type Workout, type WorkoutExerciseLog, type LiveWorkoutSet } from "@/lib/db";
import { recordNewWorkoutPRs } from "@/lib/workoutIntegrity";
import { haptics } from "@/lib/haptics";

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
// sessionHasData
//
// Whether a session has anything worth keeping — i.e. at least one set
// that's completed or has a non-zero weight/reps/duration entered. The one
// place both handleFinish's save-vs-discard-empty check and its
// cancel-vs-silently-clear check go through, so the two can't drift out of
// sync the way they had before this was extracted.
// ─────────────────────────────────────────────────────────────────────────────

export function sessionHasData(active: ActiveSession): boolean {
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
): Promise<void> {
  const endedAt = Date.now();
  const workout: Workout = {
    routineId: active.routine?.id,
    name: active.name,
    startedAt: active.startedAt,
    endedAt,
    durationSec: Math.max(1, Math.round((endedAt - active.startedAt) / 1000)),
    exercises,
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
    setActive(null);
    setSummary({ ...workout, id: workoutId });
    haptics.workoutFinish();
  } catch (err) {
    console.error("Failed to save workout", err);
    setSaveErrorDialogOpen(true);
    haptics.error();
  }
}
