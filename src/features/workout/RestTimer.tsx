import { useEffect, useState } from "react";
import { formatTime } from "@/lib/format";
import type { RestTimerState } from "@/lib/db";

export interface RestTimerProps {
  restTimer: RestTimerState;
  onSkip: () => void;
  onExtend: () => void;
}

/**
 * The rest-timer row shown in the live workout header. Calm and secondary
 * by design (see the feature's philosophy: no flashing colours, no alarms,
 * no "overdue" state) — this never goes red, never counts into negative
 * time, and once it reaches zero it simply becomes a quiet "Ready ✓" that
 * stays put until the next set is completed or the workout ends. Both of
 * those are the caller's responsibility (restarting/clearing restTimer on
 * the session draft) — this component only ever renders what it's given.
 *
 * Ticks locally on a plain interval, the same pattern as WorkoutTimer and
 * SetTimer in this file's neighbour — no shared state needed since the
 * only externally-meaningful moment (reaching zero) doesn't require any
 * caller notification, just a different label.
 */
export function RestTimer({ restTimer, onSkip, onExtend }: RestTimerProps) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 250);
    return () => clearInterval(t);
  }, [restTimer.endsAt]);

  const remaining = Math.max(0, Math.round((restTimer.endsAt - Date.now()) / 1000));
  const resting = remaining > 0;

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-secondary/50 px-3 py-1.5">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">{resting ? "Recovering" : "Ready ✓"}</span>
        {resting && <span className="tabular-nums font-medium">{formatTime(remaining)}</span>}
      </div>
      {resting && (
        <div className="flex items-center gap-3">
          <button
            onClick={onExtend}
            className="text-xs text-muted-foreground underline-offset-2 active:text-foreground hover:underline"
          >
            +30s
          </button>
          <button
            onClick={onSkip}
            className="text-xs text-muted-foreground underline-offset-2 active:text-foreground hover:underline"
          >
            Skip Rest
          </button>
        </div>
      )}
    </div>
  );
}
