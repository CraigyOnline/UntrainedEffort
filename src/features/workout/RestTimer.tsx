import { useEffect, useRef, useState } from "react";
import { formatTime } from "@/lib/format";
import { haptics } from "@/lib/haptics";
import type { RestTimerState } from "@/lib/db";

export interface RestTimerProps {
  restTimer: RestTimerState;
  onSkip: () => void;
  onExtend: () => void;
}

/**
 * The rest-timer row in the live workout header. Intentionally reads as
 * part of the HUD rather than a banner — no chip background, no border,
 * just another line in the same flex column as the stats row around it.
 *
 * Visual hierarchy follows the feature's philosophy directly: while
 * resting, the remaining time is the largest/boldest thing here and
 * "Recovering" is a quiet caption next to it — a reassurance, not a
 * demand. Once the countdown reaches zero, "✓ Ready" takes over that same
 * slot as the sole focus. Never counts into negative time.
 *
 * The swap between those two states is a short fade (reusing the existing
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
      className="flex animate-[fade-in-soft_260ms_ease-out] items-center justify-between gap-2"
    >
      <div className="flex items-baseline gap-1.5">
        {resting ? (
          <>
            <span className="text-base leading-none font-semibold tabular-nums">
              {formatTime(remaining)}
            </span>
            <span className="text-xs leading-none text-muted-foreground">Recovering</span>
          </>
        ) : (
          <span className="text-sm leading-none font-medium text-primary">✓ Ready</span>
        )}
      </div>
      {resting && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <button
            onClick={onExtend}
            className="underline-offset-2 active:text-foreground hover:underline"
          >
            +30s
          </button>
          <button
            onClick={onSkip}
            className="underline-offset-2 active:text-foreground hover:underline"
          >
            Skip Rest
          </button>
        </div>
      )}
    </div>
  );
}
