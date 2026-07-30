import { formatDuration } from "@/lib/format";

export type MuscleGroup =
  | "Chest"
  | "Shoulders"
  | "Biceps"
  | "Triceps"
  | "Forearms"
  | "Abs"
  | "Obliques"
  | "Lats"
  | "UpperBack"
  | "LowerBack"
  | "Glutes"
  | "Quads"
  | "Hamstrings"
  | "Calves"
  | "Cardio";

export type Equipment =
  | "Barbell"
  | "Dumbbell"
  | "Machine"
  | "Cable"
  | "Bodyweight"
  | "Kettlebell"
  | "Band"
  | "Cardio"
  | "Other";

/** Rounds/work/rest for an interval (HIIT-style) exercise. The one named
 *  shape for this used everywhere it appears — the exercise catalog's
 *  defaults, a per-workout override, and what's recorded in history. */
export interface IntervalConfig {
  rounds: number;
  workSeconds: number;
  restSeconds: number;
}

/** One side's performance values — see setPerformances below for why this
 *  exists and where "left"/"right" actually come from (nowhere in here). */
export interface SetSide {
  weight: number;
  reps: number;
  duration?: number;
}

export interface ExerciseDef {
  id: string;
  name: string;
  muscle: MuscleGroup;
  secondary?: MuscleGroup[];
  equipment: Equipment;

  /** Alternative names, abbreviations, and common spellings this exercise
   *  should also be found under in search (e.g. "OHP", "RDL", "DB Bench").
   *  The canonical `name` is always what's displayed — aliases only affect
   *  matching, never rendering. Optional and backwards compatible: existing
   *  exercises with no aliases behave exactly as before. */
  aliases?: string[];

  /** cardio-style (treadmill, rowing) — uses time + optional distance */
  cardio?: boolean;
  /** time-based (planks, holds) — uses duration instead of reps */
  time?: boolean;
  /** interval/HIIT default config — drives an auto interval timer on
   *  workout screen. A single workout may override this for itself; see
   *  getIntervalConfig, ActiveSessionExercise.intervalConfig, and
   *  WorkoutSet.intervalConfig. */
  interval?: IntervalConfig;
  /** Done one side at a time (single-arm row, Bulgarian split squat, side
   *  plank) rather than both sides together. Independent of cardio/time/
   *  interval above — a unilateral exercise can be weight+reps or a timed
   *  hold. See isUnilateral, ExerciseLoggingSchema.unilateral, and
   *  WorkoutSet.additionalPerformances. */
  unilateral?: boolean;
}

const E = (
  id: string,
  name: string,
  muscle: MuscleGroup,
  equipment: Equipment,
  secondary: MuscleGroup[] = [],
  opts: {
    cardio?: boolean;
    time?: boolean;
    interval?: IntervalConfig;
    unilateral?: boolean;
    aliases?: string[];
  } = {},
): ExerciseDef => ({
  id,
  name,
  muscle,
  equipment,
  secondary,
  cardio: opts.cardio,
  time: opts.time,
  interval: opts.interval,
  unilateral: opts.unilateral,
  aliases: opts.aliases,
});

