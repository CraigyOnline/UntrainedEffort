import { describe, expect, it } from "vitest";
import type { Workout, WorkoutSet } from "@/lib/db";
import { formatPace } from "@/lib/exercises";
import {
  computeDominantCircuitSignature,
  computeDominantSignature,
  computeVolumeByPeriod,
  computeWorkoutDisplayStats,
  computeWorkoutStats,
  detectSessionGoal,
  formatCardioActivity,
  getCurrentExerciseId,
  getCurrentExerciseName,
  resolveCardioPattern,
} from "@/lib/workoutStats";

// Real catalog ids, chosen to cover the branches computeWorkoutDisplayStats
// switches on:
//   bench-press        strength, not unilateral
//   db-row              strength, unilateral (additionalPerformances)
//   treadmill            cardio, distanceUnit "km" + pace convention
//   jump-rope             cardio, no distanceUnit (duration only)
//   rowing-intervals    interval, rounds/work/rest config

function makeSet(overrides: Partial<WorkoutSet> = {}): WorkoutSet {
  return { weight: 0, reps: 0, completed: true, ...overrides };
}

function makeExercises(entries: Array<[string, WorkoutSet[]]>): Workout["exercises"] {
  return entries.map(([exerciseId, sets]) => ({ exerciseId, sets }));
}

describe("computeWorkoutStats", () => {
  it("sums volume only for completed sets, and only where weight is tracked", () => {
    const exercises = makeExercises([
      [
        "bench-press",
        [
          makeSet({ weight: 10, reps: 5 }), // 50
          makeSet({ weight: 20, reps: 3 }), // 60
          makeSet({ weight: 999, reps: 999, completed: false }), // excluded
        ],
      ],
      [
        "db-row",
        [
          // unilateral: main side + additionalPerformances both count
          makeSet({
            weight: 20,
            reps: 10, // 200
            additionalPerformances: [{ weight: 18, reps: 10 }], // 180
          }),
        ],
      ],
      [
        "treadmill",
        [
          // cardio: weight/reps here are distance/unused, never volume
          makeSet({ weight: 5, reps: 0, duration: 600 }),
        ],
      ],
    ]);

    const stats = computeWorkoutStats(exercises);

    expect(stats.totalVolume).toBe(50 + 60 + 200 + 180);
    expect(stats.totalSets).toBe(4); // 2 bench + 1 row + 1 treadmill; not the skipped bench set
    expect(stats.loggedSets).toBe(5); // every set including the uncompleted one
  });

  it("returns zeros for an empty workout", () => {
    expect(computeWorkoutStats([])).toEqual({
      totalSets: 0,
      totalVolume: 0,
      loggedSets: 0,
    });
  });
});

