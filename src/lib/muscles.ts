import type { Workout } from "@/lib/db";
import { getExercise, type MuscleGroup } from "@/lib/exercises";
import { buildPeriodBuckets, type VolumePeriodGranularity } from "@/lib/workoutStats";

/**
 * Maps each tracked MuscleGroup to the anatomical region(s) that light up
 * for it on the body map. A region name here is the base id used in
 * src/assets/muscles/muscles-*.svg, without its "-l"/"-r" suffix — every
 * region exists as a left/right pair, and both always receive the same
 * intensity (the app has no notion of per-side exercise data).
 *
 * A MuscleGroup can map to regions on both the front and back SVGs (e.g.
 * Shoulders → the front anterior-deltoid and the back posterior-deltoid);
 * MuscleMap doesn't need to know or care which view a region belongs to,
 * since a CSS rule for a region id that isn't present in a given panel's
 * SVG simply matches nothing there.
 *
 * Two regions — tensor-fasciae-latae and adductors — have no exercise
 * category of their own in MuscleGroup. Both are folded into Quads: they
 * sit at the hip/thigh junction and are what leg exercises actually train
 * alongside the quads themselves, so this reads correctly without
 * expanding MuscleGroup for two minor regions nothing explicitly targets.
 *
 * Excludes Cardio (no anatomical region).
 */
export const muscleGroupToRegions: Record<Exclude<MuscleGroup, "Cardio">, string[]> = {
  Chest: ["pectoralis-major"],
  Shoulders: ["anterior-deltoid", "posterior-deltoid"],
  Biceps: ["biceps-brachii"],
  Triceps: ["triceps-brachii"],
  Forearms: ["forearm-flexors", "forearm-extensors"],
  Abs: ["rectus-abdominis-upper", "rectus-abdominis-middle", "rectus-abdominis-lower"],
  Obliques: ["external-oblique"],
  Lats: ["latissimus-dorsi"],
  UpperBack: ["trapezius"],
  LowerBack: ["erector-spinae"],
  Glutes: ["gluteus-maximus"],
  Quads: ["quadriceps", "tensor-fasciae-latae", "adductors"],
  Hamstrings: ["hamstrings"],
  Calves: ["gastrocnemius", "soleus"],
};

/**
 * Regions drawn on the body map that no MuscleGroup — and so no
 * exercise — ever targets. Rendered at all times for anatomical
 * completeness, at the same resting baseline as an untrained tracked
 * muscle, and dimmed the same way when another muscle is selected. Today
 * this is just serratus-anterior; unlike the old wger-derived asset set,
 * this new one has no equivalent "LowerCalves" gap — soleus is a normal
 * part of Calves above and highlights like any other tracked region.
 */
export const renderOnlyRegions: string[] = ["serratus-anterior"];

/**
 * Computes activation intensity per MuscleGroup from a workout.
 * intensity = (sets targeting that muscle) / (total completed sets)
 * Secondary muscles count at 0.5 weight.
 * "Cardio" is excluded from the result — it has no SVG body-map region and
 * is never anatomically meaningful, so it's dropped rather than left for
 * every caller to filter out individually.
 *
 * For a *finished* workout, an exercise with zero sets marked complete
 * still counts (falls back to its full set count) — the workout happened,
 * so the exercise counts as trained even if completion wasn't ticked.
 * Pass `live: true` to skip that fallback: for an in-progress session this
 * is wrong, since a just-added exercise (seeded with an incomplete
 * placeholder set) would otherwise immediately read as fully trained
 * before any set is actually completed.
 */
export function computeIntensity(
  exercises: Workout["exercises"],
  options?: { live?: boolean },
): Partial<Record<MuscleGroup, number>> {
  const live = options?.live ?? false;
  const counts: Partial<Record<MuscleGroup, number>> = {};
  let total = 0;

  for (const ex of exercises) {
    const def = getExercise(ex.exerciseId);
    if (!def) continue;
    const completedCount = ex.sets.filter((s) => s.completed).length;
    const completed = live ? completedCount : completedCount || ex.sets.length;
    if (!completed) continue;
    total += completed;
    counts[def.muscle] = (counts[def.muscle] ?? 0) + completed;
    for (const sec of def.secondary ?? []) {
      counts[sec] = (counts[sec] ?? 0) + completed * 0.5;
    }
  }

  if (total === 0) return {};
  const out: Partial<Record<MuscleGroup, number>> = {};
  for (const [k, v] of Object.entries(counts)) {
    if (k === "Cardio") continue; // not a real muscle — no SVG region, no anatomical meaning
    out[k as MuscleGroup] = Math.min(1, (v as number) / total);
  }
  return out;
}