export const EXERCISES: ExerciseDef[] = [
  // Chest
  E("bench-press", "Bench Press (Barbell)", "Chest", "Barbell", ["Triceps", "Shoulders"], { aliases: ["Bench Press", "Barbell Bench Press", "Flat Barbell Bench Press", "Flat Bench Press", "BB Bench"] }),
  E("incline-bench", "Incline Bench Press (Barbell)", "Chest", "Barbell", ["Shoulders", "Triceps"], { aliases: ["Incline Bench Press", "Incline Barbell Bench Press", "BB Incline Bench"] }),
  E("db-bench-press", "Dumbbell Bench Press", "Chest", "Dumbbell", ["Triceps", "Shoulders"], { aliases: ["DB Bench", "DB Bench Press", "Flat Dumbbell Bench Press", "Flat DB Bench"] }),
  E("incline-db-bench-press", "Incline Dumbbell Bench Press", "Chest", "Dumbbell", ["Shoulders", "Triceps"], { aliases: ["Incline DB Bench", "Incline DB Bench Press"] }),
  E("floor-press", "Floor Press", "Chest", "Barbell", ["Triceps"], { aliases: ["Barbell Floor Press", "BB Floor Press"] }),
  E("db-floor-press", "Dumbbell Floor Press", "Chest", "Dumbbell", ["Triceps"], { aliases: ["DB Floor Press"] }),
  E("chest-fly", "Chest Fly (Dumbbell)", "Chest", "Dumbbell", [], { aliases: ["Dumbbell Fly", "DB Fly", "Chest Flye", "Pec Fly"] }),
  E("db-pullover", "Dumbbell Pullover", "Chest", "Dumbbell", ["Lats", "Triceps"], { aliases: ["DB Pullover"] }),
  E("cable-crossover", "Cable Crossover", "Chest", "Cable", [], { aliases: ["Cable Fly", "Cable Crossovers"] }),
  E("push-up", "Push Up", "Chest", "Bodyweight", ["Triceps", "Shoulders"], { aliases: ["Pushup", "Push-up", "Press Up"] }),
  E("dip", "Chest Dip", "Chest", "Bodyweight", ["Triceps", "Shoulders"], { aliases: ["Dips", "Chest Dips", "Parallel Bar Dip"] }),

  // Back
  E("deadlift", "Deadlift (Barbell)", "LowerBack", "Barbell", ["Glutes", "Hamstrings", "Quads", "UpperBack", "Forearms"], { aliases: ["Deadlift", "Barbell Deadlift", "DL", "Conventional Deadlift"] }),
  E("romanian-deadlift", "Romanian Deadlift", "Hamstrings", "Barbell", ["Glutes", "LowerBack"], { aliases: ["RDL", "Romanian Deadlifts", "Stiff Leg Deadlift"] }),
  E("single-leg-romanian-deadlift", "Single-leg Romanian Deadlift", "Hamstrings", "Dumbbell", ["Glutes", "LowerBack"], { unilateral: true, aliases: ["Single-leg RDL", "Single Leg RDL", "SL RDL", "Unilateral RDL"] }),
  E("pull-up", "Pull Up", "Lats", "Bodyweight", ["UpperBack", "Biceps"], { aliases: ["Pullup", "Pull-up", "Wide Grip Pull Up"] }),
  E("chin-up", "Chin Up", "Lats", "Bodyweight", ["UpperBack", "Biceps"], { aliases: ["Chinup", "Chin-up", "Underhand Pull Up"] }),
  E("lat-pulldown", "Lat Pulldown", "Lats", "Cable", ["UpperBack", "Biceps"], { aliases: ["Lat Pull Down", "Lat Pulldowns", "Cable Pulldown"] }),
  E("seated-row", "Seated Cable Row", "UpperBack", "Cable", ["Lats", "Biceps"], { aliases: ["Cable Row", "Seated Row"] }),
  E("single-arm-cable-row", "Single-arm Cable Row", "UpperBack", "Cable", ["Lats", "Biceps"], { unilateral: true, aliases: ["Single Arm Cable Row", "Unilateral Cable Row"] }),
  E("db-row", "Dumbbell Row", "Lats", "Dumbbell", ["UpperBack", "Biceps"], { unilateral: true, aliases: ["DB Row", "One Arm Dumbbell Row", "Single Arm Dumbbell Row"] }),
  E("chest-supported-db-row", "Chest Supported Dumbbell Row", "UpperBack", "Dumbbell", ["Lats", "Shoulders", "Biceps"], { aliases: ["Incline Dumbbell Row", "Chest Supported Incline Row", "Incline Bench Dumbbell Row", "Chest Supported Row"] }),
  E("barbell-row", "Barbell Row", "UpperBack", "Barbell", ["Lats", "Biceps"], { aliases: ["BB Row", "Bent Over Row", "Bent-over Barbell Row"] }),
  E("t-bar-row", "T-Bar Row", "UpperBack", "Barbell", ["Lats", "Biceps"], { aliases: ["T Bar Row", "TBar Row"] }),
  E("face-pull", "Face Pull", "UpperBack", "Cable", ["Shoulders", "Biceps"], { aliases: ["Face Pulls", "Cable Face Pull"] }),
  E("back-extension", "Back Extension", "LowerBack", "Bodyweight", ["Glutes", "Hamstrings"], { aliases: ["Hyperextension", "Hyperextensions", "Roman Chair Back Extension"] }),

  // Shoulders
  E("ohp", "Overhead Press (Barbell)", "Shoulders", "Barbell", ["Triceps", "UpperBack"], { aliases: ["OHP", "Military Press", "Overhead Press", "Standing Barbell Press", "Barbell Overhead Press"] }),
  E("db-shoulder-press", "Dumbbell Shoulder Press", "Shoulders", "Dumbbell", ["Triceps", "UpperBack"], { aliases: ["DB Shoulder Press", "Dumbbell Overhead Press", "DB OHP"] }),
  E("single-arm-shoulder-press", "Single-arm Shoulder Press", "Shoulders", "Dumbbell", ["Triceps", "UpperBack"], { unilateral: true, aliases: ["Single Arm Shoulder Press", "Single Arm DB Press"] }),
  E("arnold-press", "Arnold Press", "Shoulders", "Dumbbell", ["Triceps", "UpperBack"], { aliases: ["Arnold Shoulder Press"] }),
  E("lateral-raise", "Lateral Raise", "Shoulders", "Dumbbell", [], { aliases: ["Side Lateral Raise", "DB Lateral Raise", "Dumbbell Lateral Raise"] }),
  E("front-raise", "Front Raise", "Shoulders", "Dumbbell", [], { aliases: ["DB Front Raise", "Dumbbell Front Raise"] }),
  E("rear-delt-fly", "Rear Delt Reverse Fly", "Shoulders", "Dumbbell", ["UpperBack"], { aliases: ["Reverse Fly", "Rear Delt Fly", "Bent Over Rear Delt Fly"] }),
  E("incline-rear-delt-fly", "Incline Rear Delt Fly", "Shoulders", "Dumbbell", ["UpperBack"], { aliases: ["Incline Reverse Fly"] }),
  E("reverse-pec-deck", "Reverse Pec Deck", "Shoulders", "Machine", ["UpperBack"], { aliases: ["Rear Delt Machine Fly", "Reverse Fly Machine"] }),
  E("shrug", "Shrug (Dumbbell)", "UpperBack", "Dumbbell", [], { aliases: ["Dumbbell Shrug", "DB Shrug", "Shrugs"] }),

  // Arms
  E("bicep-curl-db", "Dumbbell Curl", "Biceps", "Dumbbell", [], { aliases: ["DB Curl", "Dumbbell Bicep Curl", "Standing Dumbbell Curl"] }),
  E("incline-db-curl", "Incline Dumbbell Curl", "Biceps", "Dumbbell", ["Forearms"], { aliases: ["Incline DB Curl", "Incline Bicep Curl"] }),
  E("bicep-curl-bb", "Barbell Curl", "Biceps", "Barbell", [], { aliases: ["BB Curl", "Barbell Bicep Curl", "Standing Barbell Curl"] }),
  E("hammer-curl", "Hammer Curl", "Biceps", "Dumbbell", ["Forearms"], { aliases: ["Dumbbell Hammer Curl", "Neutral Grip Curl"] }),
  E("preacher-curl", "Preacher Curl", "Biceps", "Barbell", [], { aliases: ["Preacher Bicep Curl", "Barbell Preacher Curl"] }),
  E("tricep-pushdown", "Tricep Pushdown", "Triceps", "Cable", [], { aliases: ["Triceps Pushdown", "Cable Pushdown", "Rope Pushdown"] }),
  E("overhead-tri-ext", "Overhead Tricep Extension", "Triceps", "Dumbbell", [], { aliases: ["Overhead Triceps Extension", "DB Overhead Extension", "French Press"] }),
  E("skullcrusher", "Skullcrusher", "Triceps", "Barbell", [], { aliases: ["Skull Crusher", "Lying Triceps Extension", "Barbell Skullcrusher"] }),
  E("close-grip-bench", "Close-Grip Bench Press", "Triceps", "Barbell", ["Chest"], { aliases: ["Close Grip Bench Press", "CGBP"] }),
  E("wrist-curl", "Wrist Curl", "Forearms", "Dumbbell", [], { aliases: ["Dumbbell Wrist Curl", "Forearm Curl"] }),

  // Legs
  E("back-squat", "Back Squat", "Quads", "Barbell", ["Glutes", "Hamstrings", "LowerBack", "Calves"], { aliases: ["Squat", "Barbell Squat", "Barbell Back Squat", "High Bar Squat"] }),
  E("front-squat", "Front Squat", "Quads", "Barbell", ["Glutes", "Hamstrings", "LowerBack"], { aliases: ["Barbell Front Squat"] }),
  E("goblet-squat", "Goblet Squat", "Quads", "Dumbbell", ["Glutes", "Hamstrings"], { aliases: ["DB Goblet Squat", "Dumbbell Goblet Squat"] }),
  E("leg-press", "Leg Press", "Quads", "Machine", ["Glutes", "Hamstrings"], { aliases: ["Machine Leg Press", "45 Degree Leg Press"] }),
  E("leg-extension", "Leg Extension", "Quads", "Machine", [], { aliases: ["Quad Extension", "Machine Leg Extension"] }),
  E("leg-curl", "Leg Curl", "Hamstrings", "Machine", ["Calves"], { aliases: ["Hamstring Curl", "Machine Leg Curl"] }),
  E("lunge", "Walking Lunge", "Quads", "Dumbbell", ["Glutes", "Hamstrings", "Calves"], { aliases: ["Lunges", "Dumbbell Walking Lunge", "DB Lunge"] }),
  E("bulgarian-split-squat", "Bulgarian Split Squat", "Quads", "Dumbbell", ["Glutes", "Hamstrings"], { unilateral: true, aliases: ["BSS", "Rear Foot Elevated Split Squat", "Split Squat"] }),
  E("hip-thrust", "Hip Thrust", "Glutes", "Barbell", ["Hamstrings"], { aliases: ["Barbell Hip Thrust", "BB Hip Thrust"] }),
  E("db-hip-thrust", "Dumbbell Hip Thrust", "Glutes", "Dumbbell", ["Hamstrings"], { aliases: ["DB Hip Thrust"] }),
  E("glute-bridge", "Glute Bridge", "Glutes", "Bodyweight", ["Hamstrings"], { aliases: ["Bodyweight Hip Thrust", "Bridge"] }),
  E("calf-raise", "Standing Calf Raise", "Calves", "Machine", [], { aliases: ["Calf Raise", "Calf Raises"] }),
  E("seated-calf-raise", "Seated Calf Raise", "Calves", "Machine", [], { aliases: ["Seated Calf Raises"] }),

  // Core (time-based)
  E("plank", "Plank", "Abs", "Bodyweight", ["Obliques", "Shoulders"], { time: true, aliases: ["Front Plank", "Forearm Plank"] }),
  E("side-plank", "Side Plank", "Obliques", "Bodyweight", ["Abs"], { time: true, unilateral: true, aliases: ["Side Planks"] }),
  E("dead-hang", "Dead Hang", "Forearms", "Bodyweight", ["Lats", "Biceps"], { time: true, aliases: ["Bar Hang", "Passive Hang"] }),
  E("wall-sit", "Wall Sit", "Quads", "Bodyweight", ["Glutes"], { time: true, aliases: ["Wall Squat"] }),
  E("hollow-hold", "Hollow Hold", "Abs", "Bodyweight", ["Obliques", "LowerBack"], { time: true, aliases: ["Hollow Body Hold"] }),
  E("l-sit", "L-Sit", "Abs", "Bodyweight", ["Quads", "Triceps"], { time: true, aliases: ["L Sit"] }),

  // Core (reps)
  E("crunch", "Crunch", "Abs", "Bodyweight", ["Obliques"], { aliases: ["Crunches", "Ab Crunch"] }),
  E("sit-up", "Sit Up", "Abs", "Bodyweight", ["Obliques"], { aliases: ["Situp", "Sit-up"] }),
  E("hanging-leg-raise", "Hanging Leg Raise", "Abs", "Bodyweight", ["Forearms"], { aliases: ["Hanging Knee Raise", "Leg Raise"] }),
  E("russian-twist", "Russian Twist", "Obliques", "Bodyweight", [], { aliases: ["Russian Twists"] }),
  E("ab-wheel", "Ab Wheel Rollout", "Abs", "Other", ["Obliques", "Shoulders", "Lats"], { aliases: ["Ab Roller", "Ab Wheel", "Wheel Rollout"] }),

  // Cardio (time-based)
  E("treadmill", "Treadmill Run", "Cardio", "Cardio", ["Quads", "Hamstrings", "Calves", "Glutes"], { cardio: true, time: true, aliases: ["Treadmill", "Running"] }),
  E("rowing-machine", "Rowing Machine", "Cardio", "Cardio", ["Quads", "Hamstrings", "Glutes", "UpperBack", "Lats", "Biceps", "Forearms"], { cardio: true, time: true, aliases: ["Erg", "Rower", "Row Machine"] }),
  E("stationary-bike", "Stationary Bike", "Cardio", "Cardio", ["Quads", "Hamstrings", "Calves", "Glutes"], { cardio: true, time: true, aliases: ["Exercise Bike", "Spin Bike"] }),
  E("elliptical", "Elliptical", "Cardio", "Cardio", ["Quads", "Hamstrings", "Glutes", "Calves"], { cardio: true, time: true, aliases: ["Elliptical Trainer", "Cross Trainer"] }),
  E("stair-climber", "Stair Climber", "Cardio", "Cardio", ["Glutes", "Quads", "Hamstrings", "Calves"], { cardio: true, time: true, aliases: ["Stairmaster", "Stair Stepper"] }),
  E("jump-rope", "Jump Rope", "Cardio", "Cardio", ["Calves", "Quads"], { cardio: true, time: true, aliases: ["Skipping Rope", "Jumping Rope"] }),
  E("rowing-intervals", "Rowing Intervals", "Cardio", "Cardio", ["Quads", "Hamstrings", "Glutes", "UpperBack", "Lats", "Biceps", "Forearms"], {
    interval: { rounds: 8, workSeconds: 60, restSeconds: 120 },
    aliases: ["Interval Rowing", "HIIT Rowing"],
  }),
];

