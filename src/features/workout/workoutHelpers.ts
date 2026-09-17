import {
  getDb,
  type Workout,
  type WorkoutExerciseLog,
  type LiveWorkoutSet,
  type Routine,
  type RoutineExercise,
  type RestTimerState,
} from "@/lib/db";
import { DEFAULT_REST_DURATION_SEC } from "@/lib/exercises";
import { recordNewWorkoutPRs } from "@/lib/workoutIntegrity";
import { haptics } from "@/lib/haptics";
import { selectCompletionMessage, type CompletionMessage } from "@/lib/completionMessages";
import { formatWeight, getWeightUnit } from "@/lib/units";
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
// Pause / resume
//
// pauseSession freezes the workout-wide clock (see ActiveWorkoutDraft.
// pausedAt in db.ts) and stops any actively-running per-set timer exactly
// as if its own toggle had been tapped — folding the elapsed time into
// `duration`, same as toggleTimerValue in LiveSession.tsx — so a held
// Side-Plank-style set doesn't silently keep accumulating time while the
// workout is paused and the screen is locked.
//
// It deliberately does NOT touch restTimer or any exercise's
// intervalState — those are left exactly as they were, and resumeSession
// below nudges their endsAt forward by however long the pause lasted
// instead. That's simpler than converting them through their own separate
// `{kind: "paused", remaining}` representation (which both already have,
// for a user's own independent per-exercise pause — see IntervalTimer.tsx/
// CircuitTimer.tsx), and it correctly leaves alone a timer someone had
// deliberately paused themselves before pausing the whole workout —
// resuming the workout should not also resume that.
//
// Circuit sessions never reach either of these: a circuit's `exercises` is
// always [] (see ActiveWorkoutDraft.circuit), and CircuitHUD has no pause
// button of its own, so `circuit.state`'s own running timer is out of
// scope here rather than silently mishandled.
// ─────────────────────────────────────────────────────────────────────────────

function stopRunningTimer<T extends { timerStart?: number | null; duration?: number }>(
  current: T,
): T {
  if (current.timerStart == null) return current;
  return {
    ...current,
    timerStart: null,
    duration:
      (Number(current.duration) || 0) + Math.round((Date.now() - current.timerStart) / 1000),
  };
}

function stopRunningSetTimers(sets: LiveWorkoutSet[]): LiveWorkoutSet[] {
  return sets.map((s) => {
    const stopped = stopRunningTimer(s);
    if (!s.additionalPerformances) return stopped;
    return { ...stopped, additionalPerformances: s.additionalPerformances.map(stopRunningTimer) };
  });
}

export function pauseSession(session: ActiveSession): ActiveSession {
  return {
    ...session,
    pausedAt: Date.now(),
    exercises: session.exercises.map((ex) => ({ ...ex, sets: stopRunningSetTimers(ex.sets) })),
  };
}

/** How much paused time to fold into the workout's clock as of `asOf` —
 *  everything already accumulated from earlier pauses, plus whatever
 *  pause is still in progress if the session hasn't been resumed yet.
 *  Used by resumeSession below (asOf = Date.now()) and by doSaveWorkout
 *  (asOf = the moment the workout was finished), so a workout ended while
 *  still paused doesn't count that final stretch as active time either. */
export function totalPausedMsAsOf(
  session: Pick<ActiveSession, "pausedAt" | "totalPausedMs">,
  asOf: number,
): number {
  return (session.totalPausedMs ?? 0) + (session.pausedAt != null ? asOf - session.pausedAt : 0);
}

export function resumeSession(session: ActiveSession): ActiveSession {
  if (session.pausedAt == null) return session;
  const pausedForMs = Date.now() - session.pausedAt;
  return {
    ...session,
    pausedAt: null,
    totalPausedMs: (session.totalPausedMs ?? 0) + pausedForMs,
    restTimer: session.restTimer
      ? { ...session.restTimer, endsAt: session.restTimer.endsAt + pausedForMs }
      : session.restTimer,
    exercises: session.exercises.map((ex) =>
      ex.intervalState?.status.kind === "running"
        ? {
            ...ex,
            intervalState: {
              ...ex.intervalState,
              status: {
                ...ex.intervalState.status,
                endsAt: ex.intervalState.status.endsAt + pausedForMs,
              },
            },
          }
        : ex,
    ),
  };
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
 *  every qualifying exercise, not just the first — see
 *  ProgressionSuggestionsDialog, which lets each be accepted or snoozed
 *  independently. Duration-based and circuit exercises aren't evaluated —
 *  only ones with a routine-defined target weight and reps. */
export function findProgressionSuggestions(
  routine: Routine,
  finishedWorkout: Workout,
  allWorkouts: Workout[],
): ProgressionSuggestion[] {
  const suggestions: ProgressionSuggestion[] = [];
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
    if (suggestion) suggestions.push(suggestion);
  }
  return suggestions;
}