/**
 * Equal-weight muscle intensity from a flat list of exercise IDs — for
 * contexts with no set-completion or volume signal to weight by (a
 * routine's planned exercises, or a circuit workout/routine's stations,
 * neither of which carry sets). Primary muscle counts full weight,
 * secondary muscles half — same 0.5 factor computeIntensity uses, just
 * without the completed-sets weighting since there's nothing here to
 * weight by. Shared by routineIntensity (_app.workout.tsx, both standard
 * and circuit routines) and the history timeline's circuit-workout case,
 * rather than three near-identical copies of this loop.
 *
 * "Cardio" is excluded from the result, same as computeIntensity and for
 * the same reason — no SVG body-map region, never anatomically meaningful.
 * A circuit station can be cardio-primary (e.g. a treadmill station), so
 * without this a stray "Cardio" key would otherwise leak into the output.
 */
export function intensityFromExerciseIds(
  exerciseIds: string[],
): Partial<Record<MuscleGroup, number>> {
  const out: Partial<Record<MuscleGroup, number>> = {};
  for (const exerciseId of exerciseIds) {
    const def = getExercise(exerciseId);
    if (!def) continue;
    if (def.muscle !== "Cardio") {
      out[def.muscle] = 1;
    }
    for (const sec of def.secondary ?? []) {
      out[sec] = Math.max(out[sec] ?? 0, 0.5);
    }
  }
  return out;
}

/** Day-count thresholds behind computeMuscleRecovery's status buckets. */
export const MUSCLE_RECOVERY_THRESHOLDS = {
  /** Below this many days since last trained → "recent". */
  recentMaxDays: 2,
  /** Below this many days since last trained (and not "recent") → "recovered". At or above → "overdue". */
  recoveredMaxDays: 7,
} as const;

export type MuscleRecoveryStatus = "recent" | "recovered" | "overdue";

export interface MuscleRecoveryInfo {
  lastTrainedAt: number;
  daysAgo: number;
  status: MuscleRecoveryStatus;
}

/** Label/tone per recovery status, same convention as exerciseProgress.ts's EXERCISE_STATUS_COPY. */
export const MUSCLE_RECOVERY_COPY: Record<MuscleRecoveryStatus, { label: string; tone: string }> = {
  recent: { label: "Recent", tone: "text-primary" },
  recovered: { label: "Recovered", tone: "text-muted-foreground" },
  overdue: { label: "Overdue", tone: "text-muted-foreground" },
};

/**
 * Days since each muscle group was last trained, counting both primary
 * and secondary involvement — a muscle worked as a stabilizer still
 * accumulates fatigue even if it wasn't the main mover, so this is
 * deliberately more inclusive than computeIntensity's volume weighting.
 * "Was this muscle worked at all recently" is a different question than
 * "how much of this workout's volume went to it".
 *
 * Scans the full workout history, independent of any display-range
 * filter a caller might otherwise apply elsewhere (e.g. Profile's
 * heatmap range) — recovery status should reflect the actual last time
 * a muscle was trained, not be silently capped by an unrelated UI filter.
 *
 * An exercise counts as having trained a muscle if any of its sets was
 * completed, matching computeLastTrainedAt's per-exercise convention.
 * Muscles never trained are omitted from the result rather than given a
 * synthetic "overdue forever" status.
 */