export const MUSCLE_GROUPS: MuscleGroup[] = [
  "Chest",
  "Lats",
  "UpperBack",
  "LowerBack",
  "Shoulders",
  "Biceps",
  "Triceps",
  "Forearms",
  "Abs",
  "Obliques",
  "Quads",
  "Hamstrings",
  "Glutes",
  "Calves",
  "Cardio",
];

export function getExercise(id: string): ExerciseDef | undefined {
  return EXERCISES.find((e) => e.id === id);
}

/** True if a free-text query matches this exercise's canonical name or any
 *  of its aliases. The canonical name is always what's rendered — this
 *  only affects whether the exercise is found by search, not what's shown
 *  once it is. Empty query always matches (same behavior callers already
 *  relied on for "no filter applied"). */
export function matchesExerciseQuery(def: ExerciseDef, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") return true;
  if (def.name.toLowerCase().includes(q)) return true;
  return (def.aliases ?? []).some((alias) => alias.toLowerCase().includes(q));
}

/** True for cardio exercises (rowing, treadmill, etc.).
 *  Uses the domain `cardio` property, not `equipment`, which is a
 *  presentation/classification concern. */
export function isCardio(def: ExerciseDef | undefined): boolean {
  return def?.cardio === true;
}

/** True for time-tracked non-cardio exercises (planks, holds, etc.).
 *  Explicitly excludes cardio so callers don't need to check isCardio first. */
