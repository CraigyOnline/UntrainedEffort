import { toast } from "sonner";
import { getDb, type Routine, type Workout, type PRRecord } from "@/lib/db";
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
}

export function isBackupPayload(x: unknown): x is BackupPayload {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.schemaVersion === "number" &&
    Array.isArray(o.routines) &&
    Array.isArray(o.workouts) &&
    Array.isArray(o.prHistory)
  );
}

export interface BackupSelection {
  routines?: boolean;
  workouts?: boolean;
  prHistory?: boolean;
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
  selection: BackupSelection = { routines: true, workouts: true, prHistory: true },
): Promise<boolean> {
  try {
    const db = getDb();
    const [routines, workouts, prHistory] = await Promise.all([
      selection.routines ? db.routines.toArray() : Promise.resolve([]),
      selection.workouts ? db.workouts.toArray() : Promise.resolve([]),
      selection.prHistory ? db.prHistory.toArray() : Promise.resolve([]),
    ]);

    const payload: BackupPayload = {
      schemaVersion: SCHEMA_VERSION,
      exportedAt: Date.now(),
      routines,
      workouts,
      prHistory,
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
