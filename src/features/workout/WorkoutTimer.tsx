import { useEffect, useState } from "react";
import { Pause, Play, Timer } from "lucide-react";
import { formatTime } from "@/lib/format";
import { getElapsedSec } from "@/lib/workoutStats";

/**
 * Fixed h-8 w-8 footprint regardless of running state — the previous
 * inline ▶/■ text-glyph buttons had no fixed width, so the box itself
 * visibly resized every time it was toggled (■ is wider than ▶) inside
 * an already-tight set row. Using Play/Pause icons at a constant size
 * fixes that, and also brings this in line with Add Exercise's use of a
 * real icon component instead of a hand-typed character.
 *
 * `after:-inset-2` extends the actual tap target ~16px past the visible
 * box on every side (to comfortably cover the ~44px mobile touch-target
 * guideline) without growing the button's own layout footprint — the
 * set row this sits in is already close to overflowing on narrow Android
 * screens, so an invisible hit-area extension gets the touch-target win
 * without the overflow risk a visually larger button would carry.
 */
export function TimerToggleButton({
  running,
  onClick,
  labels = { pause: "Pause timer", start: "Start timer" },
}: {
  running: boolean;
  onClick: () => void;
  /** Overrides the default per-set-timer aria-labels — e.g. WorkoutHUD's
   *  workout-level pause button says "Pause workout"/"Resume workout"
   *  instead, while every other (per-set) call site keeps the default. */
  labels?: { pause: string; start: string };
}) {
  return (
    <button
      onClick={onClick}
      aria-label={running ? labels.pause : labels.start}
      className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground after:absolute after:-inset-2 after:content-['']"
    >
      {running ? (
        <Pause className="h-3.5 w-3.5 fill-current" />
      ) : (
        <Play className="h-3.5 w-3.5 fill-current" />
      )}
    </button>
  );
}

export interface WorkoutTimerProps {
  startedAt: number;
  /** See ActiveWorkoutDraft.pausedAt in db.ts. Freezes the displayed time
   *  and stops ticking while set. */
  pausedAt?: number | null;
  /** See ActiveWorkoutDraft.totalPausedMs in db.ts. */
  totalPausedMs?: number;
}

export function WorkoutTimer({ startedAt, pausedAt, totalPausedMs }: WorkoutTimerProps) {
  const [elapsed, setElapsed] = useState(() => getElapsedSec(startedAt, pausedAt, totalPausedMs));

  useEffect(() => {
    setElapsed(getElapsedSec(startedAt, pausedAt, totalPausedMs));
    if (pausedAt != null) return; // frozen — nothing to tick
    const t = setInterval(() => {
      setElapsed(getElapsedSec(startedAt, pausedAt, totalPausedMs));
    }, 250);
    return () => clearInterval(t);
  }, [startedAt, pausedAt, totalPausedMs]);

  return (
    <div className="ml-2 flex items-center gap-1 text-sm text-muted-foreground">
      <Timer className="h-4 w-4" />
      <span className="tabular-nums">{formatTime(elapsed)}</span>
    </div>
  );
}

export interface SetTimerProps {
  duration: number;
  timerStart: number | null | undefined;
}

export function SetTimer({ duration, timerStart }: SetTimerProps) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (timerStart == null) return;
    const t = setInterval(() => setTick((x) => x + 1), 250);
    return () => clearInterval(t);
  }, [timerStart]);

  const live =
    timerStart != null
      ? (duration ?? 0) + Math.round((Date.now() - timerStart) / 1000)
      : (duration ?? 0);

  return <span className="min-w-[60px] tabular-nums text-sm">{formatTime(live)}</span>;
}