/** One-line summary of what a suggestion proposes, for anywhere it needs
 *  to be named outside its own dialog — the cross-routine update picker
 *  and the Overview page's Recommendations section. */
export function describeProposedValue(suggestion: ProgressionSuggestion): string {
  if (suggestion.kind === "add-reps") return `${suggestion.proposedReps} reps`;
  if (suggestion.kind === "ease-off")
    return formatWeight(suggestion.proposedWeight, getWeightUnit());
  return `${formatWeight(suggestion.proposedWeight, getWeightUnit())} × ${suggestion.proposedReps} reps`;
}

/** Returns `exercises` with one entry updated to accept `suggestion`:
 *  target weight/reps move to the proposed values, progressionState
 *  advances, and any pendingSuggestion sitting there is cleared. Pure —
 *  callers persist the result themselves (routines.update), so several
 *  suggestions for the same routine can be folded into one write instead
 *  of one write per suggestion. The single place every acceptance path
 *  (the post-workout dialog, its cross-routine follow-up, and the
 *  Overview page) goes through, so they can't drift out of sync. */
export function withProgressionSuggestionApplied(
  exercises: RoutineExercise[],
  suggestion: ProgressionSuggestion,
): RoutineExercise[] {
  return exercises.map((e) =>
    e.exerciseId === suggestion.exerciseId
      ? {
          ...e,
          sets: e.sets.map((s) => ({
            ...s,
            targetWeight: suggestion.proposedWeight,
            targetReps: suggestion.proposedReps,
          })),
          progressionState: suggestion.nextState,
          pendingSuggestion: undefined,
        }
      : e,
  );
}

/** Returns `exercises` with one entry updated for a decision NOT to
 *  apply `suggestion`: progressionState still advances (so
 *  evaluateExerciseProgression's anti-repeat check works next time) but
 *  the actual target is untouched. `keepAsPending` stashes the
 *  suggestion as pendingSuggestion so the Overview page can offer it
 *  again later — true when snoozing from the post-workout dialog, false
 *  when explicitly dismissed from Overview, since it's already been
 *  seen and declined there. */
export function withProgressionSuggestionSnoozed(
  exercises: RoutineExercise[],
  suggestion: ProgressionSuggestion,
  keepAsPending: boolean,
): RoutineExercise[] {
  return exercises.map((e) =>
    e.exerciseId === suggestion.exerciseId
      ? {
          ...e,
          progressionState: suggestion.nextState,
          pendingSuggestion: keepAsPending ? suggestion : undefined,
        }
      : e,
  );
}

/** How long a routine can go unused and still be offered in the
 *  cross-routine update picker without being tucked behind "show excluded
 *  routines" — see UpdateOtherRoutinesDialog. A plain, easily-tuned
 *  constant rather than anything derived from a routine's own cadence. */
export const RECENT_ROUTINE_WINDOW_DAYS = 60;

export interface OtherRoutineOption {
  routine: Routine;
  currentWeight: number;
  currentReps: number;
  /** Days since this routine was last used, or null if it never has been. */
  daysSinceLastUsed: number | null;
}

/** Every other routine (besides `sourceRoutineId`) with a weighted,
 *  non-circuit entry for `exerciseId`, each annotated with its current
 *  target and how long it's been since it was last used. `lastUsedByRoutine`
 *  is the same routineId → most-recent-startedAt map _app.workout.tsx
 *  already builds from allWorkouts. Circuit routines fall out naturally —
 *  their `exercises` list is always empty. */
export function findOtherRoutinesForExercise(
  exerciseId: string,
  sourceRoutineId: number,
  allRoutines: Routine[],
  lastUsedByRoutine: Map<number, number>,
): OtherRoutineOption[] {
  const now = Date.now();
  const options: OtherRoutineOption[] = [];
  for (const routine of allRoutines) {
    if (routine.id == null || routine.id === sourceRoutineId) continue;
    const exercise = routine.exercises.find((e) => e.exerciseId === exerciseId);
    const target = exercise?.sets[0];
    if (!target?.targetWeight || !target?.targetReps) continue;

    const lastUsed = lastUsedByRoutine.get(routine.id);
    options.push({
      routine,
      currentWeight: target.targetWeight,
      currentReps: target.targetReps,
      daysSinceLastUsed: lastUsed == null ? null : Math.floor((now - lastUsed) / 86_400_000),
    });
  }
  return options;
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
  // Finishing without resuming first (Finish is reachable from behind the
  // paused overlay) must not count that final paused stretch as active
  // time — totalPausedMsAsOf folds it in the same way resumeSession would.
  const pausedMs = totalPausedMsAsOf(active, endedAt);
  const workout: Workout = {
    routineId: active.routine?.id,
    name: active.name,
    startedAt: active.startedAt,
    endedAt,
    durationSec: Math.max(1, Math.round((endedAt - active.startedAt - pausedMs) / 1000)),
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
