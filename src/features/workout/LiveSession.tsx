import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Reorder, useDragControls } from "framer-motion";
import { Check, GripVertical, Plus, Trash2, X } from "lucide-react";
import { getDb, type WorkoutSet, type LiveWorkoutSet } from "@/lib/db";
import {
  getExercise,
  getExerciseLoggingSchema,
  getIntervalConfig,
  getRestDurationSec,
  formatCompletedSet,
  seedUnilateralSide,
  distanceUnitLabel,
  getDistanceStepperConfig,
  type IntervalConfig,
  type SetSide,
} from "@/lib/exercises";
import { useUndo } from "@/hooks/useUndo";
import { getAllExerciseSettings } from "@/lib/exerciseSettings";
import { NumberInput, StepperInput } from "@/components/forms/NumberInput";
import { MmSsInput } from "@/components/forms/MmSsInput";
import { UnilateralSetInputs } from "@/components/forms/UnilateralSetInputs";
import { Button } from "@/components/ui/button";
import { SetTimer, TimerToggleButton } from "./WorkoutTimer";
import { IntervalTimer } from "./IntervalTimer";
import { WorkoutHUD, WORKOUT_HUD_HEIGHT, type WorkoutHUDCelebration } from "./WorkoutHUD";
import { RestTimer } from "./RestTimer";
import {
  type ActiveSession,
  type ActiveSessionExercise,
  type IntervalTimerState,
  PR_CELEBRATION_VISIBLE_MS,
  REST_AUTO_HIDE_SEC,
  REST_EXTEND_SEC,
  makeSet,
  startRestTimer,
} from "./workoutHelpers";
import { haptics } from "@/lib/haptics";
import { checkLivePRs, type LivePRHit, type PRType } from "@/lib/workoutIntegrity";
import { computeExpectedRepRange } from "@/lib/exerciseProgress";

/** Rolling window size for computeExpectedRepRange's historical rep-range
 *  guidance — how many recent sessions of an exercise to look back across. */
const REP_RANGE_SESSION_WINDOW = 5;

// Presentation-only text for a live PR badge — not a duplicate of the PR
// calculation itself (that's entirely inside checkLivePRs/relevantPRValues),
// just how each existing PRType is worded for this one badge.
function prTypeLabel(type: PRType): string {
  switch (type) {
    case "weight":
      return "Weight";
    case "reps":
      return "Rep";
    case "time":
      return "Time";
    case "distance":
      return "Distance";
    case "pace":
      return "Pace";
    case "speed":
      return "Speed";
    case "volume":
      // Not currently reachable: checkLivePRs only ever emits hits from
      // relevantPRValues, which volume deliberately isn't part of (it's a
      // whole-exercise aggregate, decided at save time — see
      // computeExerciseVolume in workoutIntegrity.ts). Handled here only
      // so this switch stays exhaustive over PRType.
      return "Volume";
  }
}

// A single set can clear more than one PR type at once (e.g. a heavier
// weight that's also a new rep count) — combined into one label so only
// one badge/pulse/haptic ever fires per set, per the spec.
function buildPRBadgeLabel(hits: LivePRHit[]): string {
  const labels = Array.from(new Set(hits.map((h) => prTypeLabel(h.type))));
  return labels.length === 1 ? `New ${labels[0]} PR` : labels.map((l) => `${l} PR`).join(" • ");
}

export interface LiveSessionProps {
  session: ActiveSession;
  setSession: React.Dispatch<React.SetStateAction<ActiveSession | null>>;
  onAddExercise: () => void;
  onFinish: (save: boolean) => void;
}

