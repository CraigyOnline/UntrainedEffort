import { getDb, type Workout, type PRRecord } from "@/lib/db";
import { getExercise, getIntervalConfig, isTimeBased, setPerformances, type SetSide } from "@/lib/exercises";

type PRType = PRRecord["type"];

interface SetLike {
  weight?: number;
  reps?: number;
  duration?: number;
  completed?: boolean;
  additionalPerformances?: SetSide[];
}

interface PRCandidate {
  type: PRType;
  value: number;
  /** Which side this candidate belongs to (matching setPerformances'
   *  positions), or undefined for a non-unilateral set. Kept independent
   *  per side rather than collapsed to one value — a lopsided set
   *  shouldn't register as a PR on the stronger side's account, and a
   *  future per-side PR UI needs both tracked separately regardless. */
  side?: number;
}

/**
 * The one and only place that decides what counts as a PR-worthy value for
 * a given completed set. Every PR-writing path in the app goes through
 * this function, so the rule can never drift out of sync with itself.
 *
 * Iterates setPerformances rather than reading weight/reps/duration
 * directly, so a unilateral exercise's sides are handled by the same code
 * path as everything else — this function doesn't need its own notion of
 * "is this exercise unilateral" at all.
 */
function relevantPRValues(
  def: ReturnType<typeof getExercise>,
  set: SetLike,
): PRCandidate[] {
  if (!def) return [];
  if (getIntervalConfig(def)) {
    // Rounds/work/rest isn't a single scalar where "bigger is better" the
    // way weight, reps, or a held duration are — a workout could increase
    // rounds while cutting rest, or vice versa, with no clear "better".
    // No PR type is recorded for interval exercises today; explicit here
    // rather than left to weight/reps happening to be zero for them.
    return [];
  }

  const performances = setPerformances(set);
  const sided = performances.length > 1;
  const out: PRCandidate[] = [];

  performances.forEach((perf, i) => {
    const side = sided ? i : undefined;
    if (isTimeBased(def)) {
      const d = perf.duration ?? 0;
      if (d > 0) out.push({ type: "time", value: d, side });
      return;
    }
    if (perf.weight > 0) out.push({ type: "weight", value: perf.weight, side });
    if (perf.reps > 0) out.push({ type: "reps", value: perf.reps, side });
  });

  return out;
}

/** exerciseId can't itself contain ":" (the catalog only uses plain
 *  slugs), but this pops from the end regardless so that assumption isn't
 *  load-bearing. "agg" marks a non-unilateral (no side) PR track. */
function splitKey(key: string): { exerciseId: string; type: PRType; side?: number } {
  const parts = key.split(":");
  const sideStr = parts.pop()!;
  const type = parts.pop()! as PRType;
  const exerciseId = parts.join(":");
  return { exerciseId, type, side: sideStr === "agg" ? undefined : Number(sideStr) };
}

function prKey(exerciseId: string, type: PRType, side: number | undefined): string {
  return `${exerciseId}:${type}:${side ?? "agg"}`;
}

/**
 * Recomputes prHistory from scratch, based solely on what's currently in
 * `workouts`. This is the only correct way to handle anything that can
 * retract a previously-recorded PR (an edit that lowers a value, a deleted
 * workout, an import) — incremental "does this beat the best" logic has no
 * way to un-write a PR it already wrote.
 *
 * Idempotent by construction: it clears the table and deterministically
 * replays workout history in chronological order every time, so calling it
 * repeatedly with no intervening changes to `workouts` always produces the
 * same PR content (same exerciseId/type/side/value/previousBest/delta/
 * workoutId rows). The only thing that isn't identical run-to-run is each
 * row's own auto-incrementing primary key, which nothing in the app
 * depends on.
 *
 * Must be called from inside the caller's own Dexie transaction so a
 * failure here rolls back the mutation that triggered it too.
 */
async function rebuildPersonalRecords(): Promise<void> {
  const db = getDb();
  await db.prHistory.clear();

  const workouts = await db.workouts.orderBy("startedAt").toArray();
  const best = new Map<string, number>();

  for (const workout of workouts) {
    // Best value achieved WITHIN this workout, per exerciseId+type+side —
    // so a workout with several qualifying sets still produces at most
    // one new PR row per exercise+type+side, matching the incremental
    // save's behaviour.
    const withinWorkout = new Map<string, number>();

    for (const ex of workout.exercises) {
      const def = getExercise(ex.exerciseId);
      for (const s of ex.sets) {
        if (!s.completed) continue;
        for (const { type, value, side } of relevantPRValues(def, s)) {
          const key = prKey(ex.exerciseId, type, side);
          if (value > (withinWorkout.get(key) ?? 0)) {
            withinWorkout.set(key, value);
          }
        }
      }
    }

    for (const [key, value] of withinWorkout) {
      const previousBest = best.get(key) ?? 0;
      if (value > previousBest) {
        const { exerciseId, type, side } = splitKey(key);
        await db.prHistory.add({
          exerciseId,
          type,
          value,
          side,
          previousBest,
          delta: value - previousBest,
          workoutId: workout.id,
          createdAt: workout.startedAt,
        });
        best.set(key, value);
      }
    }
  }
}

/**
 * THE single entry point for keeping all derived workout data consistent
 * with current workout history. Its public contract is deliberately just
 * "leave the workout database internally consistent" — what that means
 * today (rebuilding Personal Records) is an implementation detail, not
 * something callers should know or care about.
 *
 * Call this from inside the same Dexie transaction as whatever mutation
 * changed workout history (Dexie joins an already-open compatible
 * transaction rather than opening a conflicting second one), immediately
 * after the mutation. Future derived data — muscle summaries, training
 * load, cached analytics, whatever comes next — gets added as another
 * awaited step inside this function's body. No call site anywhere in the
 * app ever needs to change when that happens.
 */
export async function syncWorkoutIntegrity(): Promise<void> {
  await rebuildPersonalRecords();
  // Future: await syncMuscleSummaries();
  // Future: await syncTrainingLoad();
}

/**
 * Incremental PR check for a brand-new workout only. This is correct ONLY
 * because a newly-saved workout is strictly additive — it can never
 * retract a value that used to be a PR, so "does this beat the current
 * best" is a complete and sufficient check here. Do not reuse this for
 * edits, deletes, or imports; those can invalidate an existing PR and need
 * syncWorkoutIntegrity()'s full rebuild instead.
 *
 * Must be called from inside the same transaction as the workout's own
 * `add()`.
 */
export async function recordNewWorkoutPRs(workout: Workout & { id: number }): Promise<void> {
  const db = getDb();
  const written = new Set<string>();

  for (const ex of workout.exercises) {
    const def = getExercise(ex.exerciseId);
    for (const s of ex.sets) {
      if (!s.completed) continue;
      for (const { type, value, side } of relevantPRValues(def, s)) {
        const key = prKey(ex.exerciseId, type, side);
        if (written.has(key)) continue;

        // side isn't an indexed field, so filter it in JS over the
        // (already small, per exercise+type) result rather than pushing
        // it into the Dexie query.
        const existing = await db.prHistory
          .where({ exerciseId: ex.exerciseId, type })
          .toArray();
        const previousBest = existing
          .filter((p) => p.side === side)
          .reduce((m, p) => Math.max(m, p.value), 0);

        if (value > previousBest) {
          await db.prHistory.add({
            exerciseId: ex.exerciseId,
            type,
            value,
            side,
            previousBest,
            delta: value - previousBest,
            workoutId: workout.id,
            createdAt: Date.now(),
          });
          written.add(key);
        }
      }
    }
  }
}