describe("computeWorkoutDisplayStats — mode detection", () => {
  it("classifies a pure strength workout", () => {
    const exercises = makeExercises([["bench-press", [makeSet({ weight: 10, reps: 5 })]]]);
    const stats = computeWorkoutDisplayStats(exercises);
    expect(stats.mode).toBe("strength");
    expect(stats.strengthExerciseCount).toBe(1);
    expect(stats.cardioActivities).toHaveLength(0);
    expect(stats.intervalActivities).toHaveLength(0);
  });

  it("classifies a pure cardio workout and computes distance/pace", () => {
    const exercises = makeExercises([
      ["treadmill", [makeSet({ weight: 5, duration: 1500 })]], // 5km in 25min
    ]);
    const stats = computeWorkoutDisplayStats(exercises);
    expect(stats.mode).toBe("cardio");
    expect(stats.primaryCardio?.distance).toBe(5);
    expect(stats.primaryCardio?.durationSec).toBe(1500);
    expect(stats.primaryCardio?.pace).toBe(formatPace({ style: "pace", per: 1 }, "km", 5, 1500));
  });

  it("leaves distance/pace undefined for a cardio exercise with no distance concept", () => {
    const exercises = makeExercises([["jump-rope", [makeSet({ duration: 300 })]]]);
    const stats = computeWorkoutDisplayStats(exercises);
    expect(stats.mode).toBe("cardio");
    expect(stats.primaryCardio?.distance).toBeUndefined();
    expect(stats.primaryCardio?.pace).toBeUndefined();
  });

  it("classifies a pure interval workout", () => {
    const exercises = makeExercises([
      ["rowing-intervals", [makeSet({ duration: 60 }), makeSet({ duration: 60 })]],
    ]);
    const stats = computeWorkoutDisplayStats(exercises);
    expect(stats.mode).toBe("interval");
    expect(stats.primaryInterval?.rounds).toBe(8);
    expect(stats.primaryInterval?.durationSec).toBe(120);
  });

  it("classifies a workout spanning two modalities as mixed, not cardio/strength", () => {
    const exercises = makeExercises([
      ["bench-press", [makeSet({ weight: 10, reps: 5 })]],
      ["treadmill", [makeSet({ weight: 5, duration: 1500 })]],
    ]);
    const stats = computeWorkoutDisplayStats(exercises);
    expect(stats.mode).toBe("mixed");
    expect(stats.strengthExerciseCount).toBe(1);
    expect(stats.cardioActivities).toHaveLength(1);
  });

  it("leaves primaryCardio/primaryInterval undefined when there's more than one activity", () => {
    const exercises = makeExercises([
      ["treadmill", [makeSet({ weight: 5, duration: 1500 })]],
      ["jump-rope", [makeSet({ duration: 300 })]],
    ]);
    const stats = computeWorkoutDisplayStats(exercises);
    expect(stats.cardioActivities).toHaveLength(2);
    expect(stats.primaryCardio).toBeUndefined();
  });

  it("excludes uncompleted sets from a cardio activity's duration/distance", () => {
    const exercises = makeExercises([
      [
        "treadmill",
        [
          makeSet({ weight: 5, duration: 1500 }),
          makeSet({ weight: 3, duration: 900, completed: false }),
        ],
      ],
    ]);
    const stats = computeWorkoutDisplayStats(exercises);
    expect(stats.primaryCardio?.distance).toBe(5);
    expect(stats.primaryCardio?.durationSec).toBe(1500);
  });
});

describe("computeDominantSignature", () => {
  it("resolves pure modes directly from mode", () => {
    const strength = computeWorkoutDisplayStats(
      makeExercises([["bench-press", [makeSet({ weight: 10, reps: 5 })]]]),
    );
    const cardio = computeWorkoutDisplayStats(
      makeExercises([["treadmill", [makeSet({ weight: 5, duration: 600 })]]]),
    );
    const interval = computeWorkoutDisplayStats(
      makeExercises([["rowing-intervals", [makeSet({ duration: 60 })]]]),
    );
    expect(computeDominantSignature(strength)).toBe("strength");
    expect(computeDominantSignature(cardio)).toBe("cardio");
    expect(computeDominantSignature(interval)).toBe("cardio");
  });

  it("breaks a mixed workout by exercise count, favoring strength on a tie", () => {
    const tied = computeWorkoutDisplayStats(
      makeExercises([
        ["bench-press", [makeSet({ weight: 10, reps: 5 })]],
        ["treadmill", [makeSet({ weight: 5, duration: 600 })]],
      ]),
    );
    expect(computeDominantSignature(tied)).toBe("strength");

    const cardioHeavy = computeWorkoutDisplayStats(
      makeExercises([
        ["bench-press", [makeSet({ weight: 10, reps: 5 })]],
        ["treadmill", [makeSet({ weight: 5, duration: 600 })]],
        ["jump-rope", [makeSet({ duration: 300 })]],
      ]),
    );
    expect(computeDominantSignature(cardioHeavy)).toBe("cardio");
  });
});

