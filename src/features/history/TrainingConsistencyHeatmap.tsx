import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { Workout } from "@/lib/db";
import {
  computeWorkoutDisplayStats,
  computeWorkoutStats,
  formatCardioActivity,
  type WorkoutMode,
} from "@/lib/workoutStats";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

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
// Row 0 is Monday (the grid's week starts on Monday — see the `days`
// memo below), so labelled rows shift down from the old Sunday-first
// 1/3/5 to 0/2/4.
const DAY_LABEL_ROWS: Record<number, string> = {
  0: "Mon",
  2: "Wed",
  4: "Fri",
};

function toDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * WorkoutMode plus "circuit" — computeWorkoutDisplayStats (imported
 * above) has no concept of a circuit workout, since it only looks at
 * w.exercises (always [] for one — see Workout in db.ts) and falls
 * through every check to its "strength" default. Rather than extend
 * WorkoutMode itself, which would mean threading "circuit" through
 * computeWorkoutDisplayStats and its ~9 other call sites across the app,
 * this stays local to the heatmap the same way the history timeline
 * card's identical fix did — see workoutMode() below. */
type DayMode = WorkoutMode | "circuit";

function workoutMode(w: Workout): DayMode {
  return w.circuit ? "circuit" : computeWorkoutDisplayStats(w.exercises).mode;
}

interface DayCell {
  key: string;
  trained: boolean;
  isFuture: boolean;
  isFirstOfMonth: boolean;
  monthLabel: string;
  mode: DayMode;
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
 * Tapping a trained day opens a quick preview of that day's workout(s),
 * with the option to open the full workout or go back. Untrained and
 * future days are inert — there's nothing to show for them.
 */
export function TrainingConsistencyHeatmap({ workouts }: TrainingConsistencyHeatmapProps) {
  const navigate = useNavigate();
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);

  const workoutsByDay = useMemo(() => {
    const map = new Map<string, Workout[]>();
    for (const w of workouts) {
      const key = toDayKey(new Date(w.startedAt));
      const bucket = map.get(key);
      if (bucket) bucket.push(w);
      else map.set(key, [w]);
    }
    return map;
  }, [workouts]);

  const days = useMemo<DayCell[]>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Start ~12 weeks back, then align to the start of that week (Monday)
    // so the grid renders as complete week-columns instead of a ragged edge.
    const start = new Date(today);
    start.setDate(start.getDate() - (WEEKS * 7 - 1));
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));

    const list: DayCell[] = [];
    const cursor = new Date(start);
    while (cursor <= today || list.length % 7 !== 0) {
      const key = toDayKey(cursor);
      list.push({
        key,
        trained: workoutsByDay.has(key),
        isFuture: cursor > today,
        isFirstOfMonth: cursor.getDate() === 1,
        monthLabel: MONTH_LABELS[cursor.getMonth()],
        mode: getDayMode(workoutsByDay.get(key) ?? []),
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    return list;
  }, [workoutsByDay]);

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
              <button
                key={day.key}
                type="button"
                disabled={day.isFuture || !day.trained}
                onClick={() => setSelectedDayKey(day.key)}
                aria-label={day.trained ? `View workouts from ${day.key}` : undefined}
                className={`aspect-square rounded-sm ${
                  day.isFuture
                    ? "invisible"
                    : !day.trained
                      ? "bg-secondary"
                      : day.mode === "circuit"
                        ? "bg-circuit active:scale-90"
                        : day.mode === "cardio" || day.mode === "interval"
                          ? "bg-cardio active:scale-90"
                          : day.mode === "mixed"
                            ? "bg-chart-4 ring-1 ring-primary-foreground/70 active:scale-90"
                            : "bg-primary active:scale-90"
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-primary" /> Strength
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-cardio" /> Cardio
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-circuit" /> Circuit
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-chart-4 ring-1 ring-primary-foreground/70" />{" "}
          Mixed
        </span>
      </div>

      <Dialog open={!!selectedDayKey} onOpenChange={(open) => !open && setSelectedDayKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedDayKey && formatDialogDate(selectedDayKey)}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            {selectedDayKey &&
              workoutsByDay.get(selectedDayKey)?.map((w) => {
                const display = computeWorkoutDisplayStats(w.exercises);
                const { totalSets, totalVolume } = computeWorkoutStats(w.exercises);
                const mode = workoutMode(w);
                const cardioSummary = display.cardioActivities
                  .map(formatCardioActivity)
                  .filter(Boolean)
                  .join(" · ");
                const intervalSummary =
                  display.intervalActivities.length > 0
                    ? `${display.intervalActivities.reduce((sum, activity) => sum + activity.rounds, 0)} rounds`
                    : "";
                return (
                  <div key={w.id ?? w.startedAt} className="rounded-2xl bg-card p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold">{w.name}</p>
                      <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium capitalize text-muted-foreground">
                        {mode}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {Math.max(1, Math.round((w.durationSec ?? 0) / 60))} min ·{" "}
                      {mode === "circuit" && w.circuit
                        ? `${w.circuit.config.stations.length} stations · ${w.circuit.roundsCompleted}/${w.circuit.config.rounds} rounds`
                        : mode === "cardio" && cardioSummary
                          ? cardioSummary
                          : mode === "interval" && intervalSummary
                            ? intervalSummary
                            : `${w.exercises.length} ex · ${totalSets} sets${
                                totalVolume > 0 ? ` · ${totalVolume.toLocaleString()} kg` : ""
                              }`}
                    </p>
                    <Button
                      size="sm"
                      className="mt-3 w-full"
                      onClick={() => {
                        if (!w.id) return;
                        setSelectedDayKey(null);
                        navigate({ to: "/history/$id", params: { id: String(w.id) } });
                      }}
                    >
                      View Workout
                    </Button>
                  </div>
                );
              })}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedDayKey(null)}>
              Back
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function getDayMode(workouts: Workout[]): DayMode {
  const modes = new Set<DayMode>();
  for (const workout of workouts) {
    modes.add(workoutMode(workout));
  }

  if (modes.size === 0) return "strength";
  if (modes.size > 1 || modes.has("mixed")) return "mixed";
  return modes.values().next().value ?? "strength";
}

/** e.g. "2026-07-15" -> "Wednesday, July 15" */
function formatDialogDate(dayKey: string): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}
