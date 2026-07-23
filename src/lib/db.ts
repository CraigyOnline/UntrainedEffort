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
}

/**
 * DATABASE
 */
export class AppDB extends Dexie {
  routines!: Table<Routine, number>;
  workouts!: Table<Workout, number>;
  prHistory!: Table<PRRecord, number>;
  activeWorkout!: Table<ActiveWorkoutDraft, number>;

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
        `Failed to initialise database. IndexedDB may be unavailable (e.g. private browsing mode). Original error: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return _db;
}
