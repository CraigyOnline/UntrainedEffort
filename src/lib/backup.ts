import { toast } from "sonner";
import { getDb, type Routine, type Workout, type PRRecord, type ExerciseSettings } from "@/lib/db";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

export const SCHEMA_VERSION = 1;

export interface BackupPayload {
  schemaVersion: number;
  exportedAt: number;
  routines: Routine[];
  workouts: Workout[];
  prHistory: PRRecord[];
  /** Added after schemaVersion 1 shipped. Optional on read so backups
   *  taken before this field existed still import cleanly (isBackupPayload
   *  below accepts it being absent, and the import loop below treats a
   *  missing array the same as an empty one) — this version's
   *  exportBackup always writes it (possibly as an empty array). Not
   *  worth a schemaVersion bump: that gate is a strict equality check (see
   *  the import handler), so bumping it would make every backup file that
   *  already exists suddenly "Unsupported schema version" for a purely
   *  additive field, not an actual incompatibility. */
  exerciseSettings?: ExerciseSettings[];
}

export function isBackupPayload(x: unknown): x is BackupPayload {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.schemaVersion === "number" &&
    Array.isArray(o.routines) &&
    Array.isArray(o.workouts) &&
    Array.isArray(o.prHistory) &&
    (o.exerciseSettings === undefined || Array.isArray(o.exerciseSettings))
  );
}

/**
 * Translates one imported workout's routineId from the backup file's
 * numbering to the id newly assigned (by the caller, via Dexie's
 * auto-increment) to that same routine during this import.
 *
 * This can't be skipped: a routine's id is never preserved across an
 * import (routines are always re-added with a fresh auto-increment key,
 * on both merge and replace — IndexedDB's key generator isn't reset by
 * clear() and never reuses a deleted id), so a workout's routineId taken
 * verbatim from the backup would at best point at nothing in the
 * destination database, and at worst — if some unrelated routine happens
 * to now occupy that old numeric id — silently attach the workout to the
 * wrong routine.
 *
 * idMap covers only the routines actually re-added during this same
 * import operation. A routineId with no entry (its routine wasn't part
 * of this import, or the workout had none to begin with) is cleared to
 * undefined rather than left pointing at a stale, unrelated number —
 * there's no destination id it could correctly mean.
 */
export function remapRoutineId(
  routineId: number | undefined,
  idMap: ReadonlyMap<number, number>,
): number | undefined {
  if (routineId === undefined) return undefined;
  return idMap.get(routineId);
}

export interface BackupSelection {
  routines?: boolean;
  workouts?: boolean;
  prHistory?: boolean;
  exerciseSettings?: boolean;
}

/**
 * Builds a backup file from the current database and writes+shares it
 * (native) or downloads it (web). Defaults to a full backup of all three
 * categories — the Settings export dialog passes its own explicit category
 * selection; the Database Maintenance screen's pre-delete safety backup
 * relies on this full-backup default.
 *
 * Returns whether the backup actually completed. This is false on failure
 * *and* if the user cancels the native share sheet, so a caller that gates a
 * destructive action on a successful backup (deleting old workouts) can
 * safely decide not to proceed rather than assuming success.
 */
export async function exportBackup(
  selection: BackupSelection = {
    routines: true,
    workouts: true,
    prHistory: true,
    exerciseSettings: true,
  },
): Promise<boolean> {
  try {
    const db = getDb();
    const [routines, workouts, prHistory, exerciseSettings] = await Promise.all([
      selection.routines ? db.routines.toArray() : Promise.resolve([]),
      selection.workouts ? db.workouts.toArray() : Promise.resolve([]),
      selection.prHistory ? db.prHistory.toArray() : Promise.resolve([]),
      selection.exerciseSettings ? db.exerciseSettings.toArray() : Promise.resolve([]),
    ]);

    const payload: BackupPayload = {
      schemaVersion: SCHEMA_VERSION,
      exportedAt: Date.now(),
      routines,
      workouts,
      prHistory,
      exerciseSettings,
    };

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `untrained-effort-backup-${stamp}.json`;
    const json = JSON.stringify(payload, null, 2);

    if (Capacitor.isNativePlatform()) {
      const writeResult = await Filesystem.writeFile({
        path: filename,
        data: json,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });
      await Share.share({
        title: filename,
        url: writeResult.uri,
        dialogTitle: "Save or share backup",
      });
      toast.success("Backup exported", { duration: 4000 });
    } else {
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Backup downloaded", { duration: 4000 });
    }
    return true;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return false;
    console.error(err);
    toast.error("Export failed", { duration: 4000 });
    return false;
  }
}
