import { useEffect, useState } from "react";
import { MoreVertical } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { ExpandableMuscleMap } from "@/components/ExpandableMuscleMap";
import { computeWorkoutStats } from "@/lib/workoutStats";
import { computeIntensity } from "@/lib/muscles";
import { getKeepAwakeDefault, enableKeepAwake, disableKeepAwake } from "@/lib/keepAwake";
import { useDismissOnBack } from "@/lib/backHandler";
import { WorkoutTimer } from "./WorkoutTimer";
import { PR_CELEBRATION_VISIBLE_MS, type ActiveSession } from "./workoutHelpers";

/**
 * Content height of the HUD below the safe-area inset — i.e. the number
 * LiveSession needs to add as extra top padding so its scrolling content
 * starts below this fixed bar. Same role as BottomTabs' BOTTOM_NAV_HEIGHT,
 * kept as a plain constant for the same reason: everything rendered here
 * today has a fixed height (name/timer/options row + stats/map/finish
 * row). Breakdown, top to bottom: 44 (options button, h-11) + 8 (row gap)
 * + 64 (muscle-map thumbnail, the tallest element in the second row) + 12
 * (pt-3) + 8 (pb-2) + 1 (border) = 137.
 *
 * If a future addition (rest-timer row, PR-celebration banner) makes this
 * bar grow or shrink dynamically, this static-constant approach stops
 * being correct — that's the point to switch to a measured height
 * (e.g. a ResizeObserver on the HUD, feeding LiveSession's padding),
 * not before. No such thing exists yet, so that machinery isn't here.
 */
export const WORKOUT_HUD_HEIGHT = 137;

export interface WorkoutHUDCelebration {
  /** Changes on every new live PR, even back-to-back ones with identical
   *  text — the effects below key off this changing to (re)start the
   *  pulse/glow/badge, so a plain counter or Date.now() both work. */
  key: number;
  /** Pre-built display text, e.g. "New Weight PR" or "Weight PR • Rep PR"
   *  — LiveSession owns combining multiple simultaneous PR types into one
   *  label, since that's presentation logic specific to this badge. */
  label: string;
}

export interface WorkoutHUDProps {
  session: ActiveSession;
  setSession: React.Dispatch<React.SetStateAction<ActiveSession | null>>;
  onFinish: (save: boolean) => void;
  /** Set by LiveSession when the just-completed set clears a live PR
   *  check. Absent/null the vast majority of the time — this HUD has no
   *  opinion on what counts as a PR, it only animates when told one just
   *  happened. */
  celebration?: WorkoutHUDCelebration | null;
}

/**
 * Pinned to the top of the workout screen for the whole session.
 *
 * Fixed rather than sticky: the shared _app.tsx route shell sets
 * `overflow-x-hidden` on its root wrapper. Per the CSS spec, an element
 * with overflow set on one axis computes the other axis to `auto` if it
 * was `visible` — so that wrapper is (invisibly, since it never actually
 * grows a scrollbar) a scroll container, which makes IT the sticky
 * positioning containing block instead of the real viewport. That silently
 * breaks `position: sticky` — it renders in place but never actually
 * sticks. `position: fixed` doesn't have this problem (no ancestor here
 * has a `transform`/`filter`/`will-change` that would give it a new
 * containing block), and it's also exactly what BottomTabs, ExercisePicker,
 * and RoutineEditor's fixed overlays already do — this follows the same
 * established pattern, not a new one.
 *
 * Reads directly from the same `session` prop LiveSession already owns —
 * no separate query, no new state, nothing that could drift out of sync
 * with what's actually on screen. computeWorkoutStats/computeIntensity
 * both already operate on Workout["exercises"], and ActiveSession's
 * exercises are structurally compatible with that (a superset of fields),
 * so both are reused here completely unmodified.
 */
