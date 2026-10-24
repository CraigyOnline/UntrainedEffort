import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Workout } from "@/lib/db";
import {
  computeWorkoutDisplayStats,
  computeWorkoutStats,
  formatCardioActivity,
  type WorkoutMode,
} from "@/lib/workoutStats";
import { Button } from "@/components/ui/button";
import { formatVolume, getWeightUnit } from "@/lib/units";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

// Roughly how many weeks fit in the default view. The grid is padded out
// to full week-columns (see below), so the actual span is 12-13 weeks.
// Older history extends to the left of this and is reached by scrolling —
// cells stay the size they are in this default view.
const WEEKS = 12;

// Safety bound on how far back the grid will ever extend (about 10 years),
// so a single corrupted or imported workout with a bogus date can't make
// the grid build tens of thousands of cells. Far beyond real use.
const MAX_WEEKS = 520;

// The gap between the weekday labels and the grid — the pinned label
// column's right padding (pr-1), so its background covers it.
const LABEL_GAP = 4;

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
  year: number;
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
 * The default view shows about the last three months. Once there is older
 * history, the grid extends back to the first logged workout and scrolls
 * sideways (opening on the most recent weeks), with the weekday labels
 * pinned on the left.
 *
 * Tapping a trained day opens a quick preview of that day's workout(s),
 * with the option to open the full workout or go back. Untrained and
 * future days are inert — there's nothing to show for them.
 */
