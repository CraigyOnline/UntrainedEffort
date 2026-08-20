import { useMemo, useState } from "react";
import type { Workout } from "@/lib/db";
import { computeSessionsAndVolume, computeMonthOverMonth } from "@/lib/workoutStats";

type Period = "all" | "year" | "month";

const PERIOD_LABELS: Record<Period, string> = {
  all: "All time",
  year: "Year",
  month: "Month",
};

interface TotalsProps {
  workouts: Workout[];
}

/**
 * Replaces Lifetime Summary + Current Year Summary (two separate stacked
 * cards) with one headline: two big numbers plus a period toggle, per the
 * Overview/History redesign spec. Deliberately not boxed — this is the
 * "no surface" tier, sitting directly on the page background, distinct
 * from Monthly Summaries' bordered cards immediately below it.
 *
 * Unlike the old Current Year Summary, the Year option is always shown
 * (never hidden for users whose whole history fits in one calendar year)
 * — as a single toggled number rather than a whole extra card, showing
 * the same total as "All time" isn't the redundant noise it used to be.
 */
export function Totals({ workouts }: TotalsProps) {
  const [period, setPeriod] = useState<Period>("all");

  const { sessions, volume, caption } = useMemo(
    () => computeTotalsForPeriod(workouts, period),
    [workouts, period],
  );

  return (
    <section>
      <div className="flex items-start justify-between gap-4">
        <p className="text-2xl font-bold">{sessions.toLocaleString()} workouts</p>
        <p className="text-2xl font-bold">{Math.round(volume).toLocaleString()} kg</p>
      </div>
      {caption && <p className="mt-1 text-right text-xs text-muted-foreground">{caption}</p>}

      <div className="mt-3 flex gap-1 rounded-full bg-secondary/60 p-1">
        {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className="flex-1 rounded-full py-1.5 text-xs font-medium transition-colors"
            style={{
              backgroundColor: period === p ? "var(--color-card)" : "transparent",
              color: period === p ? "var(--color-foreground)" : "var(--color-muted-foreground)",
            }}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>
    </section>
  );
}

interface PeriodTotals {
  sessions: number;
  volume: number;
  caption: string | null;
}

function inYear(w: Workout, year: number): boolean {
  return new Date(w.startedAt).getFullYear() === year;
}

/** Percent change from previous → current, or null when there's no prior
 *  period to compare against (avoids a divide-by-zero and avoids implying
 *  a trend where there isn't enough history for one). */
function pctChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

function formatDelta(pct: number | null, label: string): string | null {
  if (pct === null) return null;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct}% vs ${label}`;
}

/** Same "how long have you been training" phrasing as the old Lifetime
 *  Summary card — below a month gets week-level granularity so a real
 *  fortnight of training doesn't collapse into "Just started". */
function formatTrainingDuration(startMs: number, nowMs: number): string {
  const start = new Date(startMs);
  const now = new Date(nowMs);
  const days = Math.floor((nowMs - startMs) / 86400000);

  if (days < 7) return "Just started";

  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months -= 1;
  months = Math.max(0, months);

  if (months < 1) {
    const weeks = Math.floor(days / 7);
    return `Training for ${weeks} ${weeks === 1 ? "week" : "weeks"}`;
  }
  if (months < 12) {
    return `Training for ${months} ${months === 1 ? "month" : "months"}`;
  }

  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  if (remainingMonths === 0) {
    return `Training for ${years} ${years === 1 ? "year" : "years"}`;
  }
  return `Training for ${years} ${years === 1 ? "year" : "years"}, ${remainingMonths} ${
    remainingMonths === 1 ? "month" : "months"
  }`;
}

function computeTotalsForPeriod(workouts: Workout[], period: Period): PeriodTotals {
  const now = new Date();

  if (period === "all") {
    const { sessions, volume } = computeSessionsAndVolume(workouts);
    const firstWorkoutAt = workouts.length
      ? Math.min(...workouts.map((w) => w.startedAt))
      : Date.now();
    return { sessions, volume, caption: formatTrainingDuration(firstWorkoutAt, Date.now()) };
  }

  if (period === "year") {
    const thisYear = workouts.filter((w) => inYear(w, now.getFullYear()));
    const lastYear = workouts.filter((w) => inYear(w, now.getFullYear() - 1));
    const { sessions, volume } = computeSessionsAndVolume(thisYear);
    const { volume: prevVolume } = computeSessionsAndVolume(lastYear);
    return { sessions, volume, caption: formatDelta(pctChange(volume, prevVolume), "last year") };
  }

  // period === "month"
  const { thisMonth, lastMonth } = computeMonthOverMonth(workouts, now.getTime());
  return {
    sessions: thisMonth.sessions,
    volume: thisMonth.volume,
    caption: formatDelta(pctChange(thisMonth.volume, lastMonth.volume), "last month"),
  };
}
