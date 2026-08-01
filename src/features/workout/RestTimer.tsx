import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { formatTime } from "@/lib/format";
import { haptics } from "@/lib/haptics";
import type { RestTimerState } from "@/lib/db";

export interface RestTimerProps {
  restTimer: RestTimerState;
  onSkip: () => void;
  onExtend: () => void;
}

/**
 * The rest-timer row in the live workout header. Reads as part of the HUD
 * rather than a banner — no card/pill wrapper, just another row in the
 * same flex column as the stats row around it.
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
 * button and LiveSession's drag handle/delete button), not bare
 * underlined text — a rest timer gets tapped mid-set, one-handed, without
 * looking closely.
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
      key={resting ? "resting" : "ready"}
      className="flex animate-[fade-in-soft_260ms_ease-out] items-center gap-2"
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
  );
}