export function TrainingConsistencyHeatmap({ workouts }: TrainingConsistencyHeatmapProps) {
  const navigate = useNavigate();
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Whether there are more weeks to scroll to on each side — drives the
  // edge chevrons, which only show in a direction that has more to reveal.
  const [edges, setEdges] = useState({ back: false, forward: false });

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

  // `visibleWeeks` is how many week-columns the default (~three month) view
  // holds — the scroll container's width is derived from it so cells keep
  // that view's size however much older history the grid extends to.
  const { days, visibleWeeks } = useMemo<{ days: DayCell[]; visibleWeeks: number }>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const mondayOf = (d: Date) => {
      const m = new Date(d);
      m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
      return m;
    };

    // Default start: ~12 weeks back, aligned to the start of that week
    // (Monday) so the grid renders as complete week-columns instead of a
    // ragged edge.
    const defaultStart = new Date(today);
    defaultStart.setDate(defaultStart.getDate() - (WEEKS * 7 - 1));
    const defaultStartMonday = mondayOf(defaultStart);

    // Extend back to the week of the earliest workout, if that's earlier
    // (never beyond MAX_WEEKS), so older history can be scrolled to.
    let start = defaultStartMonday;
    const earliestAllowed = mondayOf(today);
    earliestAllowed.setDate(earliestAllowed.getDate() - (MAX_WEEKS - 1) * 7);
    for (const w of workouts) {
      const d = new Date(w.startedAt);
      if (Number.isNaN(d.getTime())) continue;
      d.setHours(0, 0, 0, 0);
      const m = mondayOf(d);
      if (m < start) start = m < earliestAllowed ? earliestAllowed : m;
    }

    const visibleWeeks =
      Math.round((mondayOf(today).getTime() - defaultStartMonday.getTime()) / (7 * 86_400_000)) + 1;

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
        year: cursor.getFullYear(),
        mode: getDayMode(workoutsByDay.get(key) ?? []),
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    return { days: list, visibleWeeks };
  }, [workouts, workoutsByDay]);

  const weekCount = Math.ceil(days.length / 7);

  const updateEdges = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const back = el.scrollLeft > 1;
    const forward = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setEdges((prev) => (prev.back === back && prev.forward === forward ? prev : { back, forward }));
  }, []);

  // Open on the most recent weeks (the right edge), and again whenever the
  // grid's length changes (e.g. workouts finish loading).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
    updateEdges();
  }, [weekCount, updateEdges]);

  // A resize (rotation, split-screen) changes how much is scrollable
  // without any scroll event, so re-check the edges then too.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(updateEdges);
    observer.observe(el);
    return () => observer.disconnect();
  }, [updateEdges]);

  /** Scrolls roughly one screenful (about a quarter of a year) toward the
   *  older (-1) or newer (+1) weeks. */
  function scrollByPage(direction: -1 | 1) {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * (el.clientWidth - labelColumn), behavior: "smooth" });
  }

  // One month label per column: the column gets a label if any of its
  // days is the 1st of a month. A week only ever contains one "1st".
  // Once the grid reaches back past the default view, January also shows
  // its year so labels stay unambiguous across years.
  const monthColumnLabels = useMemo(() => {
    const labels: string[] = new Array(weekCount).fill("");
    const showYear = weekCount > visibleWeeks;
    for (let col = 0; col < weekCount; col++) {
      for (let row = 0; row < 7; row++) {
        const day = days[col * 7 + row];
        if (day?.isFirstOfMonth) {
          labels[col] =
            showYear && day.monthLabel === "Jan"
              ? `${day.monthLabel} ${String(day.year).slice(-2)}`
              : day.monthLabel;
          break;
        }
      }
    }
    return labels;
  }, [days, weekCount, visibleWeeks]);

  const gridColumnStyle = { gridTemplateColumns: `repeat(${weekCount}, 1fr)` };

  // The scrolling content is as wide as the default view's week columns,
  // scaled by how many more columns there are, plus the pinned label
  // column — so a column is the same width at any history length. Equals
  // 100% (no scrolling) when there's no more than the default view.
  const labelColumn = DAY_LABEL_WIDTH + LABEL_GAP;
  const scrollContentWidth = `calc(${labelColumn}px + (100% - ${labelColumn}px) * ${
    weekCount / visibleWeeks
  })`;

  return (
    <div className="flex flex-col gap-2">
      {/* Horizontal scroll container. Weekday labels are pinned (sticky) on
          the left; month labels and the grid scroll together beneath. */}
      <div className="relative">
        <div ref={scrollRef} className="overflow-x-auto" onScroll={updateEdges}>
          <div className="flex" style={{ width: scrollContentWidth }}>
            {/* Weekday labels, matching the 7 rows of the day grid. The spacer
              stands in for the month-label row so the rows line up. The
              label-to-grid gap is this column's own right padding rather
              than a flex gap, so its solid background covers it — a gap
              would let scrolled cells show through as a sharp sliver
              between the labels and the edge fade. */}
            <div
              className="sticky left-0 z-10 box-border flex shrink-0 flex-col gap-1 bg-background pr-1"
              style={{ width: labelColumn }}
            >
              <div className="h-[9px]" aria-hidden />
              <div className="grid flex-1 grid-rows-7 gap-1">
                {Array.from({ length: 7 }, (_, row) => (
                  <span key={row} className="text-[9px] leading-none text-muted-foreground">
                    {DAY_LABEL_ROWS[row] ?? ""}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-1">
              {/* Month labels, aligned to the week columns below */}
              <div className="grid h-[9px] gap-1" style={gridColumnStyle}>
                {monthColumnLabels.map((label, i) => (
                  <span
                    key={i}
                    className="overflow-visible whitespace-nowrap text-[9px] leading-none text-muted-foreground"
                  >
                    {label}
                  </span>
                ))}
              </div>

              <div
                className="grid gap-1"
                style={{
                  ...gridColumnStyle,
                  // auto, not 1fr: 1fr row tracks and aspect-square children
                  // were fighting over height in this auto-height grid (no
                  // explicit container height for 1fr to divide up), which is
                  // what produced one visibly oversized cell — observed on
                  // this component's narrower Overview usage specifically,
                  // not its full-width Insights usage, consistent with a
                  // sizing conflict that only surfaces at some widths. Every
                  // column is the same 1fr width, so aspect-square already
                  // gives every cell in a row the same natural height — auto
                  // sizing has nothing left to resolve ambiguously.
                  gridTemplateRows: "repeat(7, auto)",
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
                                ? "bg-mixed ring-1 ring-primary-foreground/70 active:scale-90"
                                : "bg-primary active:scale-90"
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Scroll cues: a chevron over a soft fade at whichever edge has more
          weeks to reveal. Tapping scrolls about a quarter; absent entirely
          when the whole history fits. The fade doesn't take touches, so
          swiping across it still scrolls the grid. */}
        {edges.back && (
          <div
            className="pointer-events-none absolute inset-y-0 z-20 flex items-center"
            style={{ left: labelColumn }}
          >
            <div className="absolute inset-y-0 left-0 w-10 bg-linear-to-r from-background to-transparent" />
            <button
              type="button"
              aria-label="Show earlier weeks"
              onClick={() => scrollByPage(-1)}
              className="pointer-events-auto relative flex h-7 w-7 items-center justify-center rounded-full bg-card/90 text-muted-foreground shadow-sm active:scale-90"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>
        )}
        {edges.forward && (
          <div className="pointer-events-none absolute inset-y-0 right-0 z-20 flex items-center justify-end">
            <div className="absolute inset-y-0 right-0 w-10 bg-linear-to-l from-background to-transparent" />
            <button
              type="button"
              aria-label="Show later weeks"
              onClick={() => scrollByPage(1)}
              className="pointer-events-auto relative flex h-7 w-7 items-center justify-center rounded-full bg-card/90 text-muted-foreground shadow-sm active:scale-90"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
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
          <span className="h-2.5 w-2.5 rounded-sm bg-mixed ring-1 ring-primary-foreground/70" />{" "}
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
                                totalVolume > 0
                                  ? ` · ${formatVolume(Math.round(totalVolume), getWeightUnit())}`
                                  : ""
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
