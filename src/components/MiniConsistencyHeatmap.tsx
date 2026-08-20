import { useNavigate } from "@tanstack/react-router";
import { getCalendarWeekStart } from "@/lib/format";

const WEEKDAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];
const DAY_MS = 86400000;

function dayStart(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

interface MiniConsistencyHeatmapProps {
  /** Day-start timestamps (see dayStart) of every day that has at least
   *  one workout — callers only need to cover the visible window. */
  trainedDays: Set<number>;
  /** Number of calendar weeks shown, oldest → newest, left to right.
   *  Default 4: "the last month at a glance" — enough to read as a
   *  habit, not so much it competes with Last Workout below it. This is
   *  a real trade-off, not a fixed fact; see the redesign review. */
  weeks?: number;
}

/**
 * Replaces the old single-week bar strip. That widget and the full
 * Insights → Training heatmap were answering the same question
 * ("how consistent am I") at two disconnected zoom levels, which read as
 * redundant no matter how differently they were styled — this is one
 * widget, just a shorter version of the real one, with a genuine tap-
 * through rather than a decorative duplicate. The rightmost column is
 * always the current getCalendarWeekStart() week — the same "this week"
 * the hero sentence and the consistency Training Signal both use (see
 * the redesign review's point 5) — so the four-state day treatment
 * (trained / past-empty / future / today) still means the same thing
 * here as it does in the full heatmap.
 */
export function MiniConsistencyHeatmap({ trainedDays, weeks = 4 }: MiniConsistencyHeatmapProps) {
  const navigate = useNavigate();
  const today = dayStart(Date.now());
  const thisWeekStart = getCalendarWeekStart(Date.now());
  const gridStart = thisWeekStart - (weeks - 1) * 7 * DAY_MS;

  const columns = Array.from({ length: weeks }, (_, w) => {
    const weekStart = gridStart + w * 7 * DAY_MS;
    return Array.from({ length: 7 }, (_, d) => {
      const date = weekStart + d * DAY_MS;
      return {
        date,
        isFuture: date > today,
        isToday: date === today,
        trained: trainedDays.has(date),
      };
    });
  });

  return (
    <button
      type="button"
      onClick={() => navigate({ to: "/history/insights" })}
      className="flex flex-col items-start gap-1.5 active:opacity-70"
    >
      <div className="flex gap-[3px]">
        {columns.map((col, ci) => (
          <div key={ci} className="flex flex-col gap-[3px]">
            {col.map((d, di) => (
              <div
                key={di}
                aria-label={ci === weeks - 1 ? WEEKDAY_LETTERS[di] : undefined}
                className="h-2.5 w-2.5 rounded-[2px]"
                style={{
                  backgroundColor: d.isFuture
                    ? "var(--color-border)"
                    : d.trained
                      ? "var(--color-primary)"
                      : "var(--color-secondary)",
                  opacity: d.isFuture ? 0.4 : 1,
                  boxShadow: d.isToday ? "0 0 0 1px var(--color-primary)" : undefined,
                }}
              />
            ))}
          </div>
        ))}
      </div>
      <span className="text-xs font-medium text-primary">View training history →</span>
    </button>
  );
}