export function isTimeBased(def: ExerciseDef | undefined): boolean {
  return Boolean(def?.time) && !isCardio(def);
}

/** True for bodyweight exercises (push-ups, pull-ups, planks, etc.).
 *  Uses the domain `equipment` property. */
export function isBodyweight(def: ExerciseDef | undefined): boolean {
  return def?.equipment === "Bodyweight";
}

/** True for exercises done one side at a time (single-arm row, Bulgarian
 *  split squat, side plank) rather than both sides together. Independent
 *  of cardio/time-based/interval — a unilateral exercise can be either a
 *  weight+reps movement or a timed hold, so this is never itself a
 *  competing branch in getExerciseLoggingSchema, just folded into
 *  whichever branch applies. */
export function isUnilateral(def: ExerciseDef | undefined): boolean {
  return def?.unilateral === true;
}

/** The default interval configuration (rounds/work/rest) for an interval
 *  exercise, or undefined for any other exercise. The single source of
 *  truth for these defaults — nowhere else should read `def.interval`
 *  directly. A single workout may override this for itself without
 *  changing the default; see ActiveSessionExercise.intervalConfig and
 *  WorkoutSet.intervalConfig in db.ts. */
export function getIntervalConfig(def: ExerciseDef | undefined): IntervalConfig | undefined {
  return def?.interval;
}

