import { createFileRoute, useNavigate, useBlocker } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { PageHeader } from "@/components/PageHeader";
import {
  getDb,
  type Routine,
  type RoutineExercise,
  type RoutineSet,
  type Workout,
  type WorkoutExerciseLog,
  type CircuitConfig,
} from "@/lib/db";
import { getExercise, seedUnilateralSide } from "@/lib/exercises";
import { ExercisePicker } from "@/components/forms/ExercisePicker";
import { EmptyState } from "@/components/EmptyState";
import { intensityFromExerciseIds } from "@/lib/muscles";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowDown, ArrowUp, Dumbbell, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { useDismissOnBack } from "@/lib/backHandler";
import {
  detectRoutineChange,
  doSaveWorkout,
  findProgressionSuggestion,
  makeSet,
  sessionHasData,
} from "@/features/workout/workoutHelpers";
import { getRoutineUpdatePromptEnabled } from "@/lib/routineUpdatePrompt";
import {
  getProgressionSuggestionsEnabled,
  type ProgressionSuggestion,
} from "@/lib/progressionSuggestions";
import type { CompletionMessage } from "@/lib/completionMessages";
import { useActiveWorkoutDraft } from "@/features/workout/useActiveWorkoutDraft";
import { LiveSession } from "@/features/workout/LiveSession";
import { WorkoutCompleteScreen } from "@/features/workout/WorkoutCompleteScreen";
import { CircuitLiveSession } from "@/features/workout/CircuitLiveSession";
import { QuickCircuitSetup } from "@/features/workout/QuickCircuitSetup";
import { RoutineEditor } from "@/features/workout/RoutineEditor";
import { CircuitRoutineEditor } from "@/features/workout/CircuitRoutineEditor";
import { ExpandableMuscleMap } from "@/components/ExpandableMuscleMap";
import { type MuscleGroup } from "@/lib/exercises";
import { haptics } from "@/lib/haptics";

const searchSchema = z.object({
  routineId: z.coerce.number().optional(),
});

/**
 * Which muscles a routine trains, and how prominently — for the small
 * MuscleMap thumbnail on each routine card. Routine exercises don't have
 * "completed" sets like a finished workout does, so this can't reuse
 * computeIntensity (which is typed against Workout["exercises"]) — uses
 * the shared equal-weight helper instead, fed by routineExerciseIds so
 * the muscle-name list just below stays in sync with it.
 */
function routineExerciseIds(r: Routine): string[] {
  // Circuit routines keep their exercises in `circuit.stations` instead of
  // `exercises` (which is always empty for them — see Routine in db.ts).
  return r.type === "circuit"
    ? (r.circuit?.stations.map((s) => s.exerciseId) ?? [])
    : r.exercises.map((e) => e.exerciseId);
}

function routineIntensity(r: Routine): Partial<Record<MuscleGroup, number>> {
  return intensityFromExerciseIds(routineExerciseIds(r));
}

export const Route = createFileRoute("/_app/workout")({
  validateSearch: searchSchema,
  component: WorkoutPage,
});