describe("resolveCardioPattern", () => {
  it("resolves pure cardio/interval modes directly", () => {
    const cardio = computeWorkoutDisplayStats(
      makeExercises([["treadmill", [makeSet({ weight: 5, duration: 600 })]]]),
    );
    const interval = computeWorkoutDisplayStats(
      makeExercises([["rowing-intervals", [makeSet({ duration: 60 })]]]),
    );
    expect(resolveCardioPattern(cardio)).toBe("steady");
    expect(resolveCardioPattern(interval)).toBe("interval");
  });

  it("favors interval only when interval activities outnumber plain cardio ones, else steady", () => {
    // The catalog only has one interval exercise, so two intervalActivities
    // entries means two logged exercises sharing that id — an unusual but
    // structurally valid workout, and the only way to outnumber a single
    // cardio activity for this branch.
    const intervalHeavy = computeWorkoutDisplayStats(
      makeExercises([
        ["treadmill", [makeSet({ weight: 5, duration: 600 })]],
        ["rowing-intervals", [makeSet({ duration: 60 })]],
        ["rowing-intervals", [makeSet({ duration: 60 })]],
      ]),
    );
    expect(resolveCardioPattern(intervalHeavy)).toBe("interval");

    const tie = computeWorkoutDisplayStats(
      makeExercises([
        ["treadmill", [makeSet({ weight: 5, duration: 600 })]],
        ["rowing-intervals", [makeSet({ duration: 60 })]],
      ]),
    );
    expect(resolveCardioPattern(tie)).toBe("steady");
  });
});

describe("computeDominantCircuitSignature", () => {
  it("picks the majority modality among stations, favoring strength on a tie", () => {
    const strengthHeavy = [
      { exerciseId: "bench-press", workSeconds: 40, restSeconds: 20 },
      { exerciseId: "db-row", workSeconds: 40, restSeconds: 20 },
      { exerciseId: "treadmill", workSeconds: 40, restSeconds: 20 },
    ];
    expect(computeDominantCircuitSignature(strengthHeavy)).toBe("strength");

    const cardioHeavy = [
      { exerciseId: "treadmill", workSeconds: 40, restSeconds: 20 },
      { exerciseId: "jump-rope", workSeconds: 40, restSeconds: 20 },
      { exerciseId: "bench-press", workSeconds: 40, restSeconds: 20 },
    ];
    expect(computeDominantCircuitSignature(cardioHeavy)).toBe("cardio");

    const tie = [
      { exerciseId: "treadmill", workSeconds: 40, restSeconds: 20 },
      { exerciseId: "bench-press", workSeconds: 40, restSeconds: 20 },
    ];
    expect(computeDominantCircuitSignature(tie)).toBe("strength");
  });
});

describe("formatCardioActivity", () => {
  it("joins distance, duration, and pace when all are present", () => {
    const activity = {
      exerciseId: "treadmill",
      name: "Treadmill Run",
      durationSec: 1500,
      distance: 5,
      distanceUnit: "km" as const,
      pace: "5:00/km",
    };
    expect(formatCardioActivity(activity)).toBe("5km · 25:00 · 5:00/km");
  });

  it("omits missing pieces instead of leaving empty separators", () => {
    const activity = {
      exerciseId: "jump-rope",
      name: "Jump Rope",
      durationSec: 300,
    };
    expect(formatCardioActivity(activity)).toBe("5:00");
  });
});

describe("getCurrentExerciseId / getCurrentExerciseName", () => {
  it("returns the first exercise with an incomplete set", () => {
    const exercises = makeExercises([
      ["bench-press", [makeSet({ completed: true })]],
      ["db-row", [makeSet({ completed: false })]],
      ["treadmill", [makeSet({ completed: false })]],
    ]);
    expect(getCurrentExerciseId(exercises)).toBe("db-row");
    expect(getCurrentExerciseName(exercises)).toBe("Dumbbell Row");
  });

  it("falls back to the last exercise once everything is complete", () => {
    const exercises = makeExercises([
      ["bench-press", [makeSet({ completed: true })]],
      ["db-row", [makeSet({ completed: true })]],
    ]);
    expect(getCurrentExerciseId(exercises)).toBe("db-row");
  });

  it("returns undefined for an empty workout", () => {
    expect(getCurrentExerciseId([])).toBeUndefined();
    expect(getCurrentExerciseName([])).toBeUndefined();
  });
});

