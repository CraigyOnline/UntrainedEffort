import Dexie, { type Table } from "dexie";
import type { IntervalConfig, SetSide } from "@/lib/exercises";

/**
 * ROUTINES
 */
export interface RoutineSet {
  targetWeight?: number;
  targetReps?: number;
  targetDuration?: number;
}

export interface RoutineExercise {
  exerciseId: string;
  /** Ordered list of target sets. Length determines how many set rows are created when starting a workout. */
  sets: RoutineSet[];
}

export interface Routine {
  id?: number;
  name: string;
  exercises: RoutineExercise[];
  createdAt: number;
  /** Manual display order — lower sorts first. The sole canonical ordering
   *  for routine lists. */
  sortOrder?: number;
}

/**
 * WORKOUTS
 */
export interface WorkoutSet {
  id?: string;
  weight: number;
  reps: number;
  duration?: number;
  completed: boolean;
  /** The interval configuration actually performed, for an interval
   *  exercise's single completed set. Recorded at completion time so
   *  history reflects what was actually done even if the exercise's
   *  default interval config changes afterward. */
  intervalConfig?: IntervalConfig;
  /** For a unilateral exercise, every performance beyond the first
   *  (weight/reps/duration above) — one entry per additional side, in
   *  performed order. Absent for every non-unilateral exercise, and for
   *  any unilateral set recorded before this field existed. This is a
   *  generic collection rather than fixed left/right fields: nothing in
   *  the data model knows or cares about "left"/"right" — those are
   *  display labels only, applied by position when rendering (see
   *  setPerformances/formatCompletedSet in exercises.ts). A two-sided
   *  exercise has exactly one entry here today, but a rare 3+-sided
   *  movement would need no schema change. */
  additionalPerformances?: SetSide[];
}

export interface WorkoutExerciseLog {
  exerciseId: string;
  sets: WorkoutSet[];
}

export interface Workout {
  id?: number;
  routineId?: number;
  name: string;
  startedAt: number;
  endedAt: number;
  durationSec: number;
  exercises: WorkoutExerciseLog[];
}

/**
 * PR SYSTEM
 */
export interface PRRecord {
  id?: number;
  exerciseId: string;
  type: "weight" | "reps" | "time";
  value: number;
  /** Which side this PR belongs to, for a unilateral exercise — a
   *  positional index matching setPerformances (0 = first/left, 1 =
   *  second/right, ...). Absent for every non-unilateral exercise, so a
   *  unilateral and non-unilateral PR for the same exercise+type can
   *  never collide. prHistory is fully rebuilt from `workouts` by
   *  syncWorkoutIntegrity, so adding this needs no migration of existing
   *  rows — they simply have no side, meaning "the aggregate/only side",
   *  which is exactly what they already meant. */
  side?: number;
  /** Previous best before this PR. 0 for the first-ever PR of this exercise+type. */
  previousBest: number;
  /** Improvement over the previous best. Equals value for the first-ever PR. */
  delta: number;
  workoutId?: number;
  createdAt: number;
}

/**
 * ACTIVE WORKOUT DRAFT
 *
 * The one and only source of truth for an in-progress workout — a session
 * that hasn't been finished (and so isn't in `workouts` yet) but needs to
 * survive navigation, the Android back button, and the app being killed
 * and reopened. See useActiveWorkoutDraft for the persistence strategy;
 * this file only owns the shape of the data.
 */
export interface IntervalTimerState {
  /** 1-indexed. round > config.rounds means the interval is complete —
   *  there's deliberately no separate "done" flag to keep in sync. */
  round: number;
  phase: "work" | "rest";
  status:
    | { kind: "running"; endsAt: number } // absolute epoch ms deadline for the current phase
    | { kind: "paused"; remaining: number }; // seconds left in the current phase
}

/**
 * A WorkoutSet as it exists during a live, in-progress workout — adds an
 * ephemeral `timerStart` (an absolute epoch timestamp, or null/absent
 * when not running) that a timed exercise's set uses while its timer is
 * running. Never part of the persisted WorkoutSet; stripped back down
 * before a workout is saved to history (see handleFinish in
 * _app.workout.tsx).
 *
 * For a unilateral exercise, `additionalPerformances` entries get the
 * same ephemeral field — a timed unilateral set (e.g. Side Plank) has two
 * independent timers, one per side, and this is the one place both are
 * defined. Previously this shape was hand-written as an inline
 * intersection in three separate places (this interface, LiveSession's
 * undo generic, and updateSet's patch type); consolidated here so
 * there's one name for it instead of three copies that could drift.
 */
export type LiveWorkoutSet = Omit<WorkoutSet, "additionalPerformances"> & {
  timerStart?: number | null;
  additionalPerformances?: Array<SetSide & { timerStart?: number | null }>;
};

export interface ActiveSessionExercise {
  exerciseId: string;
  sets: LiveWorkoutSet[];
  /** Overrides this exercise's default interval config (rounds/work/rest)
   *  for this workout only — never written back to the exercise catalog.
   *  Absent means "use getIntervalConfig(def)". Editable only before the
   *  timer is first started (see intervalState below). */
  intervalConfig?: IntervalConfig;
  /** Absent until the user first presses Start on this exercise's interval
   *  timer — that absence *is* the "not started yet" state, rather than a
   *  separate flag that could drift out of sync with it. */
  intervalState?: IntervalTimerState;
}

