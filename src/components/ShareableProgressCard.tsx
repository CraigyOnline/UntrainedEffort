import { forwardRef } from "react";
import type { Workout } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { MuscleMap } from "@/components/MuscleMap";
import { WorkoutStatsRow } from "@/components/WorkoutSummary";
import { CircuitStatsRow, CircuitSignatureIcon } from "@/components/CircuitSummary";
import type { MuscleGroup } from "@/lib/exercises";
import icon from "@/assets/brand/icon.png";

interface ShareableProgressCardProps {
  workout: Workout;
  intensity: Partial<Record<MuscleGroup, number>>;
}

/**
 * Static export-only card for the Workout Complete screen's share action
 * (workoutIntegrity's shareProgressCard captures this to a PNG) — a
 * fixed-width, auto-height layout rather than the interactive screen's
 * own responsive one, since this only ever needs to render once,
 * off-screen, for html-to-image to rasterize.
 *
 * Deliberately plain MuscleMap here, not ExpandableMuscleMap — nothing
 * on an exported image can be tapped, so the tap-to-expand affordance
 * would be dead weight.
 *
 * Built from the app's real Tailwind/CSS-variable classes (bg-card,
 * text-foreground, etc.) rather than hardcoded colors, so it matches
 * whatever the live theme actually looks like instead of drifting from
 * it over time.
 */
export const ShareableProgressCard = forwardRef<HTMLDivElement, ShareableProgressCardProps>(
  function ShareableProgressCard({ workout, intensity }, ref) {
    return (
      <div
        ref={ref}
        style={{ width: 480 }}
        className="flex flex-col gap-5 bg-background p-6 text-foreground"
      >
        <div>
          <p className="text-lg font-bold">{workout.name}</p>
          <p className="text-sm text-muted-foreground">{formatDate(workout.startedAt)}</p>
        </div>

        <div className="rounded-2xl bg-card p-4">
          {workout.circuit ? (
            <CircuitStatsRow durationSec={workout.durationSec} circuit={workout.circuit} />
          ) : (
            <WorkoutStatsRow durationSec={workout.durationSec} exercises={workout.exercises} />
          )}
        </div>

        <div className="rounded-2xl bg-card p-4">
          {workout.circuit ? (
            <CircuitSignatureIcon circuit={workout.circuit} className="mx-auto" />
          ) : (
            <MuscleMap intensity={intensity} className="w-full" />
          )}
        </div>

        <div className="flex items-center justify-center gap-2 pt-1">
          <img src={icon} alt="" className="h-5 w-5 rounded-md" />
          <span className="text-xs font-medium text-muted-foreground">Untrained Effort</span>
        </div>
      </div>
    );
  },
);
