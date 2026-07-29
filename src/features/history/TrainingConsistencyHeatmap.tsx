import { useMemo } from "react";
import type { Workout } from "@/lib/db";

// Roughly how many weeks of history to show. The grid is padded out to
// full week-columns (see below), so the actual span is 12-13 weeks.
const WEEKS = 12;

// Narrow fixed column for weekday labels. Kept small so it doesn't eat
// into the space available for the day squares on narrow phones.
const DAY_LABEL_WIDTH = 20;

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// GitHub-style: only label a subset of weekday rows to avoid clutter.
const DAY_LABEL_ROWS: Record<number, string> = {
  1: "Mon",
  3: "Wed",
  5: "Fri",
};

function toDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

interface DayCell {
  key: string;
  trained: boolean;
  isFuture: boolean;
  isFirstOfMonth: boolean;
  monthLabel: string;
}

interface TrainingConsistencyHeatmapProps {
  workouts: Workout[];
}

/**
 * Display-only, GitHub-inspired contribution heatmap celebrating training
 * consistency. Intentionally binary (trained / not trained) — this is not
 * a performance comparison, so there are no intensity shades and no
 * negative/red coloring for missed days.
 *
 * No interactivity yet (no tap, no animation, no filtering) — those are
 * planned as later, separate iterations.
 */
export function TrainingConsistencyHeatmap({ workouts }: TrainingConsistencyHeatmapProps) {
  const trainedDays = useMemo(() => {
    const set = new Set<string>();
    for (const w of workouts) {
      set.add(toDayKey(new Date(w.startedAt)));
    }
    return set;
  }, [workouts]);

  const days = useMemo<DayCell[]>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Start ~12 weeks back, then align to the start of that week (Sunday)
    // so the grid renders as complete week-columns instead of a ragged edge.
    const start = new Date(today);
    start.setDate(start.getDate() - (WEEKS * 7 - 1));
    start.setDate(start.getDate() - start.getDay());

    const list: DayCell[] = [];
    const cursor = new Date(start);
    while (cursor <= today || list.length % 7 !== 0) {
      const key = toDayKey(cursor);
      list.push({
        key,
        trained: trainedDays.has(key),
        isFuture: cursor > today,
        isFirstOfMonth: cursor.getDate() === 1,
        monthLabel: MONTH_LABELS[cursor.getMonth()],
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    return list;
  }, [trainedDays]);

  const weekCount = Math.ceil(days.length / 7);

  // One month label per column: the column gets a label if any of its
  // days is the 1st of a month. A week only ever contains one "1st".
  const monthColumnLabels = useMemo(() => {
    const labels: string[] = new Array(weekCount).fill("");
    for (let col = 0; col < weekCount; col++) {
      for (let row = 0; row < 7; row++) {
        const day = days[col * 7 + row];
        if (day?.isFirstOfMonth) {
          labels[col] = day.monthLabel;
          break;
        }
      }
    }
    return labels;
  }, [days, weekCount]);

  const gridColumnStyle = { gridTemplateColumns: `repeat(${weekCount}, 1fr)` };

  return (
    <div className="flex flex-col gap-2">
      <div>
        <h2 className="text-base font-semibold">Training Consistency</h2>
        <p className="text-xs text-muted-foreground">Every workout counts.</p>
      </div>

      <div className="flex flex-col gap-1">
        {/* Month labels, aligned to the week columns below */}
        <div className="flex">
          <div style={{ width: DAY_LABEL_WIDTH }} />
          <div className="grid flex-1 gap-1" style={gridColumnStyle}>
            {monthColumnLabels.map((label, i) => (
              <span
                key={i}
                className="overflow-visible whitespace-nowrap text-[9px] leading-none text-muted-foreground"
              >
                {label}
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-stretch gap-1">
          {/* Weekday labels, matching the 7 rows of the day grid */}
          <div className="grid grid-rows-7 gap-1" style={{ width: DAY_LABEL_WIDTH }}>
            {Array.from({ length: 7 }, (_, row) => (
              <span key={row} className="text-[9px] leading-none text-muted-foreground">
                {DAY_LABEL_ROWS[row] ?? ""}
              </span>
            ))}
          </div>

          <div
            className="grid flex-1 gap-1"
            style={{
              ...gridColumnStyle,
              gridTemplateRows: "repeat(7, 1fr)",
              gridAutoFlow: "column",
            }}
          >
            {days.map((day) => (
              <div
                key={day.key}
                className={`aspect-square rounded-sm ${
                  day.isFuture ? "invisible" : day.trained ? "bg-primary" : "bg-secondary"
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
