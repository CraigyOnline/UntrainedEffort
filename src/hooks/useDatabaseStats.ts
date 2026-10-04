import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { getDb } from "@/lib/db";
import { useAllExercises } from "@/lib/customExercises";
import { useCustomExercises } from "@/lib/customExercisesStore";

export interface DatabaseStats {
  workoutCount: number | undefined;
  routineCount: number | undefined;
  prCount: number | undefined;
  exerciseCount: number;
  /** Active (non-archived) custom exercises — the same ones exerciseCount
   *  already includes, broken out so the screens can show them separately. */
  customExerciseCount: number;
  oldestWorkout: number | undefined;
  latestWorkout: number | undefined;
  estimatedBytes: number | null;
  storageEstimateSupported: boolean;
}

/**
 * Central source for the "Database Statistics" figures shown on both the
 * Settings page and the Database Maintenance screen. Previously these were
 * five separate inline useLiveQuery calls living directly in the Settings
 * component; extracted here so a second screen doesn't grow a second,
 * potentially-diverging copy of the same queries.
 */
export function useDatabaseStats(): DatabaseStats {
  const exerciseCount = useAllExercises().length;
  const customExerciseCount = useCustomExercises().filter((e) => e.archivedAt === undefined).length;
  const [estimatedBytes, setEstimatedBytes] = useState<number | null>(null);
  const [storageEstimateSupported, setStorageEstimateSupported] = useState(true);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.storage?.estimate) {
      setStorageEstimateSupported(false);
      return;
    }
    navigator.storage
      .estimate()
      .then((estimate) => {
        if (typeof estimate.usage === "number") {
          setEstimatedBytes(estimate.usage);
        } else {
          setStorageEstimateSupported(false);
        }
      })
      .catch(() => setStorageEstimateSupported(false));
  }, []);

  const workoutCount = useLiveQuery(async () => {
    if (typeof window === "undefined") return 0;
    return getDb().workouts.count();
  }, []);

  const routineCount = useLiveQuery(async () => {
    if (typeof window === "undefined") return 0;
    return getDb().routines.count();
  }, []);

  const prCount = useLiveQuery(async () => {
    if (typeof window === "undefined") return 0;
    return getDb().prHistory.count();
  }, []);

  const workoutDateRange = useLiveQuery(async () => {
    if (typeof window === "undefined") return null;
    const db = getDb();
    const [oldest, newest] = await Promise.all([
      db.workouts.orderBy("startedAt").first(),
      db.workouts.orderBy("startedAt").last(),
    ]);
    return { oldest: oldest?.startedAt, newest: newest?.startedAt };
  }, []);

  return {
    workoutCount,
    routineCount,
    prCount,
    exerciseCount,
    customExerciseCount,
    oldestWorkout: workoutDateRange?.oldest,
    latestWorkout: workoutDateRange?.newest,
    estimatedBytes,
    storageEstimateSupported,
  };
}