/**
 * Describes how an exercise should be logged — the single source of truth
 * for which input fields a set needs. Previously, LiveSession.tsx,
 * _app.history.$id.tsx, and RoutineEditor.tsx each independently derived
 * this from isCardio/isTimeBased/isBodyweight and had drifted apart (most
 * visibly: LiveSession showed a mislabeled weight field for time-based
 * bodyweight holds like Plank, which the other two screens already
 * correctly hid). All three now read from this one function instead.
 *
 * Weight is three-state rather than a plain boolean because "does this
 * exercise use added weight" isn't yes/no — a barbell exercise requires it,
 * a bodyweight rep exercise (pull-ups) allows it optionally, and a
 * time-based hold or cardio exercise doesn't use it as a weight concept at
 * all (cardio's numeric field represents distance instead, reusing the
 * same underlying `weight` storage field).
 *
 * `interval` is its own field, checked ahead of `distance`, rather than an
 * interval exercise being folded into `distance` — an interval exercise
 * (rounds + work/rest) has no distance concept at all, and treating it as
 * cardio-with-a-distance-field is exactly what previously produced
 * meaningless "0km" displays and Km/Reps edit inputs for it throughout the
 * app. A schema is never both `interval` and `distance`.
 *
 * `unilateral` is folded into every branch (via isUnilateral) rather than
 * being a competing branch itself — a unilateral exercise can be a
 * weight+reps movement (Dumbbell Row) or a timed hold (Side Plank), so it
 * describes an orthogonal axis, not another mutually-exclusive case.
 */
