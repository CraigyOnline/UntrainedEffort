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

/**
 * Broad rest-recovery grouping for non-cardio, non-interval exercises —
 * see getRestDurationSec below for how this is used, and its doc comment
 * for the full priority chain this is one step of. Deliberately coarse
 * (four buckets, not a duration per exercise) so tagging the catalog stays
 * a one-word decision per exercise rather than a number to tune; a later
 * per-exercise override is exactly what step 1 of that chain is reserved
 * for once it exists.
 */
export type RestCategory = "heavyCompound" | "compound" | "isolation" | "core";

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

  /** Rest-recovery grouping used to pick a default rest-timer duration —
   *  see getRestDurationSec. Absent for cardio and interval exercises
   *  (they're exempted from the rest timer entirely, so tagging them
   *  would be meaningless) and, currently, nothing else — every other
   *  catalog entry is tagged. Left optional rather than required so a
   *  future exercise can be added without immediately having to decide
   *  its category. */
  restCategory?: RestCategory;
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
    restCategory?: RestCategory;
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
  restCategory: opts.restCategory,
});

export const EXERCISES: ExerciseDef[] = [
  // Chest
  E("bench-press", "Bench Press (Barbell)", "Chest", "Barbell", ["Triceps", "Shoulders"], {
    restCategory: "heavyCompound",
    aliases: [
      "Bench Press",
      "Barbell Bench Press",
      "Flat Barbell Bench Press",
      "Flat Bench Press",
      "BB Bench",
    ],
  }),
  E(
    "incline-bench",
    "Incline Bench Press (Barbell)",
    "Chest",
    "Barbell",
    ["Shoulders", "Triceps"],
    {
      restCategory: "heavyCompound",
      aliases: ["Incline Bench Press", "Incline Barbell Bench Press", "BB Incline Bench"],
    },
  ),
  E("db-bench-press", "Dumbbell Bench Press", "Chest", "Dumbbell", ["Triceps", "Shoulders"], {
    restCategory: "compound",
    aliases: ["DB Bench", "DB Bench Press", "Flat Dumbbell Bench Press", "Flat DB Bench"],
  }),
  E(
    "incline-db-bench-press",
    "Incline Dumbbell Bench Press",
    "Chest",
    "Dumbbell",
    ["Shoulders", "Triceps"],
    { restCategory: "compound", aliases: ["Incline DB Bench", "Incline DB Bench Press"] },
  ),
  E("floor-press", "Floor Press", "Chest", "Barbell", ["Triceps"], {
    restCategory: "compound",
    aliases: ["Barbell Floor Press", "BB Floor Press"],
  }),
  E("db-floor-press", "Dumbbell Floor Press", "Chest", "Dumbbell", ["Triceps"], {
    restCategory: "compound",
    aliases: ["DB Floor Press"],
  }),
  E("chest-fly", "Chest Fly (Dumbbell)", "Chest", "Dumbbell", [], {
    restCategory: "isolation",
    aliases: ["Dumbbell Fly", "DB Fly", "Chest Flye", "Pec Fly"],
  }),
  E("db-pullover", "Dumbbell Pullover", "Chest", "Dumbbell", ["Lats", "Triceps"], {
    restCategory: "isolation",
    aliases: ["DB Pullover"],
  }),
  E("cable-crossover", "Cable Crossover", "Chest", "Cable", [], {
    restCategory: "isolation",
    aliases: ["Cable Fly", "Cable Crossovers"],
  }),
  E("push-up", "Push Up", "Chest", "Bodyweight", ["Triceps", "Shoulders"], {
    restCategory: "compound",
    aliases: ["Pushup", "Push-up", "Press Up"],
  }),
  E("dip", "Chest Dip", "Chest", "Bodyweight", ["Triceps", "Shoulders"], {
    restCategory: "compound",
    aliases: ["Dips", "Chest Dips", "Parallel Bar Dip"],
  }),
  E("machine-chest-press", "Machine Chest Press", "Chest", "Machine", ["Triceps", "Shoulders"], {
    restCategory: "compound",
    aliases: ["Chest Press Machine", "Seated Chest Press"],
  }),
  E(
    "decline-bench-press",
    "Decline Bench Press (Barbell)",
    "Chest",
    "Barbell",
    ["Triceps", "Shoulders"],
    {
      restCategory: "heavyCompound",
      aliases: ["Decline Bench Press", "Decline Barbell Bench Press"],
    },
  ),
  E("pec-deck", "Pec Deck", "Chest", "Machine", ["Shoulders"], {
    restCategory: "isolation",
    aliases: ["Pec Deck Fly", "Chest Fly Machine", "Butterfly Machine"],
  }),

  // Back
  E(
    "deadlift",
    "Deadlift (Barbell)",
    "LowerBack",
    "Barbell",
    ["Glutes", "Hamstrings", "Quads", "UpperBack", "Forearms"],
    {
      restCategory: "heavyCompound",
      aliases: ["Deadlift", "Barbell Deadlift", "DL", "Conventional Deadlift"],
    },
  ),
  E("romanian-deadlift", "Romanian Deadlift", "Hamstrings", "Barbell", ["Glutes", "LowerBack"], {
    restCategory: "heavyCompound",
    aliases: ["RDL", "Romanian Deadlifts", "Stiff Leg Deadlift"],
  }),
  E(
    "single-leg-romanian-deadlift",
    "Single-leg Romanian Deadlift",
    "Hamstrings",
    "Dumbbell",
    ["Glutes", "LowerBack"],
    {
      unilateral: true,
      restCategory: "compound",
      aliases: ["Single-leg RDL", "Single Leg RDL", "SL RDL", "Unilateral RDL"],
    },
  ),
  E("pull-up", "Pull Up", "Lats", "Bodyweight", ["UpperBack", "Biceps"], {
    restCategory: "compound",
    aliases: ["Pullup", "Pull-up", "Wide Grip Pull Up"],
  }),
  E("chin-up", "Chin Up", "Lats", "Bodyweight", ["UpperBack", "Biceps"], {
    restCategory: "compound",
    aliases: ["Chinup", "Chin-up", "Underhand Pull Up"],
  }),
  E("lat-pulldown", "Lat Pulldown", "Lats", "Cable", ["UpperBack", "Biceps"], {
    restCategory: "compound",
    aliases: ["Lat Pull Down", "Lat Pulldowns", "Cable Pulldown"],
  }),
  E("seated-row", "Seated Cable Row", "UpperBack", "Cable", ["Lats", "Biceps"], {
    restCategory: "compound",
    aliases: ["Cable Row", "Seated Row"],
  }),
  E("single-arm-cable-row", "Single-arm Cable Row", "UpperBack", "Cable", ["Lats", "Biceps"], {
    unilateral: true,
    restCategory: "compound",
    aliases: ["Single Arm Cable Row", "Unilateral Cable Row"],
  }),
  E("db-row", "Dumbbell Row", "Lats", "Dumbbell", ["UpperBack", "Biceps"], {
    unilateral: true,
    restCategory: "compound",
    aliases: ["DB Row", "One Arm Dumbbell Row", "Single Arm Dumbbell Row"],
  }),
  E(
    "chest-supported-db-row",
    "Chest Supported Dumbbell Row",
    "UpperBack",
    "Dumbbell",
    ["Lats", "Shoulders", "Biceps"],
    {
      restCategory: "compound",
      aliases: [
        "Incline Dumbbell Row",
        "Chest Supported Incline Row",
        "Incline Bench Dumbbell Row",
        "Chest Supported Row",
      ],
    },
  ),
  E("barbell-row", "Barbell Row", "UpperBack", "Barbell", ["Lats", "Biceps"], {
    restCategory: "heavyCompound",
    aliases: ["BB Row", "Bent Over Row", "Bent-over Barbell Row"],
  }),
  E("t-bar-row", "T-Bar Row", "UpperBack", "Barbell", ["Lats", "Biceps"], {
    restCategory: "heavyCompound",
    aliases: ["T Bar Row", "TBar Row"],
  }),
  E("face-pull", "Face Pull", "UpperBack", "Cable", ["Shoulders", "Biceps"], {
    restCategory: "isolation",
    aliases: ["Face Pulls", "Cable Face Pull"],
  }),
  E("back-extension", "Back Extension", "LowerBack", "Bodyweight", ["Glutes", "Hamstrings"], {
    restCategory: "isolation",
    aliases: ["Hyperextension", "Hyperextensions", "Roman Chair Back Extension"],
  }),
  E(
    "sumo-deadlift",
    "Sumo Deadlift",
    "LowerBack",
    "Barbell",
    ["Glutes", "Hamstrings", "Quads", "UpperBack", "Forearms"],
    { restCategory: "heavyCompound", aliases: ["Sumo DL"] },
  ),
  E(
    "trap-bar-deadlift",
    "Trap Bar Deadlift",
    "LowerBack",
    "Barbell",
    ["Glutes", "Hamstrings", "Quads", "UpperBack", "Forearms"],
    { restCategory: "heavyCompound", aliases: ["Hex Bar Deadlift", "Hex Deadlift"] },
  ),
  E("straight-arm-pulldown", "Straight-Arm Pulldown", "Lats", "Cable", ["Triceps", "UpperBack"], {
    restCategory: "isolation",
    aliases: ["Straight Arm Pulldown", "Cable Pullover"],
  }),
  E("assisted-pull-up", "Assisted Pull Up", "Lats", "Machine", ["UpperBack", "Biceps"], {
    restCategory: "compound",
    aliases: ["Assisted Pull-up", "Assisted Pullup Machine"],
  }),

  // Shoulders
  E("ohp", "Overhead Press (Barbell)", "Shoulders", "Barbell", ["Triceps", "UpperBack"], {
    restCategory: "heavyCompound",
    aliases: [
      "OHP",
      "Military Press",
      "Overhead Press",
      "Standing Barbell Press",
      "Barbell Overhead Press",
    ],
  }),
  E(
    "db-shoulder-press",
    "Dumbbell Shoulder Press",
    "Shoulders",
    "Dumbbell",
    ["Triceps", "UpperBack"],
    {
      restCategory: "compound",
      aliases: ["DB Shoulder Press", "Dumbbell Overhead Press", "DB OHP"],
    },
  ),
  E(
    "single-arm-shoulder-press",
    "Single-arm Shoulder Press",
    "Shoulders",
    "Dumbbell",
    ["Triceps", "UpperBack"],
    {
      unilateral: true,
      restCategory: "compound",
      aliases: ["Single Arm Shoulder Press", "Single Arm DB Press"],
    },
  ),
  E("arnold-press", "Arnold Press", "Shoulders", "Dumbbell", ["Triceps", "UpperBack"], {
    restCategory: "compound",
    aliases: ["Arnold Shoulder Press"],
  }),
  E("lateral-raise", "Lateral Raise", "Shoulders", "Dumbbell", [], {
    restCategory: "isolation",
    aliases: ["Side Lateral Raise", "DB Lateral Raise", "Dumbbell Lateral Raise"],
  }),
  E("front-raise", "Front Raise", "Shoulders", "Dumbbell", [], {
    restCategory: "isolation",
    aliases: ["DB Front Raise", "Dumbbell Front Raise"],
  }),
  E("rear-delt-fly", "Rear Delt Reverse Fly", "Shoulders", "Dumbbell", ["UpperBack"], {
    restCategory: "isolation",
    aliases: ["Reverse Fly", "Rear Delt Fly", "Bent Over Rear Delt Fly"],
  }),
  E("incline-rear-delt-fly", "Incline Rear Delt Fly", "Shoulders", "Dumbbell", ["UpperBack"], {
    restCategory: "isolation",
    aliases: ["Incline Reverse Fly"],
  }),
  E("reverse-pec-deck", "Reverse Pec Deck", "Shoulders", "Machine", ["UpperBack"], {
    restCategory: "isolation",
    aliases: ["Rear Delt Machine Fly", "Reverse Fly Machine"],
  }),
  E("shrug", "Shrug (Dumbbell)", "UpperBack", "Dumbbell", [], {
    restCategory: "isolation",
    aliases: ["Dumbbell Shrug", "DB Shrug", "Shrugs"],
  }),
  E("cable-lateral-raise", "Cable Lateral Raise", "Shoulders", "Cable", [], {
    restCategory: "isolation",
    aliases: ["Cable Lat Raise"],
  }),
  E(
    "machine-shoulder-press",
    "Machine Shoulder Press",
    "Shoulders",
    "Machine",
    ["Triceps", "UpperBack"],
    {
      restCategory: "compound",
      aliases: ["Shoulder Press Machine"],
    },
  ),
  E("upright-row", "Upright Row (Barbell)", "Shoulders", "Barbell", ["UpperBack", "Biceps"], {
    restCategory: "isolation",
    aliases: ["Upright Row", "Cable Upright Row", "EZ Bar Upright Row"],
  }),

  // Arms
  E("bicep-curl-db", "Dumbbell Curl", "Biceps", "Dumbbell", [], {
    restCategory: "isolation",
    aliases: ["DB Curl", "Dumbbell Bicep Curl", "Standing Dumbbell Curl"],
  }),
  E("incline-db-curl", "Incline Dumbbell Curl", "Biceps", "Dumbbell", ["Forearms"], {
    restCategory: "isolation",
    aliases: ["Incline DB Curl", "Incline Bicep Curl"],
  }),
  E("bicep-curl-bb", "Barbell Curl", "Biceps", "Barbell", [], {
    restCategory: "isolation",
    aliases: ["BB Curl", "Barbell Bicep Curl", "Standing Barbell Curl"],
  }),
  E("hammer-curl", "Hammer Curl", "Biceps", "Dumbbell", ["Forearms"], {
    restCategory: "isolation",
    aliases: ["Dumbbell Hammer Curl", "Neutral Grip Curl"],
  }),
  E("preacher-curl", "Preacher Curl", "Biceps", "Barbell", [], {
    restCategory: "isolation",
    aliases: ["Preacher Bicep Curl", "Barbell Preacher Curl"],
  }),
  E("tricep-pushdown", "Tricep Pushdown", "Triceps", "Cable", [], {
    restCategory: "isolation",
    aliases: ["Triceps Pushdown", "Cable Pushdown", "Rope Pushdown"],
  }),
  E("overhead-tri-ext", "Overhead Tricep Extension", "Triceps", "Dumbbell", [], {
    restCategory: "isolation",
    aliases: ["Overhead Triceps Extension", "DB Overhead Extension", "French Press"],
  }),
  E("skullcrusher", "Skullcrusher", "Triceps", "Barbell", [], {
    restCategory: "isolation",
    aliases: ["Skull Crusher", "Lying Triceps Extension", "Barbell Skullcrusher"],
  }),
  E("close-grip-bench", "Close-Grip Bench Press", "Triceps", "Barbell", ["Chest"], {
    restCategory: "compound",
    aliases: ["Close Grip Bench Press", "CGBP"],
  }),
  E("wrist-curl", "Wrist Curl", "Forearms", "Dumbbell", [], {
    restCategory: "isolation",
    aliases: ["Dumbbell Wrist Curl", "Forearm Curl"],
  }),
  E("ez-bar-curl", "EZ-Bar Curl", "Biceps", "Barbell", ["Forearms"], {
    restCategory: "isolation",
    aliases: ["EZ Bar Curl", "EZ Bar Bicep Curl"],
  }),
  E("cable-curl", "Cable Curl", "Biceps", "Cable", ["Forearms"], {
    restCategory: "isolation",
    aliases: ["Cable Bicep Curl"],
  }),
  E("concentration-curl", "Concentration Curl", "Biceps", "Dumbbell", [], {
    unilateral: true,
    restCategory: "isolation",
    aliases: ["DB Concentration Curl"],
  }),

  // Legs
  E(
    "back-squat",
    "Back Squat",
    "Quads",
    "Barbell",
    ["Glutes", "Hamstrings", "LowerBack", "Calves"],
    {
      restCategory: "heavyCompound",
      aliases: ["Squat", "Barbell Squat", "Barbell Back Squat", "High Bar Squat"],
    },
  ),
  E("front-squat", "Front Squat", "Quads", "Barbell", ["Glutes", "Hamstrings", "LowerBack"], {
    restCategory: "heavyCompound",
    aliases: ["Barbell Front Squat"],
  }),
  E("goblet-squat", "Goblet Squat", "Quads", "Dumbbell", ["Glutes", "Hamstrings"], {
    restCategory: "compound",
    aliases: ["DB Goblet Squat", "Dumbbell Goblet Squat"],
  }),
  E("leg-press", "Leg Press", "Quads", "Machine", ["Glutes", "Hamstrings"], {
    restCategory: "compound",
    aliases: ["Machine Leg Press", "45 Degree Leg Press"],
  }),
  E("leg-extension", "Leg Extension", "Quads", "Machine", [], {
    restCategory: "isolation",
    aliases: ["Quad Extension", "Machine Leg Extension"],
  }),
  E("leg-curl", "Leg Curl", "Hamstrings", "Machine", ["Calves"], {
    restCategory: "isolation",
    aliases: ["Hamstring Curl", "Machine Leg Curl"],
  }),
  E("lunge", "Walking Lunge", "Quads", "Dumbbell", ["Glutes", "Hamstrings", "Calves"], {
    restCategory: "compound",
    aliases: ["Lunges", "Dumbbell Walking Lunge", "DB Lunge"],
  }),
  E(
    "bulgarian-split-squat",
    "Bulgarian Split Squat",
    "Quads",
    "Dumbbell",
    ["Glutes", "Hamstrings"],
    {
      unilateral: true,
      restCategory: "compound",
      aliases: ["BSS", "Rear Foot Elevated Split Squat", "Split Squat"],
    },
  ),
  E("hip-thrust", "Hip Thrust", "Glutes", "Barbell", ["Hamstrings"], {
    restCategory: "compound",
    aliases: ["Barbell Hip Thrust", "BB Hip Thrust"],
  }),
  E("db-hip-thrust", "Dumbbell Hip Thrust", "Glutes", "Dumbbell", ["Hamstrings"], {
    restCategory: "compound",
    aliases: ["DB Hip Thrust"],
  }),
  E("glute-bridge", "Glute Bridge", "Glutes", "Bodyweight", ["Hamstrings"], {
    restCategory: "isolation",
    aliases: ["Bodyweight Hip Thrust", "Bridge"],
  }),
  E("calf-raise", "Standing Calf Raise", "Calves", "Machine", [], {
    restCategory: "isolation",
    aliases: ["Calf Raise", "Calf Raises"],
  }),
  E("seated-calf-raise", "Seated Calf Raise", "Calves", "Machine", [], {
    restCategory: "isolation",
    aliases: ["Seated Calf Raises"],
  }),
  E("hack-squat", "Hack Squat", "Quads", "Machine", ["Glutes", "Hamstrings"], {
    restCategory: "compound",
    aliases: ["Hack Squat Machine"],
  }),
  E("step-up", "Step Up", "Quads", "Dumbbell", ["Glutes", "Hamstrings"], {
    unilateral: true,
    restCategory: "compound",
    aliases: ["Step-up", "Dumbbell Step Up", "Box Step Up"],
  }),
  E("hip-abduction", "Hip Abduction", "Glutes", "Machine", [], {
    restCategory: "isolation",
    aliases: ["Hip Abductor Machine", "Abductor Machine"],
  }),
  E("hip-adduction", "Hip Adduction", "Glutes", "Machine", [], {
    restCategory: "isolation",
    aliases: ["Hip Adductor Machine", "Adductor Machine", "Inner Thigh Machine"],
  }),

  // Functional
  //
  // Deliberately doesn't include carries or sled work (Farmer's Carry,
  // Sled Push/Pull) — those are naturally weight-held-over-distance-or-time,
  // a combination getExerciseLoggingSchema doesn't have a field set for
  // today (its only weight+something pairing is weight+reps; the
  // duration/distance branches both hide weight entirely). Logging them
  // as reps or as a plain timed hold would silently drop the number that
  // actually matters for those exercises, so they're left out rather than
  // forced into a schema shape that would misrepresent what was done.
  E("good-morning", "Good Morning", "LowerBack", "Barbell", ["Glutes", "Hamstrings"], {
    restCategory: "compound",
    aliases: ["Barbell Good Morning"],
  }),
  E(
    "kettlebell-swing",
    "Kettlebell Swing",
    "Glutes",
    "Kettlebell",
    ["Hamstrings", "LowerBack", "Shoulders"],
    {
      restCategory: "compound",
      aliases: ["KB Swing", "Russian Kettlebell Swing"],
    },
  ),
  E("box-jump", "Box Jump", "Quads", "Bodyweight", ["Glutes", "Calves"], {
    restCategory: "compound",
    aliases: ["Box Jumps", "Plyo Box Jump"],
  }),
  E("burpee", "Burpee", "Chest", "Bodyweight", ["Quads", "Shoulders", "Glutes", "Calves"], {
    restCategory: "compound",
    aliases: ["Burpees"],
  }),

  // Core (time-based)
  E("plank", "Plank", "Abs", "Bodyweight", ["Obliques", "Shoulders"], {
    time: true,
    restCategory: "core",
    aliases: ["Front Plank", "Forearm Plank"],
  }),
  E("side-plank", "Side Plank", "Obliques", "Bodyweight", ["Abs"], {
    time: true,
    unilateral: true,
    restCategory: "core",
    aliases: ["Side Planks"],
  }),
  E("dead-hang", "Dead Hang", "Forearms", "Bodyweight", ["Lats", "Biceps"], {
    time: true,
    restCategory: "core",
    aliases: ["Bar Hang", "Passive Hang"],
  }),
  E("wall-sit", "Wall Sit", "Quads", "Bodyweight", ["Glutes"], {
    time: true,
    restCategory: "core",
    aliases: ["Wall Squat"],
  }),
  E("hollow-hold", "Hollow Hold", "Abs", "Bodyweight", ["Obliques", "LowerBack"], {
    time: true,
    restCategory: "core",
    aliases: ["Hollow Body Hold"],
  }),
  E("l-sit", "L-Sit", "Abs", "Bodyweight", ["Quads", "Triceps"], {
    time: true,
    restCategory: "core",
    aliases: ["L Sit"],
  }),

  // Core (reps)
  E("crunch", "Crunch", "Abs", "Bodyweight", ["Obliques"], {
    restCategory: "core",
    aliases: ["Crunches", "Ab Crunch"],
  }),
  E("sit-up", "Sit Up", "Abs", "Bodyweight", ["Obliques"], {
    restCategory: "core",
    aliases: ["Situp", "Sit-up"],
  }),
  E("hanging-leg-raise", "Hanging Leg Raise", "Abs", "Bodyweight", ["Forearms"], {
    restCategory: "core",
    aliases: ["Hanging Knee Raise", "Leg Raise"],
  }),
  E("russian-twist", "Russian Twist", "Obliques", "Bodyweight", [], {
    restCategory: "core",
    aliases: ["Russian Twists"],
  }),
  E("ab-wheel", "Ab Wheel Rollout", "Abs", "Other", ["Obliques", "Shoulders", "Lats"], {
    restCategory: "core",
    aliases: ["Ab Roller", "Ab Wheel", "Wheel Rollout"],
  }),

  // Cardio (time-based)
  E("treadmill", "Treadmill Run", "Cardio", "Cardio", ["Quads", "Hamstrings", "Calves", "Glutes"], {
    cardio: true,
    time: true,
    // "Running" moved to outdoor-run below now that it exists as its own
    // entry — kept here too it'd be ambiguous which one a bare "Running"
    // search should match.
    aliases: ["Treadmill", "Treadmill Running"],
  }),
  E(
    "rowing-machine",
    "Rowing Machine",
    "Cardio",
    "Cardio",
    ["Quads", "Hamstrings", "Glutes", "UpperBack", "Lats", "Biceps", "Forearms"],
    { cardio: true, time: true, aliases: ["Erg", "Rower", "Row Machine"] },
  ),
  E(
    "stationary-bike",
    "Stationary Bike",
    "Cardio",
    "Cardio",
    ["Quads", "Hamstrings", "Calves", "Glutes"],
    { cardio: true, time: true, aliases: ["Exercise Bike", "Spin Bike"] },
  ),
  E("elliptical", "Elliptical", "Cardio", "Cardio", ["Quads", "Hamstrings", "Glutes", "Calves"], {
    cardio: true,
    time: true,
    aliases: ["Elliptical Trainer", "Cross Trainer"],
  }),
  E(
    "stair-climber",
    "Stair Climber",
    "Cardio",
    "Cardio",
    ["Glutes", "Quads", "Hamstrings", "Calves"],
    { cardio: true, time: true, aliases: ["Stairmaster", "Stair Stepper"] },
  ),
  E("jump-rope", "Jump Rope", "Cardio", "Cardio", ["Calves", "Quads"], {
    cardio: true,
    time: true,
    aliases: ["Skipping Rope", "Jumping Rope"],
  }),
  E("battle-ropes", "Battle Ropes", "Cardio", "Cardio", ["Shoulders", "Forearms", "Abs"], {
    cardio: true,
    time: true,
    aliases: ["Battle Rope", "Rope Slams"],
  }),
  E("outdoor-run", "Outdoor Run", "Cardio", "Cardio", ["Quads", "Hamstrings", "Calves", "Glutes"], {
    cardio: true,
    time: true,
    aliases: ["Running", "Jogging", "Outdoor Running", "Jog"],
  }),
  E("outdoor-walk", "Walk", "Cardio", "Cardio", ["Quads", "Hamstrings", "Calves", "Glutes"], {
    cardio: true,
    time: true,
    aliases: ["Walking", "Brisk Walk", "Outdoor Walk"],
  }),
  E(
    "outdoor-cycling",
    "Outdoor Cycling",
    "Cardio",
    "Cardio",
    ["Quads", "Hamstrings", "Calves", "Glutes"],
    { cardio: true, time: true, aliases: ["Cycling", "Bike Ride", "Road Cycling", "Biking"] },
  ),
  E(
    "swimming",
    "Swimming",
    "Cardio",
    "Cardio",
    ["Lats", "Shoulders", "Triceps", "Quads", "Calves"],
    {
      cardio: true,
      time: true,
      // Distance is tracked in km (the app's one distance unit today,
      // same limitation noted for Stair Climber's floors/levels — see the
      // cardio-support discussion this batch came out of); meters or laps
      // would read more naturally for pool swimming specifically, but
      // giving cardio exercises their own unit is separate, bigger work
      // than this catalog pass.
      aliases: ["Swim", "Pool Swimming", "Laps"],
    },
  ),
  E("general-cardio", "Other Cardio", "Cardio", "Cardio", [], {
    cardio: true,
    time: true,
    aliases: ["General Cardio", "Cardio", "Cardio Session"],
  }),
  E(
    "rowing-intervals",
    "Rowing Intervals",
    "Cardio",
    "Cardio",
    ["Quads", "Hamstrings", "Glutes", "UpperBack", "Lats", "Biceps", "Forearms"],
    {
      interval: { rounds: 8, workSeconds: 60, restSeconds: 120 },
      aliases: ["Interval Rowing", "HIIT Rowing"],
    },
  ),
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

// ─────────────────────────────────────────────────────────────────────────────
// Rest timer defaults
//
// See getRestDurationSec below for the actual priority chain — this table
// is just step 2 of it (restCategory -> seconds). Kept next to the catalog
// rather than in workoutHelpers.ts because it's fundamentally exercise
// metadata, the same reasoning as getIntervalConfig above.
// ─────────────────────────────────────────────────────────────────────────────

const REST_CATEGORY_DURATIONS_SEC: Record<RestCategory, number> = {
  heavyCompound: 150,
  compound: 120,
  isolation: 75,
  core: 60,
};

/** Step 3 of getRestDurationSec's priority chain — what a rest timer uses
 *  when an exercise has no restCategory tagged. Every catalog entry that
 *  can start a rest timer is tagged today, so this mostly guards against a
 *  future addition slipping through untagged. */
export const DEFAULT_REST_DURATION_SEC = 90;

/**
 * The single source of truth for how long a rest timer should run after a
 * set of this exercise is completed — see LiveSession's
 * toggleSetCompletion, the only caller. Priority order:
 *
 *   1. `overrideSec`, if provided — a person's own saved rest duration for
 *      this exercise (see the ExerciseSettings table in db.ts and
 *      Settings → Exercise Rest Times). Resolving that override is the
 *      caller's job, not this function's — it stays a pure, synchronous
 *      function over the static catalog either way, taking the resolved
 *      number as a plain argument rather than reaching into Dexie itself.
 *   2. This exercise's restCategory default (REST_CATEGORY_DURATIONS_SEC).
 *   3. DEFAULT_REST_DURATION_SEC, for the rare exercise with no category
 *      tagged.
 *
 * Returns undefined for exercises that shouldn't auto-start a rest timer
 * at all: cardio (isCardio) and anything with its own interval config
 * (getIntervalConfig) — both already have their own pacing (a live
 * stopwatch, or IntervalTimer's own work/rest cycle) that an independent
 * rest timer would only compete with rather than complement. This check
 * happens before overrideSec is even consulted — there's no scenario
 * where a cardio exercise should get an auto rest timer, override or not.
 */
export function getRestDurationSec(
  def: ExerciseDef | undefined,
  overrideSec?: number,
): number | undefined {
  if (isCardio(def) || getIntervalConfig(def)) return undefined;
  if (overrideSec !== undefined) return overrideSec;
  return def?.restCategory
    ? REST_CATEGORY_DURATIONS_SEC[def.restCategory]
    : DEFAULT_REST_DURATION_SEC;
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
    return {
      weight: "hidden",
      reps: false,
      duration: false,
      distance: false,
      interval: false,
      unilateral: false,
    };
  }
  if (getIntervalConfig(def)) {
    return {
      weight: "hidden",
      reps: false,
      duration: true,
      distance: false,
      interval: true,
      unilateral,
    };
  }
  if (isCardio(def)) {
    return {
      weight: "hidden",
      reps: false,
      duration: true,
      distance: true,
      interval: false,
      unilateral,
    };
  }
  if (isTimeBased(def)) {
    return {
      weight: "hidden",
      reps: false,
      duration: true,
      distance: false,
      interval: false,
      unilateral,
    };
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
export function seedUnilateralSide<T extends { weight?: number; reps?: number; duration?: number }>(
  def: ExerciseDef | undefined,
  set: T,
): T & { additionalPerformances?: SetSide[] } {
  if (!isUnilateral(def)) return set;
  return {
    ...set,
    additionalPerformances: [
      { weight: set.weight ?? 0, reps: set.reps ?? 0, duration: set.duration },
    ],
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
export function formatCompletedSet(def: ExerciseDef | undefined, set: CompletedSetLike): string {
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
