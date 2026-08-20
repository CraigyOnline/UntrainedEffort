import type { Workout } from "@/lib/db";
import { computeSessionsAndVolume } from "@/lib/workoutStats";

interface OverviewTotalsProps {
  workouts: Workout[];
}

/**
 * Overview's lightweight all-time snapshot — two bare numbers, no period
 * toggle. Shares computeSessionsAndVolume with Insights' Totals component
 * but is deliberately its own presentation: Overview answers "how's
 * training going right now," which doesn't need a Year/Month explorer —
 * that's what tapping through to Insights is for. Splitting this out
 * (rather than adding a "hideToggle" prop to Totals) keeps each component
 * responsible for one information architecture instead of two.
 */
export function OverviewTotals({ workouts }: OverviewTotalsProps) {
  const { sessions, volume } = computeSessionsAndVolume(workouts);
  return (
    <div className="flex items-start justify-between gap-4">
      <p className="text-2xl font-bold">{sessions.toLocaleString()} workouts</p>
      <p className="text-2xl font-bold">{Math.round(volume).toLocaleString()} kg</p>
    </div>
  );
}