// Shared by both the unilateral and standard set rows below — same two
// actions (mark complete / delete), same sizing, same feedback. Extracted
// so the two rows can't drift out of sync with each other.
//
// Visible box stays h-8/w-8 (32px) rather than growing toward the ideal
// 44px mobile touch target: these sit in a tight 5-column row (set number,
// one or two steppers, these two buttons) that's already close to
// overflowing on narrow Android screens, so growing the box itself risks
// the row wrapping. Instead each button extends its actual tap target via
// an invisible `after:-inset-2` overlay (~16px added on every side, taken
// out of layout flow) — same functional touch-target win, zero layout risk.
//
// The delete icon is deliberately a notch quieter (muted-foreground/70,
// no persistent fill) than the completion button (which always has a
// visible box, filled solid once completed) — a completed-workout screen
// full of Trash2 icons at equal visual weight to the primary action
// (mark done) made a destructive, irreversible action too easy to
// mis-tap for at a glance.
//
// Doesn't fire a haptic itself on completion — the caller's
// onToggleComplete needs the set's actual values to run the live PR
// check and decide between the routine tap and the PR celebration, so
// that decision (and the resulting haptic) lives there instead.
function SetActionButtons({
  completed,
  onToggleComplete,
  onDelete,
}: {
  completed: boolean;
  onToggleComplete: () => void;
  onDelete: () => void;
}) {
  return (
    <>
      <button
        onClick={onToggleComplete}
        aria-label={completed ? "Mark set incomplete" : "Mark set complete"}
        className={`relative flex h-8 w-8 items-center justify-center rounded-lg transition-colors duration-150 active:scale-90 after:absolute after:-inset-2 after:content-[''] ${completed ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}
      >
        <Check className="h-4 w-4" />
      </button>
      <button
        onClick={onDelete}
        aria-label="Delete set"
        className="relative flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground/70 transition-colors after:absolute after:-inset-2 after:content-[''] active:bg-secondary active:text-foreground"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </>
  );
}

// One exercise's card during a live workout — pulled out of LiveSession's
// render so each card can own its own useDragControls() (a hook, and so
// can't be called once per iteration inside a .map callback). Behaviour is
// unchanged from before the extraction; only ei-indexed handlers moved to
// props, plus the Reorder.Item/drag-handle wrapper needed for reordering.
function ExerciseCard({
  ex,
  ei,
  celebration,
  previousSets,
  recentReps,
  removeExercise,
  updateIntervalConfig,
  setIntervalState,
  completeIntervalExercise,
  toggleSetCompletion,
  removeSet,
  updateSet,
  toggleTimer,
  addSet,
}: {
  ex: ActiveSessionExercise;
  ei: number;
  celebration: { exerciseId: string; setId: string | undefined } | null;
  previousSets: WorkoutSet[] | undefined;
  recentReps: { weight: number; reps: number }[][] | undefined;
  removeExercise: (ei: number) => void;
  updateIntervalConfig: (ei: number, patch: Partial<IntervalConfig>) => void;
  setIntervalState: (ei: number, next: IntervalTimerState | undefined) => void;
  completeIntervalExercise: (ei: number) => void;
  toggleSetCompletion: (ei: number, si: number) => void;
  removeSet: (ei: number, si: number) => void;
  updateSet: (ei: number, si: number, patch: Partial<LiveWorkoutSet>) => void;
  toggleTimer: (ei: number, si: number, side?: "primary" | "secondary") => void;
  addSet: (ei: number) => void;
}) {
  const def = getExercise(ex.exerciseId);
  const schema = getExerciseLoggingSchema(def);
  const defaultIntervalConfig = getIntervalConfig(def);
  const intervalConfig = ex.intervalConfig ?? defaultIntervalConfig;
  const dragControls = useDragControls();

  // Historical rep-range guidance (computeExpectedRepRange) only ever
  // applies to the set you're actually about to do next, not every row —
  // so this is computed once here rather than per-row inside the map below.
  // Weight-matched against that set's current weight value, so toggling
  // the weight stepper before logging reps re-filters the range live.
  const firstIncompleteIndex = ex.sets.findIndex((set) => !set.completed);
  const currentWeight = firstIncompleteIndex >= 0 ? (ex.sets[firstIncompleteIndex].weight ?? 0) : 0;
  const expectedRepRange =
    firstIncompleteIndex >= 0 && recentReps
      ? computeExpectedRepRange(recentReps, firstIncompleteIndex, currentWeight)
      : null;

  return (
    <Reorder.Item
      value={ex.exerciseId}
      dragListener={false}
      dragControls={dragControls}
      onDragStart={() => haptics.dragStart()}
      onDragEnd={() => haptics.dragDrop()}
      whileDrag={{ scale: 1.02, boxShadow: "0 10px 30px -8px rgba(0,0,0,0.5)", zIndex: 20 }}
      className="rounded-xl bg-card p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <button
          onPointerDown={(e) => dragControls.start(e)}
          aria-label="Drag to reorder exercise"
          className="relative flex h-11 w-8 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground/70 active:cursor-grabbing after:absolute after:-inset-1 after:content-['']"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{def?.name ?? ex.exerciseId}</p>
          <p className="text-xs text-muted-foreground">{def?.muscle}</p>
        </div>
        <button
          onClick={() => removeExercise(ei)}
          aria-label="Remove exercise"
          className="flex h-11 w-11 shrink-0 items-center justify-center text-muted-foreground transition-colors active:text-destructive"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {previousSets && previousSets.length > 0 && (
        <div className="mt-2 rounded-lg bg-muted px-2 py-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Previous Workout
          </p>
          <ul className="mt-0.5 text-xs tabular-nums text-foreground/80">
            {previousSets.map((s, i) => (
              <li key={i}>{formatCompletedSet(def, s)}</li>
            ))}
          </ul>
        </div>
      )}

      {intervalConfig && !ex.intervalState && (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-secondary/50 px-3 py-2">
          <label className="flex flex-col items-center gap-1">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Rounds
            </span>
            <NumberInput
              value={intervalConfig.rounds}
              onCommit={(v) => updateIntervalConfig(ei, { rounds: v })}
              min={1}
              className="w-12 text-center"
            />
          </label>
          <label className="flex flex-col items-center gap-1">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Work</span>
            <MmSsInput
              seconds={intervalConfig.workSeconds}
              onCommit={(v) => updateIntervalConfig(ei, { workSeconds: v })}
            />
          </label>
          <label className="flex flex-col items-center gap-1">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Rest</span>
            <MmSsInput
              seconds={intervalConfig.restSeconds}
              onCommit={(v) => updateIntervalConfig(ei, { restSeconds: v })}
            />
          </label>
        </div>
      )}

      {intervalConfig && (
        <IntervalTimer
          config={intervalConfig}
          state={ex.intervalState}
          onChange={(next) => setIntervalState(ei, next)}
          onComplete={() => completeIntervalExercise(ei)}
        />
      )}

      {!intervalConfig && schema.unilateral && (
        <div className="mt-3 flex flex-col gap-2">
          {ex.sets.map((s, si) => {
            const primary: SetSide = {
              weight: s.weight ?? 0,
              reps: s.reps ?? 0,
              duration: s.duration,
            };
            const secondary: SetSide = s.additionalPerformances?.[0] ?? {
              weight: 0,
              reps: 0,
              duration: 0,
            };
            return (
              <div
                key={si}
                className={`rounded-lg bg-secondary/40 p-2 transition-shadow duration-500 ease-out ${
                  celebration?.exerciseId === ex.exerciseId && celebration?.setId === s.id
                    ? "shadow-[0_0_20px_4px_var(--color-pr-gold)]"
                    : "shadow-none"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">Set {si + 1}</span>
                  <div className="flex items-center gap-2">
                    <SetActionButtons
                      completed={s.completed}
                      onToggleComplete={() => toggleSetCompletion(ei, si)}
                      onDelete={() => removeSet(ei, si)}
                    />
                  </div>
                </div>
                <div className="mt-2">
                  <UnilateralSetInputs
                    schema={schema}
                    primary={primary}
                    secondary={secondary}
                    size="large"
                    mode={{
                      kind: "live",
                      timerStart: {
                        primary: s.timerStart,
                        secondary: s.additionalPerformances?.[0]?.timerStart,
                      },
                      onToggleTimer: (side) => toggleTimer(ei, si, side),
                    }}
                    onChange={({ primary: p, secondary: sec }) =>
                      updateSet(ei, si, {
                        weight: p.weight,
                        reps: p.reps,
                        duration: p.duration,
                        additionalPerformances: [sec],
                      })
                    }
                  />
                </div>
              </div>
            );
          })}

          <button
            onClick={() => addSet(ei)}
            className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary/10 py-2 text-sm font-medium text-primary active:bg-primary/15"
          >
            <Plus className="h-4 w-4" /> Add set
          </button>
        </div>
      )}

      {!intervalConfig && !schema.unilateral && (
        <>
          <div className="mt-3 grid grid-cols-[24px_1fr_1fr_auto_auto] items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span>{schema.distance ? "Set" : "#"}</span>
            <span>
              {schema.distance && schema.distanceUnit
                ? distanceUnitLabel(schema.distanceUnit)
                : schema.duration
                  ? "Sec"
                  : "Kg"}
            </span>
            <span>{schema.distance ? "Time" : schema.duration ? "" : "Reps"}</span>
            <span />
            <span />
          </div>

          {!schema.distance && !schema.duration && (
            <div className="mt-1 grid min-h-3 grid-cols-[24px_1fr_1fr_auto_auto] items-center gap-2">
              <span />
              <span />
              <span className="text-left text-[10px] leading-3 text-muted-foreground">
                {expectedRepRange
                  ? `Usually ${expectedRepRange.min === expectedRepRange.max ? expectedRepRange.min : `${expectedRepRange.min}–${expectedRepRange.max}`}`
                  : ""}
              </span>
              <span />
              <span />
            </div>
          )}

          {ex.sets.map((s, si) => (
            <div
              key={si}
              className={`mt-2 grid grid-cols-[24px_1fr_1fr_auto_auto] items-center gap-2 rounded-lg transition-shadow duration-500 ease-out ${
                celebration?.exerciseId === ex.exerciseId && celebration?.setId === s.id
                  ? "shadow-[0_0_20px_4px_var(--color-pr-gold)]"
                  : "shadow-none"
              }`}
            >
              <span className="text-sm font-semibold">{si + 1}</span>

              {schema.distance && schema.distanceUnit ? (
                <>
                  <StepperInput
                    value={s.weight ?? 0}
                    onCommit={(v) => updateSet(ei, si, { weight: v })}
                    {...getDistanceStepperConfig(schema.distanceUnit)}
                    min={0}
                    size="normal"
                  />
                  <div className="flex items-center gap-2">
                    <SetTimer duration={s.duration ?? 0} timerStart={s.timerStart} />
                    <TimerToggleButton
                      running={!!s.timerStart}
                      onClick={() => toggleTimer(ei, si)}
                    />
                  </div>
                </>
              ) : schema.duration ? (
                <>
                  <div className="flex items-center gap-2">
                    <SetTimer duration={s.duration ?? 0} timerStart={s.timerStart} />
                    <TimerToggleButton
                      running={!!s.timerStart}
                      onClick={() => toggleTimer(ei, si)}
                    />
                  </div>
                  <span />
                </>
              ) : (
                <>
                  <StepperInput
                    value={s.weight ?? 0}
                    onCommit={(v) => updateSet(ei, si, { weight: v })}
                    step={2.5}
                    decimal
                    min={0}
                    size="normal"
                  />
                  <StepperInput
                    value={s.reps ?? 0}
                    onCommit={(v) => updateSet(ei, si, { reps: v })}
                    step={1}
                    min={0}
                    size="normal"
                  />
                </>
              )}

              <SetActionButtons
                completed={s.completed}
                onToggleComplete={() => toggleSetCompletion(ei, si)}
                onDelete={() => removeSet(ei, si)}
              />
            </div>
          ))}

          <button
            onClick={() => addSet(ei)}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary/10 py-2 text-sm font-medium text-primary active:bg-primary/15"
          >
            <Plus className="h-4 w-4" /> Add set
          </button>
        </>
      )}
    </Reorder.Item>
  );
}

