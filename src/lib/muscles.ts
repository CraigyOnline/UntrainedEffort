import type { Workout } from "@/lib/db";
import { getExercise, type MuscleGroup } from "@/lib/exercises";

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
