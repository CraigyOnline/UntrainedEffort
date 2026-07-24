import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { getDb, type Routine, type Workout, type WorkoutExerciseLog, type PRRecord } from "@/lib/db";
import { getExercise, formatCompletedSet, seedUnilateralSide } from "@/lib/exercises";
import { ExercisePicker } from "@/components/forms/ExercisePicker";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { WorkoutSummary } from "@/components/WorkoutSummary";
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
import { ArrowDown, ArrowUp, Dumbbell, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { useDismissOnBack } from "@/lib/backHandler";
import { doSaveWorkout, makeSet, sessionHasData } from "@/features/workout/workoutHelpers";
import { useActiveWorkoutDraft } from "@/features/workout/useActiveWorkoutDraft";
import { LiveSession } from "@/features/workout/LiveSession";
import { RoutineEditor } from "@/features/workout/RoutineEditor";
import { ExpandableMuscleMap } from "@/components/ExpandableMuscleMap";
import { type MuscleGroup } from "@/lib/exercises";
import { BOTTOM_NAV_HEIGHT } from "@/components/BottomTabs";
import { haptics } from "@/lib/haptics";

const searchSchema = z.object({
  routineId: z.coerce.number().optional(),
});

/**
 * Which muscles a routine trains, and how prominently — for the small
 * MuscleMap thumbnail on each routine card. Routine exercises don't have
 * "completed" sets like a finished workout does, so this can't reuse
 * computeIntensity (which is typed against Workout["exercises"]); it mirrors
 * the same primary=full/secondary=half convention instead.
 */
function routineIntensity(r: Routine): Partial<Record<MuscleGroup, number>> {
  const out: Partial<Record<MuscleGroup, number>> = {};
  for (const ex of r.exercises) {
    const def = getExercise(ex.exerciseId);
    if (!def) continue;
    out[def.muscle] = 1;
    for (const sec of def.secondary ?? []) {
      out[sec] = Math.max(out[sec] ?? 0, 0.5);
    }
  }
  return out;
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
  ) as Routine[] | undefined;

  const allWorkouts = useLiveQuery(
    () =>
      typeof window === "undefined"
        ? Promise.resolve<Workout[]>([])
        : getDb().workouts.orderBy("startedAt").reverse().toArray(),
    [],
  ) as Workout[] | undefined;

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
  // Workout Complete entrance transition — starts hidden and flips to visible
  // one frame after `summary` is set, so the fade+rise below has an actual
  // "from" state to animate from (mounting already-opacity-100 would just be
  // an instant appearance again, the exact "abrupt" problem this exists to
  // fix). Same real-state-plus-CSS-transition technique as WorkoutHUD's PR
  // celebration — no animation library, nothing keyframe-based.
  const [completeVisible, setCompleteVisible] = useState(false);
  useEffect(() => {
    if (!summary) {
      setCompleteVisible(false);
      return;
    }
    const raf = requestAnimationFrame(() => setCompleteVisible(true));
    return () => cancelAnimationFrame(raf);
  }, [summary]);
  const [editingRoutine, setEditingRoutine] = useState<Routine | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Routine | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  useDismissOnBack(menuOpenId !== null, () => setMenuOpenId(null));
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const [saveErrorDialogOpen, setSaveErrorDialogOpen] = useState(false);
  const [cancelPending, setCancelPending] = useState(false);

  const summaryPRs = useLiveQuery(async () => {
    if (typeof window === "undefined" || !summary?.id) return [];
    return getDb().prHistory.where("workoutId").equals(summary.id).toArray();
  }, [summary?.id]) as PRRecord[] | undefined;

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
      await doSaveWorkout(exercises, active, setActive, setSummary, setSaveErrorDialogOpen);
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
    const hasPRs = !!summaryPRs && summaryPRs.length > 0;
    // Everything below stays on the single completeVisible clock from
    // Phase 1 — hero and stats now drive their entrance via the
    // drop-settle-* keyframes (see styles.css), PR/log/Done still use the
    // transition-based reveal from Phase 2 (redesigning the PR moment
    // itself is Phase 2 of this new plan). Delays re-timed so PR/log/Done
    // fire after the new, slower hero+stat sequence actually settles
    // (~840ms) instead of the old ~260-360ms, which would now land while
    // the stats are still dropping in.
    const revealStyle = (delayMs: number) => ({ transitionDelay: `${delayMs}ms` });
    return (
      <div className="flex flex-col gap-4 px-4 pt-6 pb-8">
        <div
          className={
            completeVisible ? "animate-[drop-settle-hero_480ms_linear_forwards]" : "opacity-0"
          }
        >
          <h1 className={`text-2xl font-bold ${hasPRs ? "text-pr-gold" : ""}`}>
            Workout Complete 🎉
          </h1>
        </div>
        <div className={hasPRs ? "rounded-xl ring-2 ring-pr-gold/50" : ""}>
          <WorkoutSummary
            name={summary.name}
            durationSec={summary.durationSec}
            exercises={summary.exercises}
            showName
            revealed={completeVisible}
          />
        </div>

        {summaryPRs && summaryPRs.length > 0 && (
          <div
            className={`flex flex-col gap-2 transition-all duration-300 ease-out ${
              completeVisible
                ? "translate-y-0 scale-100 opacity-100"
                : "translate-y-1 scale-[0.97] opacity-0"
            }`}
            style={revealStyle(900)}
          >
            <h2 className="text-sm font-semibold text-pr-gold uppercase tracking-wide">
              Personal Records 🏆
            </h2>
            <div className="rounded-xl bg-pr-gold/10 ring-1 ring-pr-gold/30 px-4 py-3 flex flex-col gap-2">
              {summaryPRs.map((pr, i) => {
                const def = getExercise(pr.exerciseId);
                const name = def?.name ?? pr.exerciseId;
                const typeLabel =
                  pr.type === "weight" ? "Weight" : pr.type === "reps" ? "Reps" : "Duration";
                const fmt = (v: number) =>
                  pr.type === "time"
                    ? v >= 60
                      ? `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`
                      : `${v}s`
                    : pr.type === "weight"
                      ? `${v}kg`
                      : `${v}`;
                const isFirst = (pr.previousBest ?? 0) === 0;
                return (
                  <div key={i} className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{name}</p>
                      <p className="text-xs text-muted-foreground">
                        {typeLabel} •{" "}
                        {isFirst ? (
                          <span className="text-pr-gold">First PR ({fmt(pr.value)})</span>
                        ) : (
                          <span>
                            {fmt(pr.previousBest ?? 0)} →{" "}
                            <span className="text-pr-gold font-semibold">{fmt(pr.value)}</span>
                          </span>
                        )}
                      </p>
                    </div>
                    {!isFirst && (
                      <span className="shrink-0 text-xs text-pr-gold font-semibold">
                        +{fmt(pr.delta ?? pr.value)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div
          className={`flex flex-col gap-2 transition-opacity duration-300 ease-out ${
            completeVisible ? "opacity-100" : "opacity-0"
          }`}
          style={revealStyle(hasPRs ? 1020 : 900)}
        >
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            What you did
          </h2>
          {summary.exercises.map((ex, ei) => {
            const def = getExercise(ex.exerciseId);
            const completedSets = ex.sets.filter((s) => s.completed);
            if (completedSets.length === 0) return null;
            return (
              <div key={ei} className="rounded-xl bg-muted px-4 py-3">
                <p className="font-semibold text-sm">{def?.name ?? ex.exerciseId}</p>
                <ul className="mt-1 flex flex-col gap-0.5">
                  {completedSets.map((s, si) => (
                    <li key={si} className="text-xs text-muted-foreground tabular-nums">
                      Set {si + 1}: {formatCompletedSet(def, s)}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <Button
          onClick={() => {
            setSummary(null);
            navigate({ to: "/history" });
          }}
          className={`transition-opacity duration-300 ease-out ${
            completeVisible ? "opacity-100" : "opacity-0"
          }`}
          style={revealStyle(hasPRs ? 1080 : 960)}
        >
          Done
        </Button>
      </div>
    );
  }

  // ── Active session ─────────────────────────────────────────────────────────
  if (active) {
    return (
      <>
        <LiveSession
          session={active}
          setSession={setActive}
          onAddExercise={() => setPicking(true)}
          onFinish={handleFinish}
        />

        {picking && (
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
            if (!open) { setCancelPending(false); setDiscardDialogOpen(false); }
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
                onClick={() => { setCancelPending(false); setDiscardDialogOpen(false); }}
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
              <AlertDialogAction onClick={() => setSaveErrorDialogOpen(false)}>OK</AlertDialogAction>
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
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Workout</h1>
        <p className="text-sm text-muted-foreground">How do you want to train today?</p>
      </header>

      <button
        onClick={() => {
          haptics.workoutStart();
          startWorkout(null);
        }}
        className="flex items-center gap-3 rounded-2xl bg-primary px-5 py-4 text-primary-foreground active:opacity-90"
      >
        <Dumbbell className="h-5 w-5 shrink-0" />
        <div className="text-left">
          <p className="font-semibold">Quick Workout</p>
          <p className="text-xs text-primary-foreground/70">Start an empty session</p>
        </div>
      </button>

      <div>
        <p className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Your Routines
        </p>

        {routines && sortedRoutines.length === 0 ? (
          <EmptyState
            message="No routines yet"
            action={{ label: "Create your first routine", onClick: () => setEditingRoutine("new") }}
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {sortedRoutines.map((r, index) => {
              const muscles = Array.from(
                new Set(
                  r.exercises
                    .map((e) => getExercise(e.exerciseId)?.muscle)
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
                        {r.exercises.length} exercise{r.exercises.length === 1 ? "" : "s"}
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
                          onClick={() => { setMenuOpenId(null); setEditingRoutine(r); }}
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
                          onClick={() => { setMenuOpenId(null); setDeleteTarget(r); }}
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
        onClick={() => setEditingRoutine("new")}
        className="flex items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-medium text-primary-foreground active:opacity-90"
      >
        <Plus className="h-4 w-4" /> Create New Routine
      </button>

      {editingRoutine !== null && (
        <RoutineEditor
          initial={editingRoutine === "new" ? null : editingRoutine}
          onClose={() => setEditingRoutine(null)}
        />
      )}

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
    </div>
  );
}