export interface ExerciseLoggingSchema {
  weight: "hidden" | "optional" | "required";
  reps: boolean;
  duration: boolean;
  distance: boolean;
  interval: boolean;
  unilateral: boolean;
}

export function getExerciseLoggingSchema(def: ExerciseDef | undefined): ExerciseLoggingSchema {
  const unilateral = isUnilateral(def);
  if (!def) {
    return { weight: "hidden", reps: false, duration: false, distance: false, interval: false, unilateral: false };
  }
  if (getIntervalConfig(def)) {
    return { weight: "hidden", reps: false, duration: true, distance: false, interval: true, unilateral };
  }
  if (isCardio(def)) {
    return { weight: "hidden", reps: false, duration: true, distance: true, interval: false, unilateral };
  }
  if (isTimeBased(def)) {
    return { weight: "hidden", reps: false, duration: true, distance: false, interval: false, unilateral };
  }
  return {
    weight: isBodyweight(def) ? "optional" : "required",
    reps: true,
    duration: false,
    distance: false,
    interval: false,
    unilateral,
  };
}

/**
 * Seeds a unilateral exercise's second side to mirror the first, for a
 * freshly created set — every set-creation call site (starting a workout
 * from a routine, adding a set, adding an exercise mid-workout or in
 * History) uses this, so "mirror until edited" always has something in
 * sync to start from, regardless of whether the initial values came from
 * a routine target, the previous set, or a blank zero. A no-op for any
 * non-unilateral exercise.
 */
