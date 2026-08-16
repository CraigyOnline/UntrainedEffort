import { forwardRef } from "react";
import type { Workout } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { MuscleMap } from "@/components/MuscleMap";
import { CardioSignature } from "@/components/CardioSignature";
import { WorkoutStatsRow } from "@/components/WorkoutSummary";
import { CircuitStatsRow, CircuitSignatureIcon } from "@/components/CircuitSummary";
import { computeIntensity } from "@/lib/muscles";
import {
  computeWorkoutDisplayStats,
  computeDominantSignature,
  resolveCardioPattern,
} from "@/lib/workoutStats";
import icon from "@/assets/brand/icon.png";

interface ShareableProgressCardProps {
  workout: Workout;
}

/**
 * Static export-only card for the share action on both the Workout
 * Complete screen and the History detail page (shareCard.ts's
 * shareProgressCard captures this to a PNG) — a fixed-width, auto-height
 * layout rather than either screen's own responsive one, since this only
 * ever needs to render once, off-screen, for html-to-image to rasterize.
 *
 * Deliberately computes intensity/dominant-signature itself from
 * `workout` alone, the same self-contained way WorkoutSummary computes
 * its own intensity internally, rather than taking them as props — two
 * separate call sites each pre-computing and passing this in would risk
 * quietly drifting out of sync with each other (and did: the first
 * version of this card, built only against the Workout Complete screen,
 * had no cardio-dominant branch at all — MuscleMap unconditionally,
 * matching that screen's own always-MuscleMap choice, but wrong for
 * History's page, which already branches to CardioSignature the way
 * WorkoutSummary does below).
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
  function ShareableProgressCard({ workout }, ref) {
    const stats = workout.circuit ? null : computeWorkoutDisplayStats(workout.exercises);
    const dominant = stats ? computeDominantSignature(stats) : null;

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
          ) : dominant === "strength" ? (
            <MuscleMap intensity={computeIntensity(workout.exercises)} className="w-full" />
          ) : (
            <CardioSignature pattern={resolveCardioPattern(stats!)} className="mx-auto" />
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
