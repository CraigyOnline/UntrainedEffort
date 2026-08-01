import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { BOTTOM_NAV_HEIGHT } from "@/components/BottomTabs";
import { formatTime } from "@/lib/format";
import { haptics } from "@/lib/haptics";
import type { RestTimerState } from "@/lib/db";

export interface RestTimerProps {
  restTimer: RestTimerState;
  onSkip: () => void;
  onExtend: () => void;
}

/**
 * A slim bar docked just above the bottom tab bar for as long as a rest is
 * running. Deliberately not part of the scrolling workout content, and not
 * part of WorkoutHUD's header either (both were tried and moved on from —
 * see git history on this file and WorkoutHUD's WORKOUT_HUD_HEIGHT comment)
 * — a fixed spot outside the scroll area means it stays visible and in the
 * same physical place regardless of which exercise card happens to be
 * scrolled into view, the same reasoning ActiveWorkoutCard already uses for
 * its own bottom-docked placement.
 *
 * Fixed rather than sticky, and BOTTOM_NAV_HEIGHT as the offset — the same
 * established pattern BottomTabs/ActiveWorkoutCard/ExercisePicker/
 * RoutineEditor all use (see WorkoutHUD's fixed-vs-sticky doc comment for
 * why fixed is required in this app's layout). Edge-to-edge and blurred
 * like BottomTabs itself, not a rounded floating card, so it reads as a
 * continuation of that chrome directly above it rather than a separate
 * notification competing for attention.
 *
 * Visual hierarchy follows the feature's philosophy: while resting, the
 * label stays small and muted throughout — "Recovering" is a reassurance,
 * not a demand — with only the remaining time picked out in the ordinary
 * foreground color, and a thin progress bar underneath doing most of the
 * "how much longer" communication so nobody has to read digits to get a
 * sense of it. Once the countdown reaches zero, "✓ Ready" takes over that
 * same slot as the sole focus, bar and controls gone. Never counts into
 * negative time.
 *
 * +30s and Skip Rest are real 44px touch targets (h-11, matching every
 * other icon-sized control in this feature — see WorkoutHUD's options
 * button and LiveSession's drag handle/delete button), not bare underlined
 * text — this gets tapped mid-set, one-handed, without looking closely.
 *
 * The resting/ready swap is a short fade (reusing the existing
 * fade-in-soft keyframe already used elsewhere on this screen, not a new
 * animation) via remounting just the inner content on transition — the
 * component itself, and the interval/haptic-tracking hooks below, stay
 * mounted throughout.
 */
export function RestTimer({ restTimer, onSkip, onExtend }: RestTimerProps) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 250);
    return () => clearInterval(t);
  }, [restTimer.endsAt]);

  const remaining = Math.max(0, Math.round((restTimer.endsAt - Date.now()) / 1000));
  const resting = remaining > 0;
  const progress = restTimer.durationSec > 0 ? Math.min(1, remaining / restTimer.durationSec) : 0;

  // Fires exactly once, right at the resting -> ready transition — not on
  // every tick while already at zero, and not on mount (prevRestingRef
  // starts at whatever `resting` already is when this first renders, so
  // reopening a workout that's already past endsAt has nothing to
  // "transition" from).
  const prevRestingRef = useRef(resting);
  useEffect(() => {
    if (prevRestingRef.current && !resting) {
      haptics.restReady();
    }
    prevRestingRef.current = resting;
  }, [resting]);

  return (
    <div
      className="fixed inset-x-0 z-40 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80"
      style={{ bottom: BOTTOM_NAV_HEIGHT }}
    >
      <div
        key={resting ? "resting" : "ready"}
        className="mx-auto flex max-w-md animate-[fade-in-soft_260ms_ease-out] items-center gap-3 px-4 py-3"
      >
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 text-xs leading-none text-muted-foreground">
            {resting ? (
              <>
                Recovering &middot;{" "}
                <span className="font-medium tabular-nums text-foreground">
                  {formatTime(remaining)}
                </span>
              </>
            ) : (
              <span className="font-medium text-primary">✓ Ready</span>
            )}
          </div>
          {resting && (
            <div className="h-1 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-300 ease-linear"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          )}
        </div>
        {resting && (
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              onClick={onExtend}
              className="flex h-11 items-center justify-center rounded-lg bg-secondary/60 px-3 text-xs text-muted-foreground transition-colors active:text-foreground"
            >
              +30s
            </button>
            <button
              onClick={onSkip}
              aria-label="Skip rest"
              className="flex h-11 w-11 items-center justify-center rounded-lg bg-secondary/60 text-muted-foreground transition-colors active:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
