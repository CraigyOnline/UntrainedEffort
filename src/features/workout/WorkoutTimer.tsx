import { useEffect, useState } from "react";
import { Timer } from "lucide-react";
import { formatTime } from "@/lib/format";

export interface WorkoutTimerProps {
  startedAt: number;
}

export function WorkoutTimer({ startedAt }: WorkoutTimerProps) {
  const [elapsed, setElapsed] = useState(() =>
    Math.max(0, Math.round((Date.now() - startedAt) / 1000)),
  );

  useEffect(() => {
    setElapsed(Math.max(0, Math.round((Date.now() - startedAt) / 1000)));
    const t = setInterval(() => {
      setElapsed(Math.max(0, Math.round((Date.now() - startedAt) / 1000)));
    }, 250);
    return () => clearInterval(t);
  }, [startedAt]);

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
      : duration ?? 0;

  return <span className="min-w-[60px] tabular-nums text-sm">{formatTime(live)}</span>;
}
