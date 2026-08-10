import { useMemo } from "react";
import { Activity, Clock3, MapPin } from "lucide-react";
import type { Workout } from "@/lib/db";
import {
  computeWorkoutDisplayStats,
  formatCardioActivity,
  type CardioActivityStats,
} from "@/lib/workoutStats";
import { formatTimeTrained } from "@/features/history/duration";
import { SummaryStat } from "@/features/history/SummaryStat";

interface CardioSummaryProps {
  workouts: Workout[];
}

interface ActivitySummary {
  exerciseId: string;
  name: string;
  sessions: number;
  durationSec: number;
  distance?: number;
  distanceUnit?: CardioActivityStats["distanceUnit"];
}

/**
 * Cardio gets its own summary rather than being folded into lifting volume.
 * Distance is kept per activity/unit because kilometres, metres and floors
 * are different measures and must never be added together.
 */
export function CardioSummary({ workouts }: CardioSummaryProps) {
  const stats = useMemo(() => computeCardioSummary(workouts), [workouts]);

  if (stats.sessions === 0) return null;

  return (
    <section>
      <div className="mb-3">
        <h2 className="text-base font-semibold">Cardio</h2>
        <p className="text-xs text-muted-foreground">Your cardio counts too.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <SummaryStat
          icon={<Activity className="h-4 w-4" />}
          label="Cardio sessions"
          value={stats.sessions.toLocaleString()}
          footnote="Running, rowing, cycling and more."
        />
        <SummaryStat
          icon={<Clock3 className="h-4 w-4" />}
          label="Cardio time"
          value={formatTimeTrained(stats.durationSec)}
          footnote="Time spent moving."
        />
      </div>

      <div className="mt-3 rounded-2xl bg-card p-4">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Activity breakdown</span>
        </div>
        <div className="mt-3 flex flex-col gap-3">
          {stats.activities.slice(0, 5).map((activity) => (
            <div key={activity.exerciseId} className="min-w-0">
              <div className="flex items-baseline justify-between gap-3">
                <p className="truncate text-sm font-medium">{activity.name}</p>
                <p className="shrink-0 text-xs text-muted-foreground">
                  {activity.sessions} {activity.sessions === 1 ? "session" : "sessions"}
                </p>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatActivitySummary(activity)}
              </p>
            </div>
          ))}
        </div>
        {stats.activities.length > 5 && (
          <p className="mt-3 text-xs text-muted-foreground">
            +{stats.activities.length - 5} more cardio activities
          </p>
        )}
      </div>
    </section>
  );
}

function computeCardioSummary(workouts: Workout[]) {
  const activities = new Map<string, ActivitySummary>();
  let sessions = 0;
  let durationSec = 0;

  for (const workout of workouts) {
    const display = computeWorkoutDisplayStats(workout.exercises);
    if (display.cardioActivities.length === 0) continue;

    sessions += 1;
    durationSec += display.cardioActivities.reduce((sum, activity) => sum + activity.durationSec, 0);

    for (const activity of display.cardioActivities) {
      const existing = activities.get(activity.exerciseId);
      if (existing) {
        existing.sessions += 1;
        existing.durationSec += activity.durationSec;
        if (activity.distance != null && activity.distanceUnit === existing.distanceUnit) {
          existing.distance = (existing.distance ?? 0) + activity.distance;
        }
      } else {
        activities.set(activity.exerciseId, {
          exerciseId: activity.exerciseId,
          name: activity.name,
          sessions: 1,
          durationSec: activity.durationSec,
          distance: activity.distance,
          distanceUnit: activity.distanceUnit,
        });
      }
    }
  }

  return {
    sessions,
    durationSec,
    activities: Array.from(activities.values()).sort((a, b) => {
      if (b.sessions !== a.sessions) return b.sessions - a.sessions;
      return b.durationSec - a.durationSec;
    }),
  };
}

function formatActivitySummary(activity: ActivitySummary): string {
  const sample: CardioActivityStats = {
    exerciseId: activity.exerciseId,
    name: activity.name,
    durationSec: activity.durationSec,
    distance: activity.distance,
    distanceUnit: activity.distanceUnit,
  };

  const parts = [];
  if (activity.distance != null && activity.distanceUnit) {
    parts.push(formatCardioActivity({ ...sample, durationSec: 0 }));
  }
  parts.push(formatTimeTrained(activity.durationSec));
  return parts.filter(Boolean).join(" · ");
}