describe("detectSessionGoal", () => {
  it("classifies a clear majority of low-rep sets as strength", () => {
    const exercises = makeExercises([
      [
        "bench-press",
        [makeSet({ reps: 3 }), makeSet({ reps: 4 }), makeSet({ reps: 5 }), makeSet({ reps: 5 })],
      ],
    ]);
    expect(detectSessionGoal(exercises)).toBe("strength");
  });

  it("classifies a clear majority of moderate-rep sets as hypertrophy", () => {
    const exercises = makeExercises([
      ["bench-press", [makeSet({ reps: 8 }), makeSet({ reps: 10 }), makeSet({ reps: 12 })]],
    ]);
    expect(detectSessionGoal(exercises)).toBe("hypertrophy");
  });

  it("classifies a clear majority of high-rep sets as endurance", () => {
    const exercises = makeExercises([
      ["bench-press", [makeSet({ reps: 15 }), makeSet({ reps: 20 }), makeSet({ reps: 13 })]],
    ]);
    expect(detectSessionGoal(exercises)).toBe("endurance");
  });

  it("classifies an even split with no clear majority as mixed, including an exact 50/50 tie", () => {
    const exercises = makeExercises([
      [
        "bench-press",
        [
          makeSet({ reps: 3 }), // strength
          makeSet({ reps: 4 }), // strength
          makeSet({ reps: 8 }), // hypertrophy
          makeSet({ reps: 10 }), // hypertrophy
        ],
      ],
    ]);
    // 2/4 = exactly 50%, deliberately not a majority (>50% required)
    expect(detectSessionGoal(exercises)).toBe("mixed");
  });

  it("returns null below the minimum sample size of 3 qualifying sets", () => {
    const exercises = makeExercises([
      ["bench-press", [makeSet({ reps: 5 }), makeSet({ reps: 5 })]],
    ]);
    expect(detectSessionGoal(exercises)).toBeNull();
  });

  it("returns null for an all-cardio workout", () => {
    const exercises = makeExercises([
      [
        "treadmill",
        [makeSet({ duration: 600 }), makeSet({ duration: 600 }), makeSet({ duration: 600 })],
      ],
    ]);
    expect(detectSessionGoal(exercises)).toBeNull();
  });

  it("counts each side of a unilateral set as its own data point", () => {
    const exercises = makeExercises([
      [
        "db-row",
        [
          makeSet({ weight: 20, reps: 4, additionalPerformances: [{ weight: 18, reps: 4 }] }),
          makeSet({ weight: 20, reps: 4, additionalPerformances: [{ weight: 18, reps: 4 }] }),
        ],
      ],
    ]);
    // 2 sets × 2 sides = 4 qualifying performances, all reps=4 (strength)
    expect(detectSessionGoal(exercises)).toBe("strength");
  });

  it("excludes uncompleted sets and zero-rep sets from the count", () => {
    const exercises = makeExercises([
      [
        "bench-press",
        [
          makeSet({ reps: 5 }),
          makeSet({ reps: 5 }),
          makeSet({ reps: 999, completed: false }), // excluded
          makeSet({ reps: 0 }), // excluded — not a real rep count
        ],
      ],
    ]);
    // Only 2 qualifying sets remain — below the minimum sample size
    expect(detectSessionGoal(exercises)).toBeNull();
  });
});