/**
 * A single, workout-wide rest timer — started/restarted whenever a set is
 * completed (see LiveSession's toggleSetCompletion). `endsAt` is the same
 * "absolute epoch ms" shape IntervalTimerState's `running` status uses
 * above, for the same reason: a live countdown only needs `Date.now()`
 * compared against one fixed point, with no separate "remaining seconds"
 * value that could drift out of sync with it.
 *
 * `durationSec` is the total length this rest period was started (or
 * extended) to — RestTimer's progress bar is the only reader, dividing
 * remaining-time by this to get a fill fraction. Extending (+30s) bumps
 * both `endsAt` and `durationSec` together, so the bar's 0-100% range
 * always reflects the currently-agreed-on rest length, not the original
 * one.
 *
 * Stays set past `endsAt` — the HUD reads that as "✓ Ready" — until either
 * a new set completes (replaces it) or the workout ends (the whole draft,
 * this field included, goes away). Absent means no rest is in progress or
 * has finished yet this workout.
 */
export interface RestTimerState {
  endsAt: number;
  durationSec: number;
  /** Which exercise this rest is for, captured by toggleSetCompletion at
   *  the moment the timer starts — the exercise that had a set just
   *  completed. RestTimer displays this exercise's name so it's never
   *  ambiguous which exercise a rest is for if someone's scrolled to a
   *  different one, and it's what a future duration-override edit would
   *  key off of. Optional only so a rest timer already in progress at the
   *  moment this field was introduced (an old persisted activeWorkout
   *  row) doesn't crash — RestTimer falls back to a plain "Recovering"
   *  label when absent; every rest started after this field existed
   *  always sets it. */
  exerciseId?: string;
}

export interface ActiveWorkoutDraft {
  /** Assigned by Dexie's auto-increment; nothing outside the persistence
   *  hook ever reads or relies on it. The table is kept at zero or one
   *  rows by construction, so there's no fixed singleton key to hardcode
   *  anywhere — "no active workout" is just an empty table. */
  id?: number;
  routine: Routine | null;
  name: string;
  startedAt: number;
  exercises: ActiveSessionExercise[];
  /** Absent until the first set of the workout is completed. See
   *  RestTimerState for lifecycle. */
  restTimer?: RestTimerState;
  /** Keys (see prKey() in workoutIntegrity.ts) of live PRs already
   *  celebrated during this workout session. This is what makes a live
   *  celebration fire once per workout rather than once per LiveSession
   *  component instance: it's part of the same persisted draft every
   *  other session field already rides through
   *  (useActiveWorkoutDraft's debounced write), so it survives
   *  navigating away and back or an app restart's recovery the same way
   *  the sets themselves do. Absent/empty means nothing has been
   *  celebrated yet. Never written to prHistory or the saved workout —
   *  purely a live-session record for the celebration UI, same as
   *  everything else stripped by handleFinish. */
  celebratedPRKeys?: string[];
}

/**
 * A user's own settings for one exercise, keyed by exerciseId — the home
 * for anything a person customizes about an exercise itself, as opposed
 * to a single workout or set. `restDurationSec` is the only field built
 * so far (an explicit override ahead of getRestDurationSec's category/
 * global defaults — see that function's priority chain in exercises.ts).
 * Named for what it holds rather than "Prefs" specifically because this
 * is meant to be the eventual home for other per-exercise, user-owned
 * settings too (e.g. a personal note, a favorite flag) — nothing beyond
 * restDurationSec is built yet, so nothing else is declared here ahead of
 * actually being needed. A row only exists for exercises someone has
 * actually customized; no row (or an absent restDurationSec on one) means
 * "use the automatic default," identically to a bare `undefined`.
 */
export interface ExerciseSettings {
  exerciseId: string;
  restDurationSec?: number;
}

/**
 * DATABASE
 */
export class AppDB extends Dexie {
  routines!: Table<Routine, number>;
  workouts!: Table<Workout, number>;
  prHistory!: Table<PRRecord, number>;
  activeWorkout!: Table<ActiveWorkoutDraft, number>;
  exerciseSettings!: Table<ExerciseSettings, string>;

  constructor() {
    super("untrained-effort-db");

    this.version(1).stores({
      routines: "++id, name, createdAt, sortOrder",
      workouts: "++id, startedAt, routineId",
      prHistory: "++id, exerciseId, type, value, workoutId, createdAt",
    });

    // Tables not mentioned here carry forward unchanged from version 1.
    this.version(2).stores({
      activeWorkout: "++id",
    });

    // exerciseId is the primary key directly (not auto-incrementing) since
    // there's naturally at most one settings row per exercise.
    this.version(3).stores({
      exerciseSettings: "exerciseId",
    });
  }
}

let _db: AppDB | null = null;

export function getDb(): AppDB {
  if (typeof window === "undefined") {
    throw new Error("DB is only available in the browser");
  }

  if (!_db) {
    try {
      _db = new AppDB();
    } catch (err) {
      throw new Error(
        `Failed to initialise database. IndexedDB may be unavailable (e.g. private browsing mode). Original error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return _db;
}
