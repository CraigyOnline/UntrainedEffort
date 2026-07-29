import { useMemo } from "react";
import type { Workout } from "@/lib/db";

// Roughly how many weeks of history to show. The grid is padded out to
// full week-columns (see below), so the actual span is 12-13 weeks.
const WEEKS = 12;

function toDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
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

  const days = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Start ~12 weeks back, then align to the start of that week (Sunday)
    // so the grid renders as complete week-columns instead of a ragged edge.
    const start = new Date(today);
    start.setDate(start.getDate() - (WEEKS * 7 - 1));
    start.setDate(start.getDate() - start.getDay());

    const list: { key: string; trained: boolean; isFuture: boolean }[] = [];
    const cursor = new Date(start);
    while (cursor <= today || list.length % 7 !== 0) {
      const key = toDayKey(cursor);
      list.push({
        key,
        trained: trainedDays.has(key),
        isFuture: cursor > today,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    return list;
  }, [trainedDays]);

  const weekCount = Math.ceil(days.length / 7);

  return (
    <div className="flex flex-col gap-2">
      <div>
        <h2 className="text-base font-semibold">Training Consistency</h2>
        <p className="text-xs text-muted-foreground">Every workout counts.</p>
      </div>

      <div
        className="grid gap-1"
        style={{
          gridTemplateColumns: `repeat(${weekCount}, 1fr)`,
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
  );
}
