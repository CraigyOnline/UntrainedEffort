import { useCallback, useEffect, useMemo, useState } from "react";
import { useBlocker } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react";
import { getDb, type Routine, type RoutineSet } from "@/lib/db";
import { getExercise, getExerciseLoggingSchema } from "@/lib/exercises";
import { ExercisePicker } from "@/components/forms/ExercisePicker";
import { MmSsInput } from "@/components/forms/MmSsInput";
import { StepperInput } from "@/components/forms/NumberInput";
import { Button } from "@/components/ui/button";
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
import { BOTTOM_NAV_HEIGHT } from "@/components/BottomTabs";
import { useDismissOnBack } from "@/lib/backHandler";

export function RoutineEditor({
  initial,
  onClose,
}: {
  initial: Routine | null;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [exercises, setExercises] = useState<Routine["exercises"]>(
    initial?.exercises ?? [],
  );
  const [picking, setPicking] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const hasChanges = useMemo(() => {
    if (!initial) return name.trim() !== "" || exercises.length > 0;
    if (name !== initial.name) return true;
    if (exercises.length !== initial.exercises.length) return true;
    return exercises.some((e, i) => {
      const init = initial.exercises[i];
      return (
        !init ||
        e.exerciseId !== init.exerciseId ||
        e.sets.length !== init.sets.length ||
        e.sets.some(
          (s, si) =>
            s.targetWeight !== init.sets[si]?.targetWeight ||
            s.targetReps !== init.sets[si]?.targetReps ||
            s.targetDuration !== init.sets[si]?.targetDuration,
        )
      );
    });
  }, [name, exercises, initial]);

  const blocker = useBlocker({ shouldBlockFn: () => hasChanges, withResolver: true });

  useEffect(() => {
    if (blocker.status === "blocked") setConfirmOpen(true);
  }, [blocker.status]);

  const handleClose = useCallback(() => {
    if (hasChanges) setConfirmOpen(true);
    else onClose();
  }, [hasChanges, onClose]);

  // RoutineEditor is a full-screen overlay within the /workout route, not
  // a separate route itself — without this, Android back would fall
  // through to route history and exit /workout entirely, skipping past
  // the editor instead of closing it first.
  useDismissOnBack(true, handleClose);

  const handleDiscard = useCallback(() => {
    setConfirmOpen(false);
    if (blocker.status === "blocked") blocker.proceed();
    else onClose();
  }, [blocker, onClose]);

  const handleCancel = useCallback(() => {
    setConfirmOpen(false);
    if (blocker.status === "blocked") blocker.reset();
  }, [blocker]);

  function moveUp(i: number) {
    if (i === 0) return;
    setExercises((xs) => {
      const n = [...xs];
      [n[i - 1], n[i]] = [n[i], n[i - 1]];
      return n;
    });
  }

  function moveDown(i: number) {
    setExercises((xs) => {
      if (i >= xs.length - 1) return xs;
      const n = [...xs];
      [n[i + 1], n[i]] = [n[i], n[i + 1]];
      return n;
    });
  }

  async function save() {
    const trimmed = name.trim();
    if (!trimmed || exercises.length === 0) return;
    const db = getDb();
    if (initial?.id) {
      await db.routines.update(initial.id, { name: trimmed, exercises });
    } else {
      // New routines go at the end of the manual order.
      const last = await db.routines.orderBy("sortOrder").last();
      const sortOrder = (last?.sortOrder ?? -1) + 1;
      await db.routines.add({ name: trimmed, exercises, createdAt: Date.now(), sortOrder });
    }
    onClose();
  }

  return (
    <div
      className="fixed inset-x-0 top-0 z-50 flex justify-center bg-background pt-[env(safe-area-inset-top)]"
      style={{ bottom: `${BOTTOM_NAV_HEIGHT}px` }}
    >
      <div className="flex h-full w-full max-w-md flex-col">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <button onClick={handleClose} className="p-2">
            <X className="h-5 w-5" />
          </button>
          <h2 className="text-base font-semibold">
            {initial ? "Edit routine" : "New routine"}
          </h2>
          <button
            onClick={save}
            disabled={!name.trim() || exercises.length === 0}
            className="rounded-full px-4 py-1.5 text-sm font-semibold bg-primary text-primary-foreground disabled:opacity-40 active:opacity-80"
          >
            Save
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4 pb-6">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Routine name"
            className="w-full rounded-xl bg-card px-4 py-3 text-lg font-semibold outline-none focus:ring-2 focus:ring-ring"
          />

          <p className="mt-4 text-xs text-muted-foreground">
            Add exercises to build your session
          </p>

          <ul className="mt-3 flex flex-col gap-2">
            {exercises.map((e, i) => {
              const def = getExercise(e.exerciseId);
              const schema = getExerciseLoggingSchema(def);
              return (
                <li
                  key={i}
                  className="flex items-center justify-between rounded-xl bg-card px-4 py-3 gap-5"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{def?.name ?? e.exerciseId}</p>
                    <p className="text-xs text-muted-foreground">{def?.muscle}</p>

                    <div className="mt-3 space-y-1">
                      {schema.interval ? (
                        <p className="px-1 text-xs text-muted-foreground">
                          Rounds, work, and rest are set when you start the workout.
                        </p>
                      ) : (
                        <>
                          <div className="grid grid-cols-[20px_auto_auto_20px] gap-3 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            <span>#</span>
                            {schema.distance ? (
                              <><span>Km</span><span>Time</span></>
                            ) : schema.duration ? (
                              <><span>Time</span><span /></>
                            ) : (
                              <><span>Kg</span><span>Reps</span></>
                            )}
                            <span />
                          </div>

                          {e.sets.map((s: RoutineSet, si: number) => (
                            <div
                              key={si}
                              className="grid grid-cols-[20px_auto_auto_20px] items-center gap-3"
                            >
                              <span className="text-xs font-semibold text-muted-foreground">
                                {si + 1}
                              </span>

                              {schema.distance ? (
                                <>
                                  <StepperInput
                                    value={s.targetWeight ?? 0}
                                    onCommit={(v) => setExercises((xs) => xs.map((x, idx) => idx !== i ? x : { ...x, sets: x.sets.map((rs, ri) => ri === si ? { ...rs, targetWeight: v } : rs) }))}
                                    step={0.1} decimal min={0} size="compact"
                                  />
                                  <MmSsInput
                                    seconds={s.targetDuration ?? 0}
                                    onCommit={(secs) => setExercises((xs) => xs.map((x, idx) => idx !== i ? x : { ...x, sets: x.sets.map((rs, ri) => ri === si ? { ...rs, targetDuration: secs } : rs) }))}
                                  />
                                </>
                              ) : schema.duration ? (
                                <>
                                  <MmSsInput
                                    seconds={s.targetDuration ?? 0}
                                    onCommit={(secs) => setExercises((xs) => xs.map((x, idx) => idx !== i ? x : { ...x, sets: x.sets.map((rs, ri) => ri === si ? { ...rs, targetDuration: secs } : rs) }))}
                                  />
                                  <span />
                                </>
                              ) : (
                                <>
                                  <StepperInput
                                    value={s.targetWeight ?? 0}
                                    onCommit={(v) => setExercises((xs) => xs.map((x, idx) => idx !== i ? x : { ...x, sets: x.sets.map((rs, ri) => ri === si ? { ...rs, targetWeight: v } : rs) }))}
                                    step={2.5} decimal min={0} size="compact"
                                  />
                                  <StepperInput
                                    value={s.targetReps ?? 0}
                                    onCommit={(v) => setExercises((xs) => xs.map((x, idx) => idx !== i ? x : { ...x, sets: x.sets.map((rs, ri) => ri === si ? { ...rs, targetReps: v } : rs) }))}
                                    step={1} min={0} size="compact"
                                  />
                                </>
                              )}

                              <button
                                type="button"
                                disabled={e.sets.length <= 1}
                                onClick={() => setExercises((xs) => xs.map((x, idx) => idx !== i ? x : { ...x, sets: x.sets.filter((_, ri) => ri !== si) }))}
                                className="text-muted-foreground disabled:opacity-20"
                                aria-label="Remove set"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}

                          <button
                            type="button"
                            onClick={() => setExercises((xs) => xs.map((x, idx) => {
                              if (idx !== i) return x;
                              const last = x.sets[x.sets.length - 1] ?? {};
                              return { ...x, sets: [...x.sets, { ...last }] };
                            }))}
                            className="mt-1 flex w-full items-center justify-center gap-1 rounded-lg border border-primary/20 bg-primary/10 py-1.5 text-xs font-medium text-primary active:bg-primary/15"
                          >
                            <Plus className="h-3 w-3" /> Add set
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-center gap-2">
                    <button
                      onClick={() => moveUp(i)}
                      disabled={i === 0}
                      className="rounded p-1 text-muted-foreground disabled:opacity-30"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => moveDown(i)}
                      disabled={i === exercises.length - 1}
                      className="rounded p-1 text-muted-foreground disabled:opacity-30"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setExercises((xs) => xs.filter((_, j) => j !== i))}
                      className="rounded p-1 text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          <Button className="mt-4 w-full" onClick={() => setPicking(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add exercise
          </Button>
        </div>
      </div>

      {picking && (
        <ExercisePicker
          onClose={() => setPicking(false)}
          onPick={(id) => {
            setExercises((xs) => [...xs, { exerciseId: id, sets: [{}] }]);
            setPicking(false);
          }}
          addedIds={new Set(exercises.map((e) => e.exerciseId))}
        />
      )}

      <AlertDialog open={confirmOpen} onOpenChange={(open) => !open && handleCancel()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your changes to this routine haven't been saved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancel}>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={handleDiscard}>Discard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
