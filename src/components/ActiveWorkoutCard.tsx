import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Link, useLocation } from "@tanstack/react-router";
import { ArrowRight, Play } from "lucide-react";
import { getDb, type ActiveWorkoutDraft } from "@/lib/db";
import { computeWorkoutStats, getCurrentExerciseName } from "@/lib/workoutStats";
import { WorkoutTimer } from "@/features/workout/WorkoutTimer";
import { SetProgressBar } from "@/components/SetProgressBar";

/** Entrance/exit transition duration. The card stays mounted (rendering
 *  its last known content) for this long after the workout disappears or
 *  the user navigates onto the workout screen, so it can slide/fade away
 *  instead of vanishing instantly — see the mount/entered state machine
 *  below. */
const TRANSITION_MS = 300;

/**
 * Persistent reminder of the in-progress workout, mounted once from the
 * shared `_app` layout so it appears identically above every page's own
 * content — Profile, History, Settings, Exercise Detail, etc. — without
 * each route needing to know it exists. Hidden on the workout screen
 * itself, which already has the floating WorkoutHUD for this.
 *
 * Single source of truth, reused end to end:
 * - Reads the same `activeWorkout` Dexie table LiveSession/
 *   useActiveWorkoutDraft read and write, via useLiveQuery — the exact
 *   pattern useWorkoutNotificationLifecycle already uses for the same
 *   kind of read-only, reactive, elsewhere-in-the-app consumer.
 * - `computeWorkoutStats()` and `getCurrentExerciseName()` are the same
 *   functions (the latter built on getCurrentExerciseId()) the HUD, the
 *   notification content, and the live PR check all call — no second
 *   definition of "completed sets" or "current exercise" exists here.
 * - `<WorkoutTimer>` is the literal component the HUD renders for its own
 *   elapsed-time display, reused as-is rather than re-implementing a
 *   ticking clock a third time.
 */
export function ActiveWorkoutCard() {
  const { pathname } = useLocation();
  const draft = useLiveQuery(() => getDb().activeWorkout.toCollection().first(), []);

  const onWorkoutScreen = pathname.startsWith("/workout");
  const shouldShow = !!draft && !onWorkoutScreen;

  // renderedDraft/mounted/entered together let the card animate away
  // instead of disappearing the instant `shouldShow` flips false — the
  // draft itself may already be gone (workout finished) by the time the
  // exit transition needs to play.
  const [renderedDraft, setRenderedDraft] = useState<ActiveWorkoutDraft | null>(null);
  const [mounted, setMounted] = useState(false);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (shouldShow && draft) {
      setRenderedDraft(draft);
      setMounted(true);
      // One frame with `entered` still false so the "hidden" transform/
      // opacity styles actually apply before flipping to the visible
      // state — flipping both in the same tick would skip the transition
      // entirely.
      const raf = requestAnimationFrame(() => setEntered(true));
      return () => cancelAnimationFrame(raf);
    }
    if (mounted) {
      setEntered(false);
      const t = setTimeout(() => setMounted(false), TRANSITION_MS);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `mounted` is this effect's own output (whether we're already showing something), not an external input; adding it would re-fire the "start leaving" branch on every render while visible instead of only on the shouldShow/draft transition that should trigger it.
  }, [shouldShow, draft]);

  if (!mounted || !renderedDraft) return null;

  const { totalSets, loggedSets } = computeWorkoutStats(renderedDraft.exercises);
  const currentExerciseName = getCurrentExerciseName(renderedDraft.exercises);
  const progress = loggedSets > 0 ? Math.min(1, totalSets / loggedSets) : 0;

  return (
    <Link
      to="/workout"
      className={`mx-4 mb-3 mt-3 block shrink-0 overflow-hidden rounded-2xl border border-border bg-card shadow-md transition-all ease-out ${
        entered ? "translate-y-0 opacity-100 duration-300" : "-translate-y-2 opacity-0 duration-300"
      }`}
    >
      <div className="flex border-l-4 border-primary transition-transform duration-150 active:scale-[0.99]">
        <div className="min-w-0 flex-1 p-4">
          <div className="flex items-center gap-2">
            <Play className="h-4 w-4 shrink-0 text-primary" />
            <span className="min-w-0 flex-1 truncate font-semibold">
              {renderedDraft.name || "Workout in progress"}
            </span>
            <WorkoutTimer startedAt={renderedDraft.startedAt} />
          </div>

          <SetProgressBar value={progress} className="mt-2" />

          <div className="mt-2 flex items-end justify-between gap-2">
            <div className="min-w-0 text-xs text-muted-foreground">
              <p>
                {totalSets} / {loggedSets} sets
              </p>
              {currentExerciseName && (
                <p className="mt-0.5 truncate">
                  <span className="text-muted-foreground/80">Current: </span>
                  <span className="font-medium text-foreground">{currentExerciseName}</span>
                </p>
              )}
            </div>

            <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-primary">
              Resume Workout <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