export function seedUnilateralSide<
  T extends { weight?: number; reps?: number; duration?: number },
>(def: ExerciseDef | undefined, set: T): T & { additionalPerformances?: SetSide[] } {
  if (!isUnilateral(def)) return set;
  return {
    ...set,
    additionalPerformances: [{ weight: set.weight ?? 0, reps: set.reps ?? 0, duration: set.duration }],
  };
}

interface CompletedSetLike {
  weight?: number;
  reps?: number;
  duration?: number;
  intervalConfig?: IntervalConfig;
  additionalPerformances?: SetSide[];
}

/**
 * Every side's performance for a set — one entry for a non-unilateral
 * set (the top-level weight/reps/duration), or the first entry plus
 * whatever's in `additionalPerformances` for a unilateral one. This is
 * the ONE place that understands "how many sides does this set have";
 * every consumer (volume, PRs, charts, formatting) iterates this instead
 * of reading weight/reps directly or asking whether the exercise is
 * unilateral itself.
 */
export function setPerformances(set: {
  weight?: number;
  reps?: number;
  duration?: number;
  additionalPerformances?: SetSide[];
}): SetSide[] {
  return [
    { weight: set.weight ?? 0, reps: set.reps ?? 0, duration: set.duration },
    ...(set.additionalPerformances ?? []),
  ];
}

const SIDE_LABELS = ["Left", "Right"] as const;

/**
 * Position → display label. Laterality is a display concern only — it
 * never appears in the data model (see WorkoutSet.additionalPerformances
 * and setPerformances above), so this is the one and only place "index 0
 * is called Left" is decided.
 */
export function sideLabel(index: number): string {
  return SIDE_LABELS[index] ?? `Side ${index + 1}`;
}

/** Formats a single side's numbers according to schema — shared by
 *  formatCompletedSet's non-unilateral path (called once) and its
 *  unilateral path (called once per side), so the two can't drift apart
 *  the way independent copies would. */
function formatPerformance(schema: ExerciseLoggingSchema, perf: SetSide): string {
  if (schema.distance) {
    return `${perf.weight}km · ${formatDuration(perf.duration ?? 0)}`;
  }
  if (schema.duration) {
    return formatDuration(perf.duration ?? 0);
  }
  const showWeight =
    schema.weight === "required" || (schema.weight === "optional" && perf.weight > 0);
  if (showWeight) {
    return `${perf.weight}kg × ${perf.reps}`;
  }
  return `${perf.reps} reps`;
}

/**
 * Renders one completed set as the text form used throughout the app
 * ("40kg × 8", "5.2km · 22:10", "0:45", "9:20 (8×1:00/2:00)",
 * "L 40kg × 10 · R 40kg × 9") — matches the conventions already
 * established by LiveSession's formatPrevSet, built on the shared schema
 * and the shared formatDuration rather than re-deriving either.
 */
export function formatCompletedSet(
  def: ExerciseDef | undefined,
  set: CompletedSetLike,
): string {
  const schema = getExerciseLoggingSchema(def);
  if (schema.interval) {
    const total = formatDuration(set.duration ?? 0);
    // Falls back to just the total if this particular set predates
    // recording intervalConfig — still correct, just less detailed.
    const cfg = set.intervalConfig;
    return cfg
      ? `${total} (${cfg.rounds}×${formatDuration(cfg.workSeconds)}/${formatDuration(cfg.restSeconds)})`
      : total;
  }
  const performances = setPerformances(set);
  if (schema.unilateral && performances.length > 1) {
    // Compact inline form for the read-only contexts this is used in
    // (Previous Workout, Workout Complete summary, History's view mode) —
    // the fuller stacked "Left / 40kg × 10 / Right / 40kg × 9" layout is
    // for interactive editing (LiveSession, History's edit mode), which
    // render their own inputs rather than formatted text.
    return performances
      .map((p, i) => `${sideLabel(i)[0]} ${formatPerformance(schema, p)}`)
      .join(" · ");
  }
  return formatPerformance(schema, performances[0]);
}