export function computeMuscleRecovery(
  workouts: Workout[],
  now: number = Date.now(),
): Partial<Record<MuscleGroup, MuscleRecoveryInfo>> {
  const lastTrained: Partial<Record<MuscleGroup, number>> = {};

  for (const w of workouts) {
    for (const log of w.exercises) {
      if (!log.sets.some((s) => s.completed)) continue;
      const def = getExercise(log.exerciseId);
      if (!def) continue;
      for (const m of [def.muscle, ...(def.secondary ?? [])]) {
        if (m === "Cardio") continue;
        if ((lastTrained[m] ?? 0) < w.startedAt) {
          lastTrained[m] = w.startedAt;
        }
      }
    }
  }

  const out: Partial<Record<MuscleGroup, MuscleRecoveryInfo>> = {};
  for (const [k, ts] of Object.entries(lastTrained)) {
    const lastTrainedAt = ts as number;
    const daysAgo = Math.floor((now - lastTrainedAt) / (1000 * 60 * 60 * 24));
    const status: MuscleRecoveryStatus =
      daysAgo < MUSCLE_RECOVERY_THRESHOLDS.recentMaxDays
        ? "recent"
        : daysAgo < MUSCLE_RECOVERY_THRESHOLDS.recoveredMaxDays
          ? "recovered"
          : "overdue";
    out[k as MuscleGroup] = { lastTrainedAt, daysAgo, status };
  }
  return out;
}

export interface MuscleActivityPeriod {
  periodStart: number;
  label: string;
  /** Weighted count of completed sets touching this muscle in the period —
   *  primary-mover sets count fully, secondary/assisting sets count at 0.5,
   *  the same per-set weighting computeIntensity uses (not just exercise
   *  presence). Not a literal training-volume figure (weight×reps) —
   *  deliberately set-count based so bodyweight and cardio-assisted work
   *  register too, not just loaded lifts. */
  score: number;
}

/**
 * Buckets a single muscle's training activity into a fixed number of
 * periods, using the exact same period boundaries as workoutStats.ts's
 * computeVolumeByPeriod (via the shared buildPeriodBuckets), so the two
 * charts stay in lockstep. Zero-filled for any period with no activity.
 */
export function computeMuscleActivityByPeriod(
  workouts: Workout[],
  muscle: MuscleGroup,
  granularity: VolumePeriodGranularity,
  periodCount: number,
  now: number = Date.now(),
): MuscleActivityPeriod[] {
  const contributions: { startedAt: number; weight: number }[] = [];
  for (const w of workouts) {
    for (const log of w.exercises) {
      const def = getExercise(log.exerciseId);
      if (!def) continue;
      const completedCount = log.sets.filter((s) => s.completed).length;
      if (!completedCount) continue;
      if (def.muscle === muscle) {
        contributions.push({ startedAt: w.startedAt, weight: completedCount });
      } else if (def.secondary?.includes(muscle)) {
        contributions.push({ startedAt: w.startedAt, weight: completedCount * 0.5 });
      }
    }
  }

  return buildPeriodBuckets(granularity, periodCount, now).map(
    ({ periodStart, periodEnd, label }) => ({
      periodStart,
      label,
      score: contributions
        .filter((c) => c.startedAt >= periodStart && c.startedAt < periodEnd)
        .reduce((acc, c) => acc + c.weight, 0),
    }),
  );
}

/**
 * Cross-workout muscle intensity, normalized against the highest-scoring
 * muscle in the given window (not against the workout's own total, unlike
 * computeIntensity above) — "how much of your typical Chest day is this,
 * relative to your most-trained muscle." Used by both Overview's compact
 * teaser and Insights → Strength's full exploration; callers control the
 * window by filtering `workouts` before calling this, not via a param
 * here, since Overview always uses a fixed recent window and Insights'
 * range picker needs an arbitrary one.
 */
export function computeAggregateMuscleIntensity(
  workouts: Workout[],
): Partial<Record<MuscleGroup, number>> {
  const totals: Partial<Record<MuscleGroup, number>> = {};

  for (const w of workouts) {
    for (const e of w.exercises) {
      const def = getExercise(e.exerciseId);
      if (!def) continue;
      const completed = e.sets.filter((s) => s.completed).length;
      totals[def.muscle] = (totals[def.muscle] ?? 0) + completed;
      for (const sec of def.secondary ?? []) {
        totals[sec] = (totals[sec] ?? 0) + completed * 0.5;
      }
    }
  }

  const max = Math.max(1, ...Object.values(totals));
  const normalized: Partial<Record<MuscleGroup, number>> = {};
  for (const k of Object.keys(totals) as MuscleGroup[]) {
    normalized[k] = (totals[k] ?? 0) / max;
  }
  return normalized;
}
