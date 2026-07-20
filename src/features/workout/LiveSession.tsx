import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, MoreVertical, Plus, Trash2, X } from "lucide-react";
import { getDb, type WorkoutSet } from "@/lib/db";
import { getExercise, getExerciseLoggingSchema, getIntervalConfig, formatCompletedSet, seedUnilateralSide, type IntervalConfig, type SetSide } from "@/lib/exercises";
import { useUndo } from "@/hooks/useUndo";
import { NumberInput } from "@/components/forms/NumberInput";
import { MmSsInput } from "@/components/forms/MmSsInput";
import { UnilateralSetInputs } from "@/components/forms/UnilateralSetInputs";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { WorkoutTimer, SetTimer } from "./WorkoutTimer";
import { IntervalTimer } from "./IntervalTimer";
import { type ActiveSession, makeSet } from "./workoutHelpers";
import { getKeepAwakeDefault, enableKeepAwake, disableKeepAwake } from "@/lib/keepAwake";
import { haptics } from "@/lib/haptics";
import { useDismissOnBack } from "@/lib/backHandler";

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
// h-8/w-8 (32px) rather than the ideal 44px mobile touch target: these sit
// in a tight 5-column row (set number, one or two steppers, these two
// buttons) that's already close to overflowing on narrow Android screens,
// so this is the largest size that doesn't risk the row wrapping. Revisit
// alongside a wider layout change to that row if more room opens up.
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
        onClick={() => {
          if (!completed) haptics.setComplete();
          onToggleComplete();
        }}
        aria-label={completed ? "Mark set incomplete" : "Mark set complete"}
        className={`flex h-8 w-8 items-center justify-center rounded transition-colors duration-150 active:scale-90 ${completed ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}
      >
        <Check className="h-4 w-4" />
      </button>
      <button
        onClick={onDelete}
        aria-label="Delete set"
        className="flex h-8 w-8 items-center justify-center rounded text-muted-foreground transition-colors active:bg-secondary active:text-foreground"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </>
  );
}

export function LiveSession({
  session,
  setSession,
  onAddExercise,
  onFinish,
}: LiveSessionProps) {
  const exerciseIds = session.exercises.map((e) => e.exerciseId);

  // ── Keep screen awake (temporary, per-workout override) ────────────────
  // Initialized fresh from the saved Settings default every time this
  // component mounts — i.e. every time a new workout starts. Changing it
  // only ever updates this local state; the saved default is never touched.
  const [keepAwake, setKeepAwake] = useState(() => getKeepAwakeDefault());
  const [optionsOpen, setOptionsOpen] = useState(false);
  useDismissOnBack(optionsOpen, () => setOptionsOpen(false));

  useEffect(() => {
    if (keepAwake) {
      enableKeepAwake();
    } else {
      disableKeepAwake();
    }
    // Runs on every exit path — Finish, Cancel, or navigating away all
    // unmount LiveSession, and React guarantees this cleanup fires
    // regardless of which of those caused it.
    return () => {
      disableKeepAwake();
    };
  }, [keepAwake]);

  const previousByExerciseResult = useLiveQuery(
    async (): Promise<Map<string, WorkoutSet[]>> => {
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
    },
    [exerciseIds.join(","), session.startedAt],
  );

  const previousByExercise: Map<string, WorkoutSet[]> =
    previousByExerciseResult ?? new Map();

  const {
    undoItem: undo,
    secondsLeft: undoSecondsLeft,
    trigger: triggerUndo,
    undo: undoDelete,
  } = useUndo<{ exerciseId: string; set: WorkoutSet & { timerStart?: number | null } }>({
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

  function updateSet(
    ei: number,
    si: number,
    patch: Partial<WorkoutSet & { timerStart: number | null }>,
  ) {
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

  function toggleTimer(ei: number, si: number) {
    setSession((s) => {
      if (!s) return s;
      const set = s.exercises[ei].sets[si];
      const ts = Date.now();
      const patch =
        set.timerStart != null
          ? {
              timerStart: null,
              duration:
                (Number(set.duration) || 0) + Math.round((ts - set.timerStart) / 1000),
            }
          : { timerStart: ts };
      return {
        ...s,
        exercises: s.exercises.map((e, i) =>
          i !== ei
            ? e
            : { ...e, sets: e.sets.map((x, j) => (j !== si ? x : { ...x, ...patch })) },
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
    setSession((s) =>
      s ? { ...s, exercises: s.exercises.filter((_, i) => i !== ei) } : s,
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
                  { ...makeSet(), duration: totalDuration, completed: true, intervalConfig: config },
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
    <div className="flex flex-col gap-4 px-4 pt-4 pb-8">
      <header className="flex items-center justify-between">
        <input
          value={session.name}
          onChange={(e) =>
            setSession((s) => (s ? { ...s, name: e.target.value } : s))
          }
          className="min-w-0 flex-1 bg-transparent text-lg font-bold outline-none"
        />
        <WorkoutTimer startedAt={session.startedAt} />
      </header>

      <div className="flex justify-end">
        <div className="relative">
          <button
            onClick={() => setOptionsOpen((o) => !o)}
            aria-label="Workout options"
            className="flex h-11 w-11 items-center justify-center text-muted-foreground transition-colors active:text-foreground"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
          {optionsOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setOptionsOpen(false)} />
              <div className="absolute right-0 top-11 z-50 w-64 rounded-xl border border-border bg-card p-3 shadow-xl">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm">Keep screen on</span>
                  <Switch checked={keepAwake} onCheckedChange={setKeepAwake} />
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {session.exercises.map((ex, ei) => {
        const def = getExercise(ex.exerciseId);
        const schema = getExerciseLoggingSchema(def);
        const defaultIntervalConfig = getIntervalConfig(def);
        const intervalConfig = ex.intervalConfig ?? defaultIntervalConfig;
        return (
          <div key={ei} className="rounded-xl bg-card p-3">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
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

            {(() => {
              const prev = previousByExercise.get(ex.exerciseId);
              if (!prev || prev.length === 0) return null;
              return (
                <div className="mt-2 rounded-md bg-secondary/50 px-2 py-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Previous Workout
                  </p>
                  <ul className="mt-0.5 text-xs tabular-nums text-foreground/80">
                    {prev.map((s, i) => (
                      <li key={i}>{formatCompletedSet(def, s)}</li>
                    ))}
                  </ul>
                </div>
              );
            })()}

            {intervalConfig && !ex.intervalState && (
              <div className="mt-3 flex items-center justify-between gap-2 rounded-md bg-secondary/50 px-3 py-2">
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
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Work
                  </span>
                  <MmSsInput
                    seconds={intervalConfig.workSeconds}
                    onCommit={(v) => updateIntervalConfig(ei, { workSeconds: v })}
                  />
                </label>
                <label className="flex flex-col items-center gap-1">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Rest
                  </span>
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
                onChange={(next) =>
                  setSession((s) =>
                    s
                      ? {
                          ...s,
                          exercises: s.exercises.map((e, i) =>
                            i !== ei ? e : { ...e, intervalState: next },
                          ),
                        }
                      : s,
                  )
                }
                onComplete={() => completeIntervalExercise(ei)}
              />
            )}

            {!intervalConfig && schema.unilateral && (
              <div className="mt-3 flex flex-col gap-2">
                {ex.sets.map((s, si) => {
                  const primary: SetSide = { weight: s.weight ?? 0, reps: s.reps ?? 0, duration: s.duration };
                  const secondary: SetSide = s.additionalPerformances?.[0] ?? {
                    weight: 0,
                    reps: 0,
                    duration: 0,
                  };
                  return (
                    <div key={si} className="rounded-lg bg-secondary/40 p-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">Set {si + 1}</span>
                        <div className="flex items-center gap-2">
                          <SetActionButtons
                            completed={s.completed}
                            onToggleComplete={() => updateSet(ei, si, { completed: !s.completed })}
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
                  className="mt-1 w-full rounded-lg bg-primary/10 py-2 text-sm font-medium text-primary active:bg-primary/15"
                >
                  + Add set
                </button>
              </div>
            )}

            {!intervalConfig && !schema.unilateral && (
              <>
                <div className="mt-3 grid grid-cols-[24px_1fr_1fr_auto_auto] items-center gap-2 text-xs text-muted-foreground">
                  <span>{schema.distance ? "Set" : "#"}</span>
                  <span>{schema.distance ? "Km" : schema.duration ? "Sec" : "Kg"}</span>
                  <span>{schema.distance ? "Time" : schema.duration ? "" : "Reps"}</span>
                  <span />
                  <span />
                </div>

                {ex.sets.map((s, si) => (
                  <div
                    key={si}
                    className="mt-2 grid grid-cols-[24px_1fr_1fr_auto_auto] items-center gap-2"
                  >
                    <span className="text-sm font-semibold">{si + 1}</span>

                    {schema.distance ? (
                      <>
                        <div className="flex items-center bg-secondary rounded-lg overflow-hidden h-8 border w-fit">
                          <button
                            onClick={() => updateSet(ei, si, { weight: Math.max(0, (s.weight ?? 0) - 0.1) })}
                            className="w-7 h-full text-sm"
                          >−</button>
                          <NumberInput value={s.weight ?? 0} onCommit={(v) => updateSet(ei, si, { weight: v })} decimal min={0} placeholder="0" className="w-12" />
                          <button
                            onClick={() => updateSet(ei, si, { weight: (s.weight ?? 0) + 0.1 })}
                            className="w-7 h-full text-sm"
                          >+</button>
                        </div>
                        <div className="flex items-center gap-2">
                          <SetTimer duration={s.duration ?? 0} timerStart={s.timerStart} />
                          <button
                            onClick={() => toggleTimer(ei, si)}
                            className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground"
                          >
                            {s.timerStart ? "■" : "▶"}
                          </button>
                        </div>
                      </>
                    ) : schema.duration ? (
                      <>
                        <div className="flex items-center gap-2">
                          <SetTimer duration={s.duration ?? 0} timerStart={s.timerStart} />
                          <button
                            onClick={() => toggleTimer(ei, si)}
                            className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground"
                          >
                            {s.timerStart ? "■" : "▶"}
                          </button>
                        </div>
                        <span />
                      </>
                    ) : (
                      <>
                        <div className="flex items-center bg-secondary rounded-lg overflow-hidden h-8 border w-fit">
                          <button
                            onClick={() => updateSet(ei, si, { weight: Math.max(0, (s.weight ?? 0) - 2.5) })}
                            className="w-7 h-full text-sm"
                          >−</button>
                          <NumberInput value={s.weight ?? 0} onCommit={(v) => updateSet(ei, si, { weight: v })} decimal min={0} placeholder="0" className="w-12" />
                          <button
                            onClick={() => updateSet(ei, si, { weight: (s.weight ?? 0) + 2.5 })}
                            className="w-7 h-full text-sm"
                          >+</button>
                        </div>
                        <div className="flex items-center bg-secondary rounded-lg overflow-hidden h-8 border w-fit">
                          <button
                            onClick={() => updateSet(ei, si, { reps: Math.max(0, (s.reps ?? 0) - 1) })}
                            className="w-7 h-full text-sm"
                          >−</button>
                          <NumberInput value={s.reps ?? 0} onCommit={(v) => updateSet(ei, si, { reps: v })} min={0} placeholder="0" className="w-12" />
                          <button
                            onClick={() => updateSet(ei, si, { reps: (s.reps ?? 0) + 1 })}
                            className="w-7 h-full text-sm"
                          >+</button>
                        </div>
                      </>
                    )}

                    <SetActionButtons
                      completed={s.completed}
                      onToggleComplete={() => updateSet(ei, si, { completed: !s.completed })}
                      onDelete={() => removeSet(ei, si)}
                    />
                  </div>
                ))}

                <button
                  onClick={() => addSet(ei)}
                  className="mt-3 w-full rounded-lg bg-primary/10 py-2 text-sm font-medium text-primary active:bg-primary/15"
                >
                  + Add set
                </button>
              </>
            )}
          </div>
        );
      })}

      <Button onClick={onAddExercise}>
        <Plus className="mr-2 h-4 w-4" /> Add exercise
      </Button>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={() => onFinish(false)} className="text-destructive">
          Cancel
        </Button>
        <Button onClick={() => onFinish(true)}>Finish</Button>
      </div>

      {undo && (
        <div className="fixed bottom-4 left-4 right-4 z-[9999] mx-auto flex max-w-md items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-foreground shadow-lg pointer-events-auto">
          <span className="text-sm">
            Set deleted{" "}
            <span className="ml-2 text-xs text-muted-foreground">{undoSecondsLeft}s</span>
          </span>
          <button
            onClick={undoDelete}
            className="rounded bg-primary px-3 py-1 text-sm font-medium text-primary-foreground"
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
