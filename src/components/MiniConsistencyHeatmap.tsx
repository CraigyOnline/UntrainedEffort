import { useNavigate } from "@tanstack/react-router";
import { getCalendarWeekStart } from "@/lib/format";

const DAY_MS = 86400000;
const DAY_LABEL_WIDTH = 16;

/** Sparse labels, matching Insights' full TrainingConsistencyHeatmap's own
 *  DAY_LABEL_ROWS convention exactly (Mon/Wed/Fri only, not all 7) — same
 *  visual language, so this genuinely reads as "a smaller version of
 *  that," not an unrelated widget. */
const DAY_LABEL_ROWS: Record<number, string> = {
  0: "M",
  2: "W",
  4: "F",
};

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
   *  Default 4: "the last month at a glance." */
  weeks?: number;
}

/**
 * A compact version of Insights' full consistency heatmap, not a
 * decorative strip — same Monday-start weekly grid, same weekday-label
 * convention, same trained/untrained/future/today distinction, just
 * fewer weeks. Meant to be rendered inside its own labeled section by
 * the caller (see Overview's "Consistency" section) rather than sitting
 * bare under the hero text, which read as an unbounded, unlabeled block
 * on-device — see the redesign follow-up review.
 *
 * Cells stretch to fill whatever width AND height the card actually
 * gives this component (a CSS grid of 1fr rows/columns, no fixed cell
 * size, no aspect-square), rather than sitting at a small fixed size
 * with dead space around them. This is bounded, not runaway: the grid
 * fills the space its container already has — it never asks the
 * container to grow — so it can't force the "Training signal" card it
 * sits beside in a stretched flex row to stretch to an awkward height.
 * weeks is still the lever for how much history shows; it no longer
 * has any say over how big each cell renders.
 */
export function MiniConsistencyHeatmap({ trainedDays, weeks = 8 }: MiniConsistencyHeatmapProps) {
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
      className="flex h-full w-full flex-col gap-3 active:opacity-70"
    >
      <div className="flex min-h-0 flex-1 gap-1.5">
        <div className="grid h-full grid-rows-7 gap-1" style={{ width: DAY_LABEL_WIDTH }}>
          {Array.from({ length: 7 }, (_, row) => (
            <span
              key={row}
              className="flex items-center text-[9px] leading-none text-muted-foreground"
            >
              {DAY_LABEL_ROWS[row] ?? ""}
            </span>
          ))}
        </div>
        <div
          className="grid h-full flex-1 gap-1"
          style={{
            gridTemplateColumns: `repeat(${weeks}, 1fr)`,
            gridTemplateRows: "repeat(7, 1fr)",
            gridAutoFlow: "column",
          }}
        >
          {columns.map((col, ci) =>
            col.map((d, di) => (
              <div
                key={`${ci}-${di}`}
                className="rounded-sm"
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
            )),
          )}
        </div>
      </div>
      <span className="text-xs font-medium text-primary">View training history →</span>
    </button>
  );
}