describe("computeVolumeByPeriod", () => {
  const DAY_MS = 86400000;

  function makeWorkout(startedAt: number, exercises: Workout["exercises"]): Workout {
    return { id: 1, startedAt, endedAt: startedAt, durationSec: 0, name: "", exercises };
  }

  it("always returns exactly periodCount entries, oldest to newest", () => {
    const now = Date.parse("2026-08-16T12:00:00.000Z");
    const periods = computeVolumeByPeriod([], "week", 8, now);
    expect(periods).toHaveLength(8);
    for (let i = 1; i < periods.length; i++) {
      expect(periods[i].periodStart).toBeGreaterThan(periods[i - 1].periodStart);
    }
  });

  it("zero-fills a week with no training", () => {
    const now = Date.parse("2026-08-16T12:00:00.000Z");
    const periods = computeVolumeByPeriod([], "week", 4, now);
    expect(periods.every((p) => p.volume === 0)).toBe(true);
  });

  it("places today's volume in the most recent weekly bucket", () => {
    const now = Date.parse("2026-08-16T12:00:00.000Z");
    const workouts = [
      makeWorkout(now, makeExercises([["bench-press", [makeSet({ weight: 10, reps: 5 })]]])), // 50
    ];
    const periods = computeVolumeByPeriod(workouts, "week", 4, now);
    expect(periods[periods.length - 1].volume).toBe(50);
    expect(periods.slice(0, -1).every((p) => p.volume === 0)).toBe(true);
  });

  it("sums multiple workouts landing in the same weekly bucket", () => {
    const now = Date.parse("2026-08-16T12:00:00.000Z");
    const workouts = [
      makeWorkout(now, makeExercises([["bench-press", [makeSet({ weight: 10, reps: 5 })]]])), // 50
      makeWorkout(
        now - 2 * DAY_MS,
        makeExercises([["bench-press", [makeSet({ weight: 20, reps: 5 })]]]), // 100
      ),
    ];
    const periods = computeVolumeByPeriod(workouts, "week", 2, now);
    expect(periods[periods.length - 1].volume).toBe(150);
  });

  it("separates workouts a week apart into distinct buckets", () => {
    const now = Date.parse("2026-08-16T12:00:00.000Z");
    const workouts = [
      makeWorkout(now, makeExercises([["bench-press", [makeSet({ weight: 10, reps: 5 })]]])), // 50, this week
      makeWorkout(
        now - 8 * DAY_MS,
        makeExercises([["bench-press", [makeSet({ weight: 20, reps: 5 })]]]), // 100, prior week
      ),
    ];
    const periods = computeVolumeByPeriod(workouts, "week", 2, now);
    expect(periods[0].volume).toBe(100);
    expect(periods[1].volume).toBe(50);
  });

  it("buckets by calendar month, not a rolling 30-day window", () => {
    // Aug 1 and Aug 31 are both in the August calendar bucket despite being
    // 30 days apart, and July 31 falls in the July bucket despite being
    // only 1 day before Aug 1.
    const now = Date.parse("2026-08-31T12:00:00.000Z");
    const workouts = [
      makeWorkout(
        Date.parse("2026-08-01T00:00:00.000Z"),
        makeExercises([["bench-press", [makeSet({ weight: 10, reps: 5 })]]]), // 50
      ),
      makeWorkout(
        Date.parse("2026-08-31T00:00:00.000Z"),
        makeExercises([["bench-press", [makeSet({ weight: 20, reps: 5 })]]]), // 100
      ),
      makeWorkout(
        Date.parse("2026-07-31T00:00:00.000Z"),
        makeExercises([["bench-press", [makeSet({ weight: 5, reps: 5 })]]]), // 25
      ),
    ];
    const periods = computeVolumeByPeriod(workouts, "month", 2, now);
    expect(periods[0].volume).toBe(25); // July
    expect(periods[1].volume).toBe(150); // August
  });

  it("gives a circuit workout (exercises: []) zero volume, same as computeWorkoutStats", () => {
    const now = Date.parse("2026-08-16T12:00:00.000Z");
    const workouts = [makeWorkout(now, [])];
    const periods = computeVolumeByPeriod(workouts, "week", 1, now);
    expect(periods[0].volume).toBe(0);
  });

  it("excludes a workout that falls just outside the requested window", () => {
    const now = Date.parse("2026-08-16T12:00:00.000Z");
    const workouts = [
      makeWorkout(
        now - 30 * DAY_MS,
        makeExercises([["bench-press", [makeSet({ weight: 10, reps: 5 })]]]),
      ),
    ];
    const periods = computeVolumeByPeriod(workouts, "week", 2, now); // only covers last 2 weeks
    expect(periods.every((p) => p.volume === 0)).toBe(true);
  });
});