export function LiveSession({ session, setSession, onAddExercise, onFinish }: LiveSessionProps) {
  // Kept in sync with WorkoutHUD's real rendered height via onHeightChange
  // below — starts at the pre-rest-timer fallback so there's no layout
  // jump before the first measurement lands (effectively immediate, since
  // WorkoutHUD reports once on mount).
  const [hudHeight, setHudHeight] = useState(WORKOUT_HUD_HEIGHT);

  const exerciseIds = session.exercises.map((e) => e.exerciseId);

  // Loaded once up front (rather than queried inside toggleSetCompletion
  // itself) so starting a rest timer stays the same synchronous state
  // update it already was — getRestDurationSec takes the resolved number
  // as a plain argument and stays a pure function over the static catalog;
  // this Map is where "resolved" happens. Keyed by exerciseId, matching
  // ExerciseSettings' primary key.
  const restOverrides = useLiveQuery(async (): Promise<Map<string, number>> => {
    const map = new Map<string, number>();
    const all = await getAllExerciseSettings();
    for (const s of all) {
      if (s.restDurationSec !== undefined) map.set(s.exerciseId, s.restDurationSec);
    }
    return map;
  }, []);

  const previousByExerciseResult = useLiveQuery(async (): Promise<Map<string, WorkoutSet[]>> => {
    const map = new Map<string, WorkoutSet[]>();
    if (typeof window === "undefined") return map;

    const remaining = new Set(exerciseIds);
    if (remaining.size === 0) return map;

    await getDb()
      .workouts.orderBy("startedAt")
      .reverse()
      .until(() => remaining.size === 0)
      .each((w) => {
        if (w.startedAt === session.startedAt) return;
        for (const e of w.exercises) {
          if (!remaining.has(e.exerciseId)) continue;
          const done = e.sets.filter((s) => s.completed);
          if (done.length > 0) {
            map.set(e.exerciseId, done);
            remaining.delete(e.exerciseId);
          }
        }
      });

    return map;
  }, [exerciseIds.join(","), session.startedAt]);

  const previousByExercise: Map<string, WorkoutSet[]> = previousByExerciseResult ?? new Map();

  // Rolling window for computeExpectedRepRange (exerciseProgress.ts) — same
  // until/each/remaining-set walk as previousByExerciseResult above, just
  // collecting up to REP_RANGE_SESSION_WINDOW sessions per exercise
  // instead of stopping at the first, and storing each completed set's
  // weight alongside its reps so the range can be weight-matched.
  const recentRepsByExerciseResult = useLiveQuery(async (): Promise<
    Map<string, { weight: number; reps: number }[][]>
  > => {
    const map = new Map<string, { weight: number; reps: number }[][]>();
    if (typeof window === "undefined") return map;

    const remaining = new Set(exerciseIds);
    if (remaining.size === 0) return map;

    await getDb()
      .workouts.orderBy("startedAt")
      .reverse()
      .until(() => remaining.size === 0)
      .each((w) => {
        if (w.startedAt === session.startedAt) return;
        for (const e of w.exercises) {
          if (!remaining.has(e.exerciseId)) continue;
          const reps = e.sets
            .filter((s) => s.completed)
            .map((s) => ({ weight: s.weight ?? 0, reps: s.reps ?? 0 }));
          if (reps.length === 0) continue;
          const sessions = map.get(e.exerciseId) ?? [];
          sessions.push(reps);
          map.set(e.exerciseId, sessions);
          if (sessions.length >= REP_RANGE_SESSION_WINDOW) remaining.delete(e.exerciseId);
        }
      });

    return map;
  }, [exerciseIds.join(","), session.startedAt]);

  const recentRepsByExercise: Map<string, { weight: number; reps: number }[][]> =
    recentRepsByExerciseResult ?? new Map();

  const {
    undoItem: undo,
    secondsLeft: undoSecondsLeft,
    trigger: triggerUndo,
    undo: undoDelete,
  } = useUndo<{ exerciseId: string; set: LiveWorkoutSet }>({
    duration: 3,
    onUndo: ({ exerciseId, set }) => {
      setSession((s) => {
        if (!s) return s;
        const exIdx = s.exercises.findIndex((e) => e.exerciseId === exerciseId);
        if (exIdx === -1) return s;
        const ex = s.exercises[exIdx];
        if (set.id && ex.sets.some((x) => x.id === set.id)) return s;
        const newExercises = [...s.exercises];
        newExercises[exIdx] = { ...ex, sets: [...ex.sets, set] };
        return { ...s, exercises: newExercises };
      });
    },
  });

  // ── Live PR celebration ──────────────────────────────────────────────
  // Which set (if any) just cleared a live PR, and the badge text to show
  // for it. Read by both WorkoutHUD (pulse/glow/badge) and this
  // component's own per-set highlight below, so the two stay in sync —
  // they're reactions to the same event, not two separate ones.
  const [celebration, setCelebration] = useState<{
    key: number;
    exerciseId: string;
    setId: string | undefined;
    label: string;
  } | null>(null);

  useEffect(() => {
    if (!celebration) return;
    const t = setTimeout(() => setCelebration(null), PR_CELEBRATION_VISIBLE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed off celebration?.key only, not the whole object, so this doesn't re-fire on unrelated re-renders
  }, [celebration?.key]);

  // Keys (exerciseId+type+side) already credited with a live celebration
  // during this workout — persisted on the session draft itself
  // (celebratedPRKeys) rather than kept in a ref, precisely so a PR
  // celebrates once per *workout*, not once per LiveSession component
  // instance: navigating away and back, or the app being killed and
  // recovered, both remount this component, and a plain ref would lose
  // the history and let an already-celebrated threshold fire again.
  // Riding on the same debounced draft write every other session field
  // already uses means this needs no new persistence of its own.
  async function celebrateIfPR(exerciseId: string, setId: string | undefined, set: LiveWorkoutSet) {
    const alreadyCredited = new Set(session.celebratedPRKeys ?? []);
    const hits = await checkLivePRs(exerciseId, set, alreadyCredited);
    if (hits.length === 0) {
      haptics.setComplete();
      return;
    }
    haptics.prAchieved();
    setSession((s) => (s ? { ...s, celebratedPRKeys: Array.from(alreadyCredited) } : s));
    setCelebration({ key: Date.now(), exerciseId, setId, label: buildPRBadgeLabel(hits) });
  }

  // The single point a set transitions to completed — SetActionButtons no
  // longer fires a haptic itself for exactly this reason: only here do we
  // have both the set's actual values (for the PR check) and the decision
  // of which haptic fits the result.
  function toggleSetCompletion(ei: number, si: number) {
    const ex = session.exercises[ei];
    const set = ex.sets[si];
    const willComplete = !set.completed;
    updateSet(ei, si, { completed: willComplete });
    if (willComplete) {
      void celebrateIfPR(ex.exerciseId, set.id, set);
      // Restart rather than merely start — a rest already in progress (or
      // already showing "Ready ✓") from a previous set gets replaced
      // outright, per the spec's "if another set is completed while a
      // timer is already running, restart the timer". getRestDurationSec
      // returns undefined for cardio and interval exercises, which don't
      // get an auto rest timer at all (they already have their own
      // pacing) — in that case restTimer is left exactly as it was rather
      // than cleared, so finishing a cardio set mid-rest-from-a-previous-
      // exercise doesn't cut that rest short.
      const restDurationSec = getRestDurationSec(
        getExercise(ex.exerciseId),
        restOverrides?.get(ex.exerciseId),
      );
      if (restDurationSec !== undefined) {
        setSession((s) =>
          s
            ? {
                ...s,
                restTimer: { ...startRestTimer(restDurationSec), exerciseId: ex.exerciseId },
              }
            : s,
        );
      }
    }
  }

  // ── Rest timer controls ─────────────────────────────────────────────
  // Starting/restarting lives in toggleSetCompletion above (the one place
  // that already owns set-completion) — these are just the two
  // person-initiated actions on an already-running timer, passed to the
  // bottom-docked <RestTimer> rendered below.
  function handleSkipRest() {
    setSession((s) => (s ? { ...s, restTimer: undefined } : s));
  }
  function handleExtendRest() {
    setSession((s) =>
      s?.restTimer
        ? {
            ...s,
            restTimer: {
              ...s.restTimer,
              endsAt: s.restTimer.endsAt + REST_EXTEND_SEC * 1000,
              durationSec: s.restTimer.durationSec + REST_EXTEND_SEC,
            },
          }
        : s,
    );
  }

  // Auto-hide: once "✓ Ready" has been showing for REST_AUTO_HIDE_SEC,
  // clear restTimer entirely so the bar disappears. Scheduled from the
  // deadline itself (endsAt), not from when this effect happens to run, so
  // re-mounting mid-workout (or extending, which moves endsAt forward and
  // re-fires this effect) schedules against the right moment rather than
  // an arbitrary "now". The endsAt check inside `clear` guards against a
  // stale timeout from an earlier rest period reaching in after a new set
  // has already replaced it with a fresh one.
  useEffect(() => {
    const rt = session.restTimer;
    if (!rt) return;
    const hideAt = rt.endsAt + REST_AUTO_HIDE_SEC * 1000;
    const clear = () =>
      setSession((s) => (s?.restTimer?.endsAt === rt.endsAt ? { ...s, restTimer: undefined } : s));
    const remaining = hideAt - Date.now();
    if (remaining <= 0) {
      clear();
      return;
    }
    const t = setTimeout(clear, remaining);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed off session.restTimer?.endsAt only, not the whole object, so extending (which replaces the object but not this effect's timing basis until endsAt itself changes) doesn't double-schedule
  }, [session.restTimer?.endsAt, setSession]);

  function updateSet(ei: number, si: number, patch: Partial<LiveWorkoutSet>) {
    setSession((s) => {
      if (!s) return s;
      return {
        ...s,
        exercises: s.exercises.map((e, i) =>
          i !== ei
            ? e
            : { ...e, sets: e.sets.map((set, j) => (j !== si ? set : { ...set, ...patch })) },
        ),
      };
    });
  }

  // Pure start/stop/accumulate math for a single timerStart+duration pair
  // — the one implementation of "how a timer starts and stops", reused
  // below for both a set's primary side and (for a unilateral timed
  // exercise) its secondary side, rather than writing the same math twice.
  function toggleTimerValue(current: { timerStart?: number | null; duration?: number }): {
    timerStart: number | null;
    duration: number;
  } {
    const ts = Date.now();
    return current.timerStart != null
      ? {
          timerStart: null,
          duration: (Number(current.duration) || 0) + Math.round((ts - current.timerStart) / 1000),
        }
      : { timerStart: ts, duration: Number(current.duration) || 0 };
  }

  // `side` defaults to "primary" so every existing (bilateral) call site
  // is unaffected. "secondary" targets additionalPerformances[0] instead
  // — the two sides are otherwise identical, just different storage
  // slots for the same start/stop/accumulate math above. Left and right
  // are never mirrored: each side's timer is toggled independently, and
  // nothing here reads the other side's value.
  function toggleTimer(ei: number, si: number, side: "primary" | "secondary" = "primary") {
    setSession((s) => {
      if (!s) return s;
      const set = s.exercises[ei].sets[si];

      if (side === "secondary") {
        const current = set.additionalPerformances?.[0] ?? { weight: 0, reps: 0, duration: 0 };
        const nextSecondary = { ...current, ...toggleTimerValue(current) };
        return {
          ...s,
          exercises: s.exercises.map((e, i) =>
            i !== ei
              ? e
              : {
                  ...e,
                  sets: e.sets.map((x, j) =>
                    j !== si ? x : { ...x, additionalPerformances: [nextSecondary] },
                  ),
                },
          ),
        };
      }

      const patch = toggleTimerValue(set);
      return {
        ...s,
        exercises: s.exercises.map((e, i) =>
          i !== ei ? e : { ...e, sets: e.sets.map((x, j) => (j !== si ? x : { ...x, ...patch })) },
        ),
      };
    });
  }

  function addSet(ei: number) {
    setSession((s) =>
      s
        ? {
            ...s,
            exercises: s.exercises.map((e, i) => {
              if (i !== ei) return e;
              const def = getExercise(e.exerciseId);
              const last = e.sets[e.sets.length - 1];
              const next = {
                ...makeSet(),
                weight: last?.weight ?? 0,
                reps: last?.reps ?? 0,
              };
              // Carry forward each side's own last value independently
              // (not re-mirrored to the new primary) — an asymmetric
              // previous set (e.g. the weaker side did fewer reps) stays
              // asymmetric in the new one, rather than silently resetting
              // the second side back in sync.
              const seeded = seedUnilateralSide(def, next);
              if (seeded.additionalPerformances && last?.additionalPerformances?.[0]) {
                seeded.additionalPerformances = [{ ...last.additionalPerformances[0] }];
              }
              return { ...e, sets: [...e.sets, seeded] };
            }),
          }
        : s,
    );
  }

  function removeSet(ei: number, si: number) {
    setSession((s) => {
      if (!s) return s;
      const setToDelete = s.exercises[ei].sets[si];
      triggerUndo({ exerciseId: s.exercises[ei].exerciseId, set: setToDelete });
      return {
        ...s,
        exercises: s.exercises.map((e, i) =>
          i !== ei ? e : { ...e, sets: e.sets.filter((_, j) => j !== si) },
        ),
      };
    });
  }

  function removeExercise(ei: number) {
    setSession((s) => (s ? { ...s, exercises: s.exercises.filter((_, i) => i !== ei) } : s));
  }

  // Drag-reorder. session.exercises has no reference identity that survives
  // a re-render (it's rebuilt via spreads on every update), so Reorder.Item
  // is keyed on exerciseId — stable, and unique within a single workout: the
  // exercise picker already excludes exercises already added to the session.
  // Reordering never touches any exercise's own data, only array position.
  function reorderExercises(newOrder: string[]) {
    setSession((s) => {
      if (!s) return s;
      const byId = new Map(s.exercises.map((e) => [e.exerciseId, e]));
      return { ...s, exercises: newOrder.map((id) => byId.get(id)!) };
    });
  }

  function setIntervalState(ei: number, next: IntervalTimerState | undefined) {
    setSession((s) =>
      s
        ? {
            ...s,
            exercises: s.exercises.map((e, i) => (i !== ei ? e : { ...e, intervalState: next })),
          }
        : s,
    );
  }

  // An interval exercise (e.g. Rowing Intervals) has no per-set editing UI —
  // its "set" is the whole timed session. On completion this replaces
  // whatever placeholder set(s) existed with exactly one real completed
  // set carrying the actual total duration, so it's recorded (and
  // contributes to Muscle Activity) the same way a normal cardio entry
  // would, rather than leaving a 0-duration dummy set behind. It also
  // stamps the config that was actually used (default or per-workout
  // override) onto that set, so history reflects what was actually done
  // even if the exercise's default later changes.
  function completeIntervalExercise(ei: number) {
    setSession((s) => {
      if (!s) return s;
      const ex = s.exercises[ei];
      const config = ex.intervalConfig ?? getIntervalConfig(getExercise(ex.exerciseId));
      if (!config) return s;
      const totalDuration = config.rounds * (config.workSeconds + config.restSeconds);
      return {
        ...s,
        exercises: s.exercises.map((e, i) =>
          i !== ei
            ? e
            : {
                ...e,
                sets: [
                  {
                    ...makeSet(),
                    duration: totalDuration,
                    completed: true,
                    intervalConfig: config,
                  },
                ],
              },
        ),
      };
    });
  }

  // Adjusts this exercise's interval config for this workout only — the
  // exercise catalog's default is never written to. The first edit forks
  // from the current effective config (override if one exists, else the
  // default); later edits just patch the existing override.
  function updateIntervalConfig(ei: number, patch: Partial<IntervalConfig>) {
    setSession((s) => {
      if (!s) return s;
      const ex = s.exercises[ei];
      const base = ex.intervalConfig ?? getIntervalConfig(getExercise(ex.exerciseId));
      if (!base) return s;
      return {
        ...s,
        exercises: s.exercises.map((e, i) =>
          i !== ei ? e : { ...e, intervalConfig: { ...base, ...patch } },
        ),
      };
    });
  }

  return (
    <div className="flex flex-col gap-4 px-4 pb-8" style={{ paddingTop: hudHeight + 16 }}>
      <WorkoutHUD
        session={session}
        setSession={setSession}
        onFinish={onFinish}
        onHeightChange={setHudHeight}
        celebration={
          celebration
            ? ({ key: celebration.key, label: celebration.label } satisfies WorkoutHUDCelebration)
            : null
        }
      />

      {session.restTimer && (
        <RestTimer
          restTimer={session.restTimer}
          onSkip={handleSkipRest}
          onExtend={handleExtendRest}
        />
      )}

      <Reorder.Group
        as="div"
        axis="y"
        values={session.exercises.map((e) => e.exerciseId)}
        onReorder={reorderExercises}
        className="flex flex-col gap-4"
      >
        {session.exercises.map((ex, ei) => (
          <ExerciseCard
            key={ex.exerciseId}
            ex={ex}
            ei={ei}
            celebration={celebration}
            previousSets={previousByExercise.get(ex.exerciseId)}
            recentReps={recentRepsByExercise.get(ex.exerciseId)}
            removeExercise={removeExercise}
            updateIntervalConfig={updateIntervalConfig}
            setIntervalState={setIntervalState}
            completeIntervalExercise={completeIntervalExercise}
            toggleSetCompletion={toggleSetCompletion}
            removeSet={removeSet}
            updateSet={updateSet}
            toggleTimer={toggleTimer}
            addSet={addSet}
          />
        ))}
      </Reorder.Group>

      <Button onClick={onAddExercise}>
        <Plus className="mr-2 h-4 w-4" /> Add exercise
      </Button>
      <Button
        variant="ghost"
        onClick={() => onFinish(false)}
        className="mt-2 self-center px-6 text-muted-foreground active:text-destructive"
      >
        Cancel
      </Button>

      {undo && (
        <div className="fixed bottom-4 left-4 right-4 z-[9999] mx-auto flex max-w-md items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-foreground shadow-lg pointer-events-auto">
          <span className="text-sm">
            Set deleted{" "}
            <span className="ml-2 text-xs text-muted-foreground">{undoSecondsLeft}s</span>
          </span>
          <button
            onClick={undoDelete}
            className="rounded-lg bg-primary px-3 py-1 text-sm font-medium text-primary-foreground"
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