export function WorkoutHUD({ session, setSession, onFinish, celebration }: WorkoutHUDProps) {
  // ── Keep screen awake (temporary, per-workout override) ────────────────
  // Moved here from LiveSession along with the options menu that controls
  // it — nothing else in LiveSession reads this state.
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
    // unmount this component, and React guarantees this cleanup fires
    // regardless of which of those caused it.
    return () => {
      disableKeepAwake();
    };
  }, [keepAwake]);

  // ── Live PR celebration ──────────────────────────────────────────────
  // Everything below is driven by real state transitions with CSS
  // *transitions* (not @keyframes animations) on purpose: a transition
  // triggered by an actual prop/state change always plays correctly, even
  // when a new celebration arrives mid-animation, unlike a CSS keyframe
  // animation replayed via toggling the same class (which silently no-ops
  // unless the element is remounted). Remounting was avoided here since
  // that would also reset keepAwake/optionsOpen above for no reason.

  // Pulse: quick scale up and back — the "HUD briefly pulses" part.
  const [pulsing, setPulsing] = useState(false);
  useEffect(() => {
    if (!celebration) return;
    setPulsing(true);
    const t = setTimeout(() => setPulsing(false), 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed off celebration?.key only, not the whole object, so this doesn't re-fire on unrelated re-renders
  }, [celebration?.key]);

  // Glow: appears quickly, holds briefly, then fades slowly — achieved by
  // swapping both the shadow value AND the transition-duration class at
  // the same time for the "in → out" step, so the browser uses the fast
  // duration going in and the slow one coming back out.
  const [glowPhase, setGlowPhase] = useState<"idle" | "in" | "out">("idle");
  useEffect(() => {
    if (!celebration) return;
    setGlowPhase("in");
    const toOut = setTimeout(() => setGlowPhase("out"), 150);
    const toIdle = setTimeout(() => setGlowPhase("idle"), 150 + 650);
    return () => {
      clearTimeout(toOut);
      clearTimeout(toIdle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed off celebration?.key only, not the whole object, so this doesn't re-fire on unrelated re-renders
  }, [celebration?.key]);

  // Badge: animates in, holds for PR_CELEBRATION_VISIBLE_MS (shared with
  // LiveSession's exercise-card highlight so both fade around the same
  // moment), then fades out over 350ms.
  const [badgeState, setBadgeState] = useState<"hidden" | "visible" | "leaving">("hidden");
  const [badgeLabel, setBadgeLabel] = useState("");
  useEffect(() => {
    if (!celebration) return;
    setBadgeLabel(celebration.label);
    setBadgeState("visible");
    const toLeaving = setTimeout(() => setBadgeState("leaving"), PR_CELEBRATION_VISIBLE_MS);
    const toHidden = setTimeout(() => setBadgeState("hidden"), PR_CELEBRATION_VISIBLE_MS + 350);
    return () => {
      clearTimeout(toLeaving);
      clearTimeout(toHidden);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed off celebration?.key only, not the whole object, so this doesn't re-fire on unrelated re-renders
  }, [celebration?.key]);

  const { totalSets, totalVolume, loggedSets } = computeWorkoutStats(session.exercises);
  // live: true — a freshly-added exercise with no completed sets yet
  // should read as untrained on this live map, unlike the finished-workout
  // fallback (which counts all its sets) used everywhere else.
  const intensity = computeIntensity(session.exercises, { live: true });
  const progress = loggedSets > 0 ? Math.min(1, totalSets / loggedSets) : 0;

  return (
    <div className="fixed inset-x-0 top-0 z-30 flex justify-center bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div
        className={`relative flex w-full max-w-md min-w-0 flex-col gap-2 border-b border-border px-4 pt-3 pb-2 transition-transform ease-out ${
          pulsing ? "scale-[1.02] duration-200" : "scale-100 duration-200"
        } ${
          glowPhase === "in"
            ? "shadow-[0_0_28px_6px_var(--color-pr-gold)] transition-shadow duration-150 ease-out"
            : glowPhase === "out"
              ? "shadow-none transition-shadow duration-700 ease-out"
              : ""
        }`}
      >
        <div className="flex items-center gap-2">
          <input
            value={session.name}
            onChange={(e) => setSession((s) => (s ? { ...s, name: e.target.value } : s))}
            className="min-w-0 flex-1 bg-transparent text-lg font-bold outline-none"
          />
          <WorkoutTimer startedAt={session.startedAt} />

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

        <div className="flex items-center gap-3">
          {/* Muscle map thumbnail — same size/styling as the Workout/Routine/History cards */}
          <div className="flex w-16 shrink-0 items-center justify-center">
            <ExpandableMuscleMap intensity={intensity} compact className="max-h-16" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {totalSets} / {loggedSets} sets
              </span>
              <span>{Math.round(totalVolume)} kg</span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          </div>

          <Button size="sm" onClick={() => onFinish(true)}>
            Finish
          </Button>
        </div>

        {badgeState !== "hidden" && (
          <div
            aria-hidden
            className={`pointer-events-none absolute left-1/2 top-full z-40 -translate-x-1/2 whitespace-nowrap rounded-full border border-pr-gold/40 bg-pr-gold/15 px-3 py-1 text-xs font-semibold text-pr-gold shadow-sm transition-all duration-300 ease-out ${
              badgeState === "visible"
                ? "mt-1 translate-y-0 opacity-100"
                : "mt-0 -translate-y-1 opacity-0"
            }`}
          >
            🏆 {badgeLabel}
          </div>
        )}
      </div>
    </div>
  );
}
