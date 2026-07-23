import { createFileRoute, useNavigate, useRouter, Link, useBlocker } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useUndo } from "@/hooks/useUndo";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Check, Trash2, X, Pencil, Save } from "lucide-react";
import { getDb, type Workout, type WorkoutExerciseLog, type PRRecord } from "@/lib/db";
import { getExercise, isCardio, isTimeBased, getExerciseLoggingSchema, getIntervalConfig, formatCompletedSet, seedUnilateralSide, type SetSide } from "@/lib/exercises";
import { syncWorkoutIntegrity } from "@/lib/workoutIntegrity";
import { ExercisePicker } from "@/components/forms/ExercisePicker";
import { MmSsInput } from "@/components/forms/MmSsInput";
import { StepperInput } from "@/components/forms/NumberInput";
import { UnilateralSetInputs } from "@/components/forms/UnilateralSetInputs";
import { Button } from "@/components/ui/button";
import { WorkoutSummary } from "@/components/WorkoutSummary";
import { formatDuration } from "@/lib/format";
import { haptics } from "@/lib/haptics";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_app/history/$id")({
  component: HistoryDetailPage,
});

function HistoryDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const router = useRouter();

  const [workout, setWorkout] = useState<Workout | null | undefined>(undefined);

  const workoutPRs = useLiveQuery(async () => {
    if (typeof window === "undefined" || !workout?.id) return [];
    return getDb().prHistory.where("workoutId").equals(workout.id).toArray();
  }, [workout?.id]) as PRRecord[] | undefined;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Workout | null>(null);
  const [picking, setPicking] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);

  // ── Unsaved changes detection ─────────────────────────────────────────────
  // Compare draft to the last saved workout. JSON stringify is acceptable here
  // because WorkoutSet values are plain numbers/booleans with stable key order.
  const hasChanges = useMemo(() => {
    if (!editing || !draft || !workout) return false;
    return (
      draft.name !== workout.name ||
      JSON.stringify(draft.exercises) !== JSON.stringify(workout.exercises)
    );
  }, [editing, draft, workout]);

  // Guards browser/router back navigation while editing with unsaved changes
  const blocker = useBlocker({
    shouldBlockFn: () => hasChanges,
    withResolver: true,
  });

  useEffect(() => {
    if (blocker.status === "blocked") {
      setDiscardOpen(true);
    }
  }, [blocker.status]);

  const handleDiscard = useCallback(() => {
    setDiscardOpen(false);
    setEditing(false);
    setDraft(null);
    if (blocker.status === "blocked") blocker.proceed();
  }, [blocker]);

  const handleKeepEditing = useCallback(() => {
    setDiscardOpen(false);
    if (blocker.status === "blocked") blocker.reset();
  }, [blocker]);

  // ── Undo state ───────────────────────────────────────────────────────
  const {
    undoItem: undo,
    secondsLeft: timeLeft,
    trigger: triggerUndo,
    undo: undoDeleteSet,
  } = useUndo<{ exerciseId: string; set: WorkoutExerciseLog["sets"][0] }>({
    duration: 3,
    onUndo: ({ exerciseId, set }) => {
      setDraft((d) => {
        if (!d) return d;
        const exIdx = d.exercises.findIndex((e) => e.exerciseId === exerciseId);
        if (exIdx === -1) return d;
        const ex = d.exercises[exIdx];
        if (set.id && ex.sets.some((x) => x.id === set.id)) return d;
        const newExercises = [...d.exercises];
        newExercises[exIdx] = { ...ex, sets: [...ex.sets, set] };
        return { ...d, exercises: newExercises };
      });
    },
  });

  function newSetId(): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
    return `s_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  useEffect(() => {
    const n = Number(id);
    if (!Number.isFinite(n)) {
      setWorkout(null);
      return;
    }
    getDb()
      .workouts.get(n)
      .then((w) => setWorkout(w ?? null));
  }, [id]);

  if (workout === undefined)
    return <div className="px-4 pt-8 text-sm text-muted-foreground">Loading…</div>;
  if (workout === null)
    return (
      <div className="flex flex-col gap-4 px-4 pt-6">
        <p className="text-sm text-muted-foreground">Workout not found.</p>
        <Link to="/history" className="text-sm text-primary underline">
          Back to history
        </Link>
      </div>
    );

  const view = editing && draft ? draft : workout;

  function startEdit() {
    setDraft(JSON.parse(JSON.stringify(workout)));
    setEditing(true);
  }

  // Editing a past workout can invalidate an existing PR (a downward
  // correction, a removed set) in a way incremental "does this beat the
  // best" logic can't detect — so this goes through the full rebuild
  // rather than writing new PRs incrementally. Wrapped in one transaction
  // with the update itself so a failed rebuild rolls back the edit too.
  async function save() {
    if (!draft?.id) return;
    const db = getDb();
    await db.transaction("rw", db.workouts, db.prHistory, async () => {
      await db.workouts.update(draft.id!, {
        name: draft.name,
        exercises: draft.exercises,
      });
      await syncWorkoutIntegrity();
    });
    setWorkout(draft);
    setEditing(false);
  }



  function removeSet(ei: number, si: number) {
    if (!draft) return;
    const setToDelete = draft.exercises[ei].sets[si];
    if (!setToDelete) return;

    const newExercises = draft.exercises.map((e, i) =>
      i !== ei ? e : { ...e, sets: e.sets.filter((_, j) => j !== si) },
    );
    setDraft({ ...draft, exercises: newExercises });
    triggerUndo({ exerciseId: draft.exercises[ei].exerciseId, set: setToDelete });
  }

  function patchSet(
    ei: number,
    si: number,
    p: Partial<{
      weight: number;
      reps: number;
      duration: number;
      completed: boolean;
      additionalPerformances: SetSide[];
    }>,
  ) {
    if (!draft) return;
    setDraft((d) => {
      if (!d) return d;
      return {
        ...d,
        exercises: d.exercises.map((e, i) =>
          i !== ei
            ? e
            : {
                ...e,
                sets: e.sets.map((s, j) => (j !== si ? s : { ...s, ...p })),
              },
        ),
      };
    });
  }

  function addSet(ei: number) {
    setDraft((d) =>
      d
        ? {
            ...d,
            exercises: d.exercises.map((e, i) => {
              if (i !== ei) return e;
              const def = getExercise(e.exerciseId);
              const last = e.sets.at(-1);
              const next = seedUnilateralSide(def, {
                id: newSetId(),
                weight: last?.weight ?? 0,
                reps: last?.reps ?? 0,
                duration: last?.duration ?? 0,
                completed: true,
              });
              if (next.additionalPerformances && last?.additionalPerformances?.[0]) {
                next.additionalPerformances = [{ ...last.additionalPerformances[0] }];
              }
              return { ...e, sets: [...e.sets, next] };
            }),
          }
        : d,
    );
  }

  function removeExercise(ei: number) {
    setDraft((d) =>
      d ? { ...d, exercises: d.exercises.filter((_, i) => i !== ei) } : d,
    );
  }

  function addExercise(id: string) {
    setDraft((d) =>
      d
        ? {
            ...d,
            exercises: [
              ...d.exercises,
              {
                exerciseId: id,
                sets: [
                  seedUnilateralSide(getExercise(id), {
                    id: newSetId(),
                    weight: 0,
                    reps: 0,
                    duration: 0,
                    completed: true,
                  }),
                ],
              },
            ],
          }
        : d,
    );
    setPicking(false);
  }

  async function confirmDelete() {
    const db = getDb();
    await db.transaction("rw", db.workouts, db.prHistory, async () => {
      await db.workouts.delete(workout.id!);
      await syncWorkoutIntegrity();
    });
    navigate({ to: "/history" });
  }

  return (
    <div className="flex flex-col gap-4 px-4 pt-4 pb-8">
      <header className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
        <button onClick={() => router.history.back()}>
          <ArrowLeft className="h-5 w-5" />
        </button>
        {editing ? (
          <input
            value={draft?.name ?? ""}
            onChange={(e) =>
              setDraft((d) => (d ? { ...d, name: e.target.value } : d))
            }
            className="rounded bg-card px-2 py-1 font-semibold"
          />
        ) : (
          <h1 className="truncate font-bold">{view.name}</h1>
        )}
        {editing ? (
          <button onClick={save}>
            <Save className="h-4 w-4" />
          </button>
        ) : (
          <button onClick={startEdit}>
            <Pencil className="h-4 w-4" />
          </button>
        )}
      </header>

      <WorkoutSummary durationSec={view.durationSec} exercises={view.exercises} />

      {workoutPRs && workoutPRs.length > 0 && (
        <div className="rounded-xl bg-card p-4 flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Personal Records 🏆</h2>
          {workoutPRs.map((pr, i) => {
            const def = getExercise(pr.exerciseId);
            const name = def?.name ?? pr.exerciseId;
            const typeLabel = pr.type === "weight" ? "Weight" : pr.type === "reps" ? "Reps" : "Duration";
            const fmt = (v: number) => pr.type === "time"
              ? (v >= 60 ? `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}` : `${v}s`)
              : pr.type === "weight" ? `${v}kg` : `${v}`;
            const isFirst = (pr.previousBest ?? 0) === 0;
            return (
              <div key={i} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{name}</p>
                  <p className="text-xs text-muted-foreground">
                    {typeLabel} •{" "}
                    {isFirst
                      ? <span className="text-primary">First PR ({fmt(pr.value)})</span>
                      : <span>{fmt(pr.previousBest ?? 0)} → <span className="text-primary font-semibold">{fmt(pr.value)}</span></span>
                    }
                  </p>
                </div>
                {!isFirst && (
                  <span className="shrink-0 text-xs font-semibold text-primary">
                    +{fmt(pr.delta ?? (pr.value - (pr.previousBest ?? 0)))}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {view.exercises.map((ex, ei) => {
        const def = getExercise(ex.exerciseId);
        const timeBased = isTimeBased(def);
        const cardio = isCardio(def);
        const schema = getExerciseLoggingSchema(def);
        const intervalConfig = ex.sets[0]?.intervalConfig ?? getIntervalConfig(def);
        return (
          <div key={ei} className="rounded-xl bg-card p-4">
            <div className="flex justify-between">
              <div>
                {editing ? (
                  <p className="font-semibold">{def?.name || "Unknown Exercise"}</p>
                ) : (
                  <Link
                    to="/exercise/$id"
                    params={{ id: ex.exerciseId }}
                    className="font-semibold hover:text-primary transition-colors"
                  >
                    {def?.name || "Unknown Exercise"}
                  </Link>
                )}
                <p className="text-xs text-muted-foreground">{def?.muscle}</p>
                {intervalConfig && (
                  <p className="text-xs text-muted-foreground">
                    {intervalConfig.rounds} rounds · {formatDuration(intervalConfig.workSeconds)} work
                    / {formatDuration(intervalConfig.restSeconds)} rest
                  </p>
                )}
              </div>
              {editing && (
                <button onClick={() => removeExercise(ei)}>
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="mt-2 space-y-3">
              {ex.sets.map((s, si) => (
                <div
                  key={si}
                  className="flex gap-4 items-center justify-between py-1 text-sm border-b border-muted/10"
                >
                  <div className="flex flex-col gap-2 min-w-0 flex-1">
                    <span className="font-semibold text-xs text-muted-foreground">
                      Set {si + 1}
                    </span>
                    {editing && !schema.interval ? (
                      schema.unilateral ? (
                        <UnilateralSetInputs
                          schema={schema}
                          primary={{ weight: s.weight ?? 0, reps: s.reps ?? 0, duration: s.duration }}
                          secondary={
                            s.additionalPerformances?.[0] ?? { weight: 0, reps: 0, duration: 0 }
                          }
                          size="compact"
                          mode={{ kind: "history" }}
                          onChange={({ primary: p, secondary: sec }) =>
                            patchSet(ei, si, {
                              weight: p.weight,
                              reps: p.reps,
                              duration: p.duration,
                              additionalPerformances: [sec],
                            })
                          }
                        />
                      ) : (
                        <div className="flex flex-wrap gap-4 items-center">
                          {schema.weight !== "hidden" && (
                            <div className="flex flex-col gap-1">
                              <span className="text-[10px] uppercase font-bold text-muted-foreground/60">
                                Weight (kg)
                              </span>
                              <StepperInput
                                value={s.weight ?? 0}
                                onCommit={(v) => patchSet(ei, si, { weight: v })}
                                step={2.5}
                                decimal
                                min={0}
                              />
                            </div>
                          )}
                          {cardio && (
                            <div className="flex flex-col gap-1">
                              <span className="text-[10px] uppercase font-bold text-muted-foreground/60">
                                Km
                              </span>
                              <StepperInput
                                value={s.weight ?? 0}
                                onCommit={(v) => patchSet(ei, si, { weight: v })}
                                step={0.1}
                                decimal
                                min={0}
                              />
                            </div>
                          )}
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] uppercase font-bold text-muted-foreground/60">
                              {timeBased ? "Time (mm:ss)" : "Reps"}
                            </span>
                            {timeBased ? (
                              <MmSsInput
                                seconds={s.duration ?? 0}
                                onCommit={(secs) => patchSet(ei, si, { duration: secs })}
                              />
                            ) : (
                              <StepperInput
                                value={s.reps ?? 0}
                                onCommit={(v) => patchSet(ei, si, { reps: v })}
                                step={1}
                                min={0}
                              />
                            )}
                          </div>
                        </div>
                      )
                    ) : (
                      <div className="flex items-center gap-1.5 font-medium">
                        <span>{formatCompletedSet(def, s)}</span>
                      </div>
                    )}
                  </div>
                  <div className="self-end pb-1.5">
                    {editing ? (
                      <button
                        onClick={() => removeSet(ei, si)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : (
                      s.completed && <Check className="h-5 w-5 text-primary" />
                    )}
                  </div>
                </div>
              ))}
            </div>
            {editing && !schema.interval && (
              <button
                onClick={() => addSet(ei)}
                className="mt-4 w-full py-2 bg-primary/10 text-xs font-semibold rounded-lg text-primary active:bg-primary/15"
              >
                + Add set
              </button>
            )}
          </div>
        );
      })}

      {editing ? (
        <>
          <Button onClick={() => setPicking(true)}>Add exercise</Button>
          <Button
            variant="ghost"
            onClick={() => {
              if (hasChanges) setDiscardOpen(true);
              else { setEditing(false); setDraft(null); }
            }}
          >
            Cancel
          </Button>
        </>
      ) : (
        <Button
          variant="ghost"
          onClick={() => setDeleteDialogOpen(true)}
          className="text-destructive"
        >
          Delete workout
        </Button>
      )}

      {picking && (
        <ExercisePicker
          onClose={() => setPicking(false)}
          onPick={addExercise}
          addedIds={new Set((draft?.exercises ?? []).map((e) => e.exerciseId))}
        />
      )}

      {undo && (
        <div className="fixed bottom-4 left-4 right-4 z-[9999] mx-auto flex max-w-md items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-foreground shadow-lg pointer-events-auto">
          <span className="text-sm">Set deleted — Undo in {timeLeft}s</span>
          <button
            onClick={() => undoDeleteSet()}
            className="rounded bg-primary px-3 py-1 text-sm font-medium text-primary-foreground"
          >
            Undo
          </button>
        </div>
      )}

      <AlertDialog open={discardOpen} onOpenChange={(open) => { if (!open) handleKeepEditing(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes to this workout. They will be lost if you go back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleKeepEditing}>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                haptics.delete();
                handleDiscard();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete workout?</AlertDialogTitle>
            <AlertDialogDescription>
              "{workout.name}" will be permanently deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                haptics.delete();
                confirmDelete();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
