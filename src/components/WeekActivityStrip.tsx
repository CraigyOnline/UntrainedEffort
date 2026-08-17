const WEEKDAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

function dayStart(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

interface WeekActivityStripProps {
  /** Day-start timestamps (see dayStart) of every day that has at least
   *  one workout — not limited to this week, callers only need to pass a
   *  set covering the last 7 days. */
  trainedDays: Set<number>;
}

/**
 * A literal Monday–Sunday calendar week, deliberately — unlike this app's
 * other stats (Totals, Volume trend), which are trailing rolling windows
 * on purpose. A calendar week is what makes "hasn't happened yet" a
 * meaningful, distinct state from "happened, no training" — the whole
 * point of the four bar states below (see the redesign spec, §5).
 */
export function WeekActivityStrip({ trainedDays }: WeekActivityStripProps) {
  const now = new Date();
  const today = dayStart(now.getTime());
  const isoDow = (now.getDay() + 6) % 7; // Mon=0 … Sun=6
  const monday = today - isoDow * 86400000;

  const days = Array.from({ length: 7 }, (_, i) => {
    const date = monday + i * 86400000;
    return {
      label: WEEKDAY_LETTERS[i],
      isFuture: date > today,
      isToday: date === today,
      trained: trainedDays.has(date),
    };
  });

  return (
    <div className="flex gap-1.5">
      {days.map((d, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground/60">{d.label}</span>
          <div
            className="h-1.5 w-full rounded-full"
            style={{
              backgroundColor: d.isFuture
                ? "var(--color-border)"
                : d.trained
                  ? "var(--color-primary)"
                  : "var(--color-secondary)",
              opacity: d.isFuture ? 0.4 : 1,
            }}
          />
          <div
            className="h-1 w-1 rounded-full"
            style={{ backgroundColor: d.isToday ? "var(--color-primary)" : "transparent" }}
          />
        </div>
      ))}
    </div>
  );
}