function WorkoutPage() {
  const { routineId } = Route.useSearch();
  const navigate = useNavigate();

  const routines = useLiveQuery(
    () =>
      typeof window === "undefined"
        ? Promise.resolve<Routine[]>([])
        : getDb().routines.orderBy("sortOrder").toArray(),
    [],
  );

  const allWorkouts = useLiveQuery(
    () =>
      typeof window === "undefined"
        ? Promise.resolve<Workout[]>([])
        : getDb().workouts.orderBy("startedAt").reverse().toArray(),
    [],
  );

  const lastUsedByRoutine = useMemo(() => {
    const map = new Map<number, number>();
    if (!allWorkouts) return map;
    for (const w of allWorkouts) {
      if (w.routineId != null && !map.has(w.routineId)) {
        map.set(w.routineId, w.startedAt);
      }
    }
    return map;
  }, [allWorkouts]);

  const [active, setActive] = useActiveWorkoutDraft();
  const [picking, setPicking] = useState(false);
  const [summary, setSummary] = useState<Workout | null>(null);
  // The routine snapshot the finishing workout was started from, captured
  // just before `active` is cleared — used only to offer the post-workout
  // "Update Routine?" prompt below, never to alter the routine itself.
  const [startRoutineSnapshot, setStartRoutineSnapshot] = useState<Routine | null>(null);
  const [pendingRoutineUpdate, setPendingRoutineUpdate] = useState<{
    routine: Routine;
    finishedExercises: WorkoutExerciseLog[];
  } | null>(null);
  // Only ever raised when the routine's exercise list DIDN'T change (see
  // leaveSummary below) — kept mutually exclusive with the prompt above
  // so a workout never surfaces two completion dialogs at once.
  const [pendingProgressionSuggestion, setPendingProgressionSuggestion] = useState<{
    routine: Routine;
    suggestion: ProgressionSuggestion;
  } | null>(null);
  const [completionMessage, setCompletionMessage] = useState<CompletionMessage | null>(null);
  // "new-standard"/"new-circuit" distinguish which editor a brand-new
  // routine should open in (chosen via routineTypePickerOpen below) from
  // editing an existing Routine, which already carries its own `type`.
  const [editingRoutine, setEditingRoutine] = useState<
    Routine | "new-standard" | "new-circuit" | null
  >(null);
  const [routineTypePickerOpen, setRoutineTypePickerOpen] = useState(false);
  // Same "how do I start" choice as routineTypePickerOpen, but for the
  // Quick Workout button — a standard quick workout starts immediately
  // (as it always has), while circuit needs its stations/timing decided
  // first, since there's no routine to supply them. See
  // QuickCircuitSetup for why that's a separate ephemeral flow rather
  // than reusing CircuitRoutineEditor.
  const [quickWorkoutTypePickerOpen, setQuickWorkoutTypePickerOpen] = useState(false);
  const [quickCircuitSetupOpen, setQuickCircuitSetupOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Routine | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  useDismissOnBack(menuOpenId !== null, () => setMenuOpenId(null));

  // Runs once, however the completion screen is left — Done, the Android
  // back button, or tapping a bottom-tab link — so the "Update Routine?"
  // prompt below can never be bypassed by the exit path. Closes the
  // summary screen; returns true when a prompt is now pending, so the
  // caller (see the two hooks below) knows whether to hold off on
  // whatever navigation triggered this.
  function leaveSummary(): boolean {
    if (!summary) return false;
    const routine = startRoutineSnapshot;
    const changed =
      routine && getRoutineUpdatePromptEnabled()
        ? detectRoutineChange(routine, summary.exercises)
        : false;

    // Only worth checking when the exercise list itself didn't change —
    // see findProgressionSuggestion's doc comment for why these two stay
    // mutually exclusive.
    const suggestion =
      routine && !changed && getProgressionSuggestionsEnabled()
        ? findProgressionSuggestion(routine, summary, allWorkouts ?? [])
        : null;

    setSummary(null);
    if (routine && changed) {
      setPendingRoutineUpdate({ routine, finishedExercises: summary.exercises });
      return true;
    }
    if (routine && suggestion) {
      setPendingProgressionSuggestion({ routine, suggestion });
      return true;
    }
    return false;
  }

  // Hardware back button: Capacitor's listener calls router.history.back()
  // directly, which bypasses useBlocker entirely (it only guards PUSH/
  // REPLACE navigations, not history POP) — so back needs its own hook
  // into the same app-wide "topmost overlay consumes back" stack every
  // other overlay in this app already uses. Consuming the press here
  // just closes the completion screen; it deliberately doesn't also
  // trigger a route change, matching how other overlays dismiss on back.
  useDismissOnBack(!!summary, () => {
    leaveSummary();
  });

  // Any other way of leaving — Done's navigate() below, or tapping a
  // bottom-tab link — goes through the router, so a blocker can hold it
  // until leaveSummary() has had a chance to raise the prompt.
  useBlocker({
    shouldBlockFn: () => leaveSummary(),
    disabled: !summary,
  });

  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const [saveErrorDialogOpen, setSaveErrorDialogOpen] = useState(false);
  const [cancelPending, setCancelPending] = useState(false);

  useEffect(() => {
    // active === undefined means the draft is still loading — wait for it
    // to resolve to null (confirmed no draft) before starting a new one,
    // so a resumed draft can never be raced by a routineId deep link.
    if (active !== null || !routineId || !routines) return;
    const r = routines.find((x) => x.id === routineId);
    if (r) startWorkout(r);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, routineId, routines]);

  function startWorkout(r: Routine | null) {
    if (r?.type === "circuit" && r.circuit) {
      setActive({
        routine: r,
        name: r.name,
        startedAt: Date.now(),
        exercises: [],
        circuit: { config: r.circuit, state: undefined },
      });
      return;
    }
    setActive({
      routine: r,
      name: r?.name ?? "Quick Workout",
      startedAt: Date.now(),
      exercises:
        r?.exercises.map((e) => {
          const def = getExercise(e.exerciseId);
          return {
            exerciseId: e.exerciseId,
            sets: (e.sets.length > 0 ? e.sets : [{}]).map((s) =>
              seedUnilateralSide(def, {
                ...makeSet(),
                weight: s.targetWeight ?? 0,
                reps: s.targetReps ?? 0,
                duration: s.targetDuration ?? 0,
              }),
            ),
          };
        }) ?? [],
    });
  }

  // The ad-hoc counterpart to startWorkout's circuit branch — no Routine
  // exists yet (and, per "fire and forget," never will), so this builds
  // the same ActiveWorkoutDraft shape directly from a QuickCircuitSetup
  // config instead of reading one off r.circuit.
  function startCircuitWorkout(config: CircuitConfig) {
    setActive({
      routine: null,
      name: "Quick Circuit",
      startedAt: Date.now(),
      exercises: [],
      circuit: { config, state: undefined },
    });
  }

  async function handleFinish(save: boolean) {
    if (!active) return;

    if (save) {
      const exercises: WorkoutExerciseLog[] = active.exercises.map((e) => ({
        exerciseId: e.exerciseId,
        sets: e.sets.map(({ timerStart: _t, ...s }) => ({
          ...s,
          weight: Number(s.weight) || 0,
          reps: Number(s.reps) || 0,
          duration: Number(s.duration) || 0,
          completed:
            s.completed ||
            (Number(s.weight) || 0) > 0 ||
            (Number(s.reps) || 0) > 0 ||
            (Number(s.duration) || 0) > 0,
          // A unilateral timed exercise's secondary side carries the same
          // ephemeral timerStart the primary side does (see LiveWorkoutSet)
          // — strip it here too so a completed workout only ever contains
          // plain SetSide entries, matching the primary side's strip above.
          additionalPerformances: s.additionalPerformances?.map(
            ({ timerStart: _st, ...side }) => side,
          ),
        })),
      }));
      if (!sessionHasData(active)) {
        setDiscardDialogOpen(true);
        return;
      }
      setStartRoutineSnapshot(active.routine);
      await doSaveWorkout(
        exercises,
        active,
        setActive,
        setSummary,
        setSaveErrorDialogOpen,
        setCompletionMessage,
      );
      return;
    }

    if (sessionHasData(active)) {
      setCancelPending(true);
      setDiscardDialogOpen(true);
      return;
    }
    setActive(null);
    navigate({ to: "/workout" });
  }

  async function deleteRoutine(r: Routine) {
    if (!r.id) return;
    await getDb().routines.delete(r.id);
    setDeleteTarget(null);
  }

  // Resolves the post-workout "Update Routine?" prompt. Follows the
  // workout's final exercise order; an exercise already in the routine
  // keeps its existing target sets and config untouched, an exercise
  // added mid-workout gets a fresh RoutineExercise seeded from the sets
  // actually performed today (completed ones preferred), and anything
  // removed mid-workout is simply left out. Keeping the current routine
  // just dismisses the prompt; nothing is written.
  async function resolvePendingRoutineUpdate(shouldUpdate: boolean) {
    const pending = pendingRoutineUpdate;
    setPendingRoutineUpdate(null);
    if (shouldUpdate && pending && pending.routine.id != null) {
      const byId = new Map(pending.routine.exercises.map((e) => [e.exerciseId, e]));
      const updated: RoutineExercise[] = pending.finishedExercises.map((fe) => {
        const existing = byId.get(fe.exerciseId);
        if (existing) return existing;
        const completed = fe.sets.filter((s) => s.completed);
        const source = completed.length > 0 ? completed : fe.sets;
        const sets: RoutineSet[] =
          source.length > 0
            ? source.map((s) => ({
                targetWeight: s.weight,
                targetReps: s.reps,
                targetDuration: s.duration,
              }))
            : [{}];
        return { exerciseId: fe.exerciseId, sets };
      });
      await getDb().routines.update(pending.routine.id, { exercises: updated });
    }
    navigate({ to: "/history" });
  }

  // Resolves the progression-suggestion prompt. progressionState always
  // gets written either way — accepting or declining both count as
  // "this level has been discussed" for evaluateExerciseProgression's
  // anti-repeat check next time — but targetWeight/targetReps only
  // change on accept.
  async function resolvePendingProgressionSuggestion(accepted: boolean) {
    const pending = pendingProgressionSuggestion;
    setPendingProgressionSuggestion(null);
    if (pending && pending.routine.id != null) {
      const { suggestion } = pending;
      const updated: RoutineExercise[] = pending.routine.exercises.map((e) => {
        if (e.exerciseId !== suggestion.exerciseId) return e;
        return {
          ...e,
          sets: accepted
            ? e.sets.map((s) => ({
                ...s,
                targetWeight: suggestion.proposedWeight,
                targetReps: suggestion.proposedReps,
              }))
            : e.sets,
          progressionState: suggestion.nextState,
        };
      });
      await getDb().routines.update(pending.routine.id, { exercises: updated });
    }
    navigate({ to: "/history" });
  }

  function describeProgressionSuggestion(suggestion: ProgressionSuggestion) {
    const name = getExercise(suggestion.exerciseId)?.name ?? suggestion.exerciseId;
    if (suggestion.kind === "add-weight") {
      return {
        title: "Ready to add weight?",
        description: `You've cleared the top of the range for ${name} at ${suggestion.currentWeight}kg for 2 sessions running.`,
        keepLabel: `Keep at ${suggestion.currentWeight}kg`,
        changeLabel: `Try ${suggestion.proposedWeight}kg next time`,
      };
    }
    if (suggestion.kind === "ease-off") {
      return {
        title: `Still working at ${suggestion.currentWeight}kg?`,
        description: `${name} has fallen short of ${suggestion.currentReps} reps for 2 sessions running.`,
        keepLabel: `Keep at ${suggestion.currentWeight}kg`,
        changeLabel: `Try ${suggestion.proposedWeight}kg next time`,
      };
    }
    return {
      title: "Ready for another rep?",
      description: `You've cleared ${suggestion.currentReps}+ reps at ${suggestion.currentWeight}kg on ${name} for 2 sessions running.`,
      keepLabel: `Keep at ${suggestion.currentReps} reps`,
      changeLabel: `Try ${suggestion.proposedReps} reps next time`,
    };
  }

  // Swaps sortOrder with the adjacent routine in the given direction — only
  // the two affected rows are ever written, never the whole table.
  async function moveRoutine(index: number, direction: -1 | 1) {
    const list = routines ?? [];
    const otherIndex = index + direction;
    if (otherIndex < 0 || otherIndex >= list.length) return;
    const current = list[index];
    const other = list[otherIndex];
    if (current.id == null || other.id == null) return;

    const db = getDb();
    await db.transaction("rw", db.routines, async () => {
      await db.routines.update(current.id!, { sortOrder: other.sortOrder ?? otherIndex });
      await db.routines.update(other.id!, { sortOrder: current.sortOrder ?? index });
    });
    setMenuOpenId(null);
  }

  // The draft is still being read from IndexedDB — render nothing rather
  // than flash the routine launcher before a resumed workout has loaded.
  if (active === undefined) return null;

  // ── Workout complete summary ───────────────────────────────────────────────
  if (summary) {
    return (
      <WorkoutCompleteScreen
        summary={summary}
        completionMessage={completionMessage}
        onDone={() => navigate({ to: "/history" })}
      />
    );
  }

  // ── Active session ─────────────────────────────────────────────────────────
  if (active) {
    return (
      <>
        {active.circuit ? (
          <CircuitLiveSession session={active} setSession={setActive} onFinish={handleFinish} />
        ) : (
          <LiveSession
            session={active}
            setSession={setActive}
            onAddExercise={() => setPicking(true)}
            onFinish={handleFinish}
          />
        )}

        {picking && !active.circuit && (
          <ExercisePicker
            onClose={() => setPicking(false)}
            onPick={(id) => {
              setActive((s) =>
                s
                  ? {
                      ...s,
                      exercises: [
                        ...s.exercises,
                        { exerciseId: id, sets: [seedUnilateralSide(getExercise(id), makeSet())] },
                      ],
                    }
                  : s,
              );
              setPicking(false);
            }}
            addedIds={new Set(active.exercises.map((e) => e.exerciseId))}
          />
        )}

        <AlertDialog
          open={discardDialogOpen}
          onOpenChange={(open) => {
            if (!open) {
              setCancelPending(false);
              setDiscardDialogOpen(false);
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {cancelPending ? "Discard workout?" : "Discard empty workout?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {cancelPending
                  ? "You have unsaved progress. Discard this session without saving?"
                  : "No sets were completed. Discard this session without saving?"}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                onClick={() => {
                  setCancelPending(false);
                  setDiscardDialogOpen(false);
                }}
              >
                Keep going
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  haptics.delete();
                  setDiscardDialogOpen(false);
                  setCancelPending(false);
                  setActive(null);
                  navigate({ to: "/workout" });
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Discard
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={saveErrorDialogOpen} onOpenChange={setSaveErrorDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Failed to save workout</AlertDialogTitle>
              <AlertDialogDescription>
                Something went wrong saving your session. Your data is still in memory — try
                finishing again, or check the browser console for details.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction onClick={() => setSaveErrorDialogOpen(false)}>
                OK
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  // ── Launcher ───────────────────────────────────────────────────────────────
  const sortedRoutines = routines ?? [];

  return (
    <div className="flex flex-col gap-5 px-4 pt-6 pb-8">
      <PageHeader eyebrow="Workout">
        <p className="text-lg font-semibold leading-snug">How do you want to train today?</p>
      </PageHeader>

      <button
        onClick={() => setQuickWorkoutTypePickerOpen(true)}
        className="flex items-center gap-3 rounded-2xl bg-primary px-5 py-4 text-primary-foreground active:opacity-90"
      >
        <Dumbbell className="h-5 w-5 shrink-0" />
        <div className="text-left">
          <p className="font-semibold">Quick Workout</p>
          <p className="text-xs text-primary-foreground/70">Start an empty session</p>
        </div>
      </button>

      <Dialog open={quickWorkoutTypePickerOpen} onOpenChange={setQuickWorkoutTypePickerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>What kind of workout?</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <button
              onClick={() => {
                setQuickWorkoutTypePickerOpen(false);
                haptics.workoutStart();
                startWorkout(null);
              }}
              className="rounded-xl bg-card px-4 py-3 text-left active:bg-secondary/70"
            >
              <p className="font-semibold">Standard</p>
              <p className="text-xs text-muted-foreground">Start an empty session</p>
            </button>
            <button
              onClick={() => {
                setQuickWorkoutTypePickerOpen(false);
                setQuickCircuitSetupOpen(true);
              }}
              className="rounded-xl bg-card px-4 py-3 text-left active:bg-secondary/70"
            >
              <p className="font-semibold">Circuit / HIIT</p>
              <p className="text-xs text-muted-foreground">Pick stations and timing, then go</p>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {quickCircuitSetupOpen && (
        <QuickCircuitSetup
          onClose={() => setQuickCircuitSetupOpen(false)}
          onStart={(config) => {
            setQuickCircuitSetupOpen(false);
            haptics.workoutStart();
            startCircuitWorkout(config);
          }}
        />
      )}

      <div>
        <p className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Your Routines
        </p>

        {routines && sortedRoutines.length === 0 ? (
          <EmptyState
            message="No routines yet"
            action={{
              label: "Create your first routine",
              onClick: () => setRoutineTypePickerOpen(true),
            }}
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {sortedRoutines.map((r, index) => {
              const muscles = Array.from(
                new Set(
                  routineExerciseIds(r)
                    .map((id) => getExercise(id)?.muscle)
                    .filter((m): m is MuscleGroup => !!m),
                ),
              ).slice(0, 4);

              const lastTs = r.id != null ? lastUsedByRoutine.get(r.id) : undefined;
              const lastUsedLabel = lastTs
                ? (() => {
                    const days = Math.floor((Date.now() - lastTs) / 86400000);
                    if (days === 0) return "Last used today";
                    if (days === 1) return "Last used yesterday";
                    return `Last used ${days} days ago`;
                  })()
                : "Never used";

              const menuOpen = menuOpenId === r.id;
              const isCircuit = r.type === "circuit";
              const stationCount = r.circuit?.stations.length ?? 0;

              return (
                <li key={r.id} className="relative">
                  <div className="flex items-stretch rounded-2xl bg-card overflow-hidden">
                    <button
                      onClick={() => {
                        haptics.workoutStart();
                        startWorkout(r);
                      }}
                      className="flex-1 px-4 py-4 text-left transition-colors active:bg-secondary/70"
                    >
                      <div className="flex items-center gap-2">
                        <p className="font-semibold truncate">{r.name}</p>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {isCircuit
                          ? `${stationCount} station${stationCount === 1 ? "" : "s"}`
                          : `${r.exercises.length} exercise${r.exercises.length === 1 ? "" : "s"}`}
                      </p>
                      {muscles.length > 0 && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {muscles.join(" • ")}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-muted-foreground/60">{lastUsedLabel}</p>
                    </button>

                    {/* Muscle map thumbnail */}
                    <div className="w-16 shrink-0 flex items-center justify-center border-l border-border/30 px-1">
                      {muscles.length > 0 && (
                        <ExpandableMuscleMap
                          intensity={routineIntensity(r)}
                          compact
                          className="max-h-16"
                        />
                      )}
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpenId(menuOpen ? null : (r.id ?? null));
                      }}
                      className="absolute top-2 right-2 rounded p-1 text-muted-foreground"
                      aria-label="Routine options"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </div>

                  {menuOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setMenuOpenId(null)} />
                      <div className="absolute right-2 top-8 z-50 min-w-[160px] rounded-xl border border-border bg-card shadow-xl py-1">
                        <button
                          onClick={() => {
                            setMenuOpenId(null);
                            setEditingRoutine(r);
                          }}
                          className="flex w-full items-center gap-2 px-4 py-2.5 text-sm hover:bg-secondary"
                        >
                          <Pencil className="h-4 w-4" /> Edit
                        </button>
                        <button
                          onClick={() => moveRoutine(index, -1)}
                          disabled={index === 0}
                          className="flex w-full items-center gap-2 px-4 py-2.5 text-sm hover:bg-secondary disabled:opacity-30"
                        >
                          <ArrowUp className="h-4 w-4" /> Move Up
                        </button>
                        <button
                          onClick={() => moveRoutine(index, 1)}
                          disabled={index === sortedRoutines.length - 1}
                          className="flex w-full items-center gap-2 px-4 py-2.5 text-sm hover:bg-secondary disabled:opacity-30"
                        >
                          <ArrowDown className="h-4 w-4" /> Move Down
                        </button>
                        <button
                          onClick={() => {
                            setMenuOpenId(null);
                            setDeleteTarget(r);
                          }}
                          className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-destructive hover:bg-secondary"
                        >
                          <Trash2 className="h-4 w-4" /> Delete
                        </button>
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <button
        onClick={() => setRoutineTypePickerOpen(true)}
        className="flex items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-medium text-primary-foreground active:opacity-90"
      >
        <Plus className="h-4 w-4" /> Create New Routine
      </button>

      <Dialog open={routineTypePickerOpen} onOpenChange={setRoutineTypePickerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>What kind of routine?</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <button
              onClick={() => {
                setRoutineTypePickerOpen(false);
                setEditingRoutine("new-standard");
              }}
              className="rounded-xl bg-card px-4 py-3 text-left active:bg-secondary/70"
            >
              <p className="font-semibold">Standard</p>
              <p className="text-xs text-muted-foreground">Sets, reps, and weight</p>
            </button>
            <button
              onClick={() => {
                setRoutineTypePickerOpen(false);
                setEditingRoutine("new-circuit");
              }}
              className="rounded-xl bg-card px-4 py-3 text-left active:bg-secondary/70"
            >
              <p className="font-semibold">Circuit / HIIT</p>
              <p className="text-xs text-muted-foreground">
                Stations on a work/rest timer, for rounds
              </p>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {editingRoutine !== null &&
        (editingRoutine === "new-circuit" ||
        (typeof editingRoutine === "object" && editingRoutine.type === "circuit") ? (
          <CircuitRoutineEditor
            initial={editingRoutine === "new-circuit" ? null : editingRoutine}
            onClose={() => setEditingRoutine(null)}
          />
        ) : (
          <RoutineEditor
            initial={editingRoutine === "new-standard" ? null : editingRoutine}
            onClose={() => setEditingRoutine(null)}
          />
        ))}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete routine?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.name}" will be permanently deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                haptics.delete();
                if (deleteTarget) deleteRoutine(deleteTarget);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!pendingRoutineUpdate}
        onOpenChange={(open) => !open && resolvePendingRoutineUpdate(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Update Routine?</AlertDialogTitle>
            <AlertDialogDescription>
              You changed the exercises during this workout. Would you like to update "
              {pendingRoutineUpdate?.routine.name}" so future workouts use this instead?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => resolvePendingRoutineUpdate(false)}>
              Keep Current Routine
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => resolvePendingRoutineUpdate(true)}>
              Update Routine
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!pendingProgressionSuggestion}
        onOpenChange={(open) => !open && resolvePendingProgressionSuggestion(false)}
      >
        <AlertDialogContent>
          {pendingProgressionSuggestion &&
            (() => {
              const copy = describeProgressionSuggestion(pendingProgressionSuggestion.suggestion);
              return (
                <>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{copy.title}</AlertDialogTitle>
                    <AlertDialogDescription>{copy.description}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => resolvePendingProgressionSuggestion(false)}>
                      {copy.keepLabel}
                    </AlertDialogCancel>
                    <AlertDialogAction onClick={() => resolvePendingProgressionSuggestion(true)}>
                      {copy.changeLabel}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </>
              );
            })()}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
