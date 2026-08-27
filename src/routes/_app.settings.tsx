import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getDb, type Routine, type Workout } from "@/lib/db";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Download,
  Upload,
  Info,
  FileText,
  Database,
  Wrench,
  MonitorSmartphone,
  ChevronRight,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { getKeepAwakeDefault, setKeepAwakeDefault } from "@/lib/keepAwake";
import { getHapticsEnabled, setHapticsEnabled } from "@/lib/haptics";
import { getBodyType, setBodyType, type BodyType } from "@/lib/bodyType";
import {
  getRoutineUpdatePromptEnabled,
  setRoutineUpdatePromptEnabled,
} from "@/lib/routineUpdatePrompt";
import { useDatabaseStats } from "@/hooks/useDatabaseStats";
import {
  exportBackup,
  isBackupPayload,
  remapRoutineId,
  SCHEMA_VERSION,
  type BackupPayload,
} from "@/lib/backup";
import { formatDate, formatBytes } from "@/lib/format";
import { syncWorkoutIntegrity } from "@/lib/workoutIntegrity";

const APP_VERSION = "1.0.0";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({
    meta: [
      { title: "Settings · Untrained Effort" },
      { name: "description", content: "App settings, backup, restore and licenses." },
    ],
  }),
  component: SettingsPage,
});

type Category = "routines" | "workouts" | "prHistory" | "exerciseSettings";

// PR Records is deliberately excluded from import: Personal Records are
// always fully recalculated from whichever workouts exist after an import
// (see runImport below), never written from a backup's prHistory data, so
// it was never a real, independent selection to begin with. Export keeps
// the full Category list — prHistory there genuinely is written to the
// file and is a meaningful thing to include or leave out.
type ImportCategory = Exclude<Category, "prHistory">;

function categoryLabel(c: Category): string {
  if (c === "routines") return "Routines";
  if (c === "workouts") return "Workout History";
  if (c === "prHistory") return "PR Records";
  return "Exercise Rest Times";
}

function importCategoryCount(payload: BackupPayload, c: Category): number {
  if (c === "routines") return payload.routines.length;
  if (c === "workouts") return payload.workouts.length;
  if (c === "prHistory") return payload.prHistory.length;
  // Absent on backups taken before this field existed — same as empty.
  return payload.exerciseSettings?.length ?? 0;
}

function SettingsPage() {
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Export dialog state ─────────────────────────────────────────────
  const [exportOpen, setExportOpen] = useState(false);
  const [exportSelected, setExportSelected] = useState<Record<Category, boolean>>({
    routines: true,
    workouts: true,
    prHistory: true,
    exerciseSettings: true,
  });
  const [exportCounts, setExportCounts] = useState<Record<Category, number> | null>(null);

  // ── Import dialog state ─────────────────────────────────────────────
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [importPayload, setImportPayload] = useState<BackupPayload | null>(null);
  const [importSelected, setImportSelected] = useState<Record<ImportCategory, boolean>>({
    routines: true,
    workouts: true,
    exerciseSettings: true,
  });
  const [replaceConfirmOpen, setReplaceConfirmOpen] = useState(false);

  // ── Database statistics (shared with the Database Maintenance screen) ──
  const stats = useDatabaseStats();

  // ── Keep screen awake default ───────────────────────────────────────
  const [keepAwakeEnabled, setKeepAwakeEnabled] = useState(false);
  useEffect(() => {
    setKeepAwakeEnabled(getKeepAwakeDefault());
  }, []);

  function handleKeepAwakeChange(checked: boolean) {
    setKeepAwakeEnabled(checked);
    setKeepAwakeDefault(checked);
  }

  // ── Haptic feedback ──────────────────────────────────────────────────
  const [hapticsEnabled, setHapticsEnabledState] = useState(true);
  useEffect(() => {
    setHapticsEnabledState(getHapticsEnabled());
  }, []);

  function handleHapticsChange(checked: boolean) {
    setHapticsEnabledState(checked);
    setHapticsEnabled(checked);
  }

  // ── Muscle map body type ─────────────────────────────────────────────
  const [bodyType, setBodyTypeState] = useState<BodyType>("male");
  useEffect(() => {
    setBodyTypeState(getBodyType());
  }, []);

  function handleBodyTypeChange(value: string) {
    const next = value as BodyType;
    setBodyTypeState(next);
    setBodyType(next);
  }

  // ── "Update Routine?" prompt ──────────────────────────────────────────
  const [routineUpdatePromptEnabled, setRoutineUpdatePromptEnabledState] = useState(true);
  useEffect(() => {
    setRoutineUpdatePromptEnabledState(getRoutineUpdatePromptEnabled());
  }, []);

  function handleRoutineUpdatePromptChange(checked: boolean) {
    setRoutineUpdatePromptEnabledState(checked);
    setRoutineUpdatePromptEnabled(checked);
  }

  // ── Export flow ──────────────────────────────────────────────────────

  async function openExportDialog() {
    const db = getDb();
    const [routines, workouts, prHistory, exerciseSettings] = await Promise.all([
      db.routines.count(),
      db.workouts.count(),
      db.prHistory.count(),
      db.exerciseSettings.count(),
    ]);
    setExportCounts({ routines, workouts, prHistory, exerciseSettings });
    setExportSelected({ routines: true, workouts: true, prHistory: true, exerciseSettings: true });
    setExportOpen(true);
  }

  async function confirmExport() {
    const anySelected = Object.values(exportSelected).some(Boolean);
    if (!anySelected) {
      toast.error("Select at least one category to export", { duration: 4000 });
      return;
    }
    const ok = await exportBackup(exportSelected);
    if (ok) setExportOpen(false);
  }

  // ── Import flow ──────────────────────────────────────────────────────

  function triggerFilePick() {
    fileRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!isBackupPayload(parsed)) {
        toast.error("Invalid backup file", { duration: 4000 });
        return;
      }
      if (parsed.schemaVersion !== SCHEMA_VERSION) {
        toast.error(`Unsupported schema version: ${parsed.schemaVersion}`, { duration: 4000 });
        return;
      }

      setImportPayload(parsed);
      setImportMode("merge");
      // Only pre-select categories that actually contain data in this file.
      setImportSelected({
        routines: parsed.routines.length > 0,
        workouts: parsed.workouts.length > 0,
        exerciseSettings: (parsed.exerciseSettings?.length ?? 0) > 0,
      });
    } catch (err) {
      console.error(err);
      toast.error("Could not read backup file", { duration: 4000 });
    }
  }

  function startImport() {
    if (!importPayload) return;
    const anySelected = Object.values(importSelected).some(Boolean);
    if (!anySelected) {
      toast.error("Select at least one category to import", { duration: 4000 });
      return;
    }
    if (importMode === "replace") {
      setReplaceConfirmOpen(true);
    } else {
      runImport();
    }
  }

  async function runImport() {
    if (!importPayload) return;
    const payload = importPayload;
    const selected = importSelected;
    const mode = importMode;

    try {
      const db = getDb();
      await db.transaction(
        "rw",
        db.routines,
        db.workouts,
        db.prHistory,
        db.exerciseSettings,
        async () => {
          if (mode === "replace") {
            if (selected.routines) await db.routines.clear();
            if (selected.workouts) await db.workouts.clear();
            if (selected.exerciseSettings) await db.exerciseSettings.clear();
          }

          // Old routine id (as it was in the backup) → new id assigned by
          // this import. Routines are always re-added with a fresh
          // auto-increment key (see remapRoutineId's doc comment for why
          // their old id can never be preserved), so any imported
          // workout's routineId has to be translated through this map
          // rather than carried over verbatim — otherwise it either points
          // at nothing, or worse, at an unrelated routine that now
          // happens to occupy that old number.
          const routineIdMap = new Map<number, number>();

          if (selected.routines) {
            // sortOrder is assigned by each routine's position within the
            // imported list rather than copied from the payload directly.
            // This isn't a compatibility concern — even a current-schema
            // backup's routines carry sortOrder values from a different
            // database, so in merge mode they'd collide with existing
            // routines' values if copied verbatim. Offsetting by the current
            // max makes imported routines append cleanly after existing ones.
            let nextSortOrder = 0;
            if (mode === "merge") {
              const last = await db.routines.orderBy("sortOrder").last();
              nextSortOrder = (last?.sortOrder ?? -1) + 1;
            }
            for (const r of payload.routines) {
              const { id: oldId, sortOrder: _sortOrder, ...rest } = r;
              const newId = await db.routines.add({
                ...rest,
                sortOrder: nextSortOrder,
              } as Routine);
              if (oldId !== undefined) routineIdMap.set(oldId, newId);
              nextSortOrder++;
            }
          }
          if (selected.workouts) {
            for (const w of payload.workouts) {
              const { id: _id, routineId, ...rest } = w;
              await db.workouts.add({
                ...rest,
                routineId: remapRoutineId(routineId, routineIdMap),
              } as Workout);
            }
          }
          if (selected.exerciseSettings) {
            // Unlike routines/workouts (auto-increment ids, stripped and
            // reassigned above so merge mode can't collide), exerciseSettings
            // is keyed by exerciseId itself — a stable, natural key shared
            // between databases. put() is correct for both modes: replace
            // mode already cleared the table above, and merge mode
            // overwriting an existing override with the imported one is the
            // sensible reading of "merge" for a settings table (as opposed
            // to appending a duplicate, which doesn't make sense for a
            // one-row-per-exercise table).
            for (const s of payload.exerciseSettings ?? []) {
              await db.exerciseSettings.put(s);
            }
          }

          // Personal Records are fully derived from workout history — an
          // imported backup's PR rows reference workoutIds from the old
          // database and can never line up with the fresh ids Dexie assigns
          // on import, so writing them directly would just recreate the
          // orphaned-PR bug this replaces. Rebuilding from whatever workouts
          // now exist is correct regardless of import mode or selection.
          await syncWorkoutIntegrity();
        },
      );

      const parts: string[] = [];
      if (selected.routines) parts.push(`${payload.routines.length} routines`);
      if (selected.workouts) parts.push(`${payload.workouts.length} workouts`);
      if (selected.exerciseSettings) {
        parts.push(`${payload.exerciseSettings?.length ?? 0} exercise rest times`);
      }
      toast.success(
        `${mode === "replace" ? "Replaced" : "Imported"} ${parts.join(", ")}. Personal Records recalculated.`,
        { duration: 4000 },
      );
    } catch (err) {
      console.error(err);
      toast.error(mode === "replace" ? "Replace import failed" : "Import failed", {
        duration: 4000,
      });
    } finally {
      setImportPayload(null);
      setReplaceConfirmOpen(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 px-4 pt-6 pb-8">
      <PageHeader eyebrow="Settings">
        <p className="text-lg font-semibold leading-snug">App management &amp; data ownership</p>
      </PageHeader>

      {/* Workout */}
      <section className="rounded-2xl border border-border/50 bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <MonitorSmartphone className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">Workout</h2>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm">Keep screen awake during workouts</p>
            <p className="text-xs text-muted-foreground">
              Applies by default whenever a workout starts. Can be overridden per workout.
            </p>
          </div>
          <Switch checked={keepAwakeEnabled} onCheckedChange={handleKeepAwakeChange} />
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/50 pt-4">
          <div className="min-w-0">
            <p className="text-sm">Haptic feedback</p>
            <p className="text-xs text-muted-foreground">
              Vibration on key actions — completing a set, finishing a workout, deleting.
            </p>
          </div>
          <Switch checked={hapticsEnabled} onCheckedChange={handleHapticsChange} />
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/50 pt-4">
          <div className="min-w-0">
            <p className="text-sm">Prompt to update routine</p>
            <p className="text-xs text-muted-foreground">
              After finishing a workout that changed a routine's exercises, ask whether to save
              those changes back to it.
            </p>
          </div>
          <Switch
            checked={routineUpdatePromptEnabled}
            onCheckedChange={handleRoutineUpdatePromptChange}
          />
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/50 pt-4">
          <div className="min-w-0">
            <p className="text-sm">Muscle map body type</p>
            <p className="text-xs text-muted-foreground">
              Which body is shown on the muscle map (Overview, workout summaries, and the live HUD).
              Purely visual — doesn't affect exercise data.
            </p>
          </div>
          <RadioGroup
            value={bodyType}
            onValueChange={handleBodyTypeChange}
            className="flex shrink-0 gap-3"
          >
            <label className="flex items-center gap-1.5 text-sm">
              <RadioGroupItem value="male" />
              Male
            </label>
            <label className="flex items-center gap-1.5 text-sm">
              <RadioGroupItem value="female" />
              Female
            </label>
          </RadioGroup>
        </div>

        <Link
          to="/settings/rest-times"
          className="mt-4 flex items-center justify-between gap-3 border-t border-border/50 pt-4 active:opacity-70"
        >
          <div className="min-w-0">
            <p className="text-sm">Exercise Rest Times</p>
            <p className="text-xs text-muted-foreground">
              Override the automatic rest duration for specific exercises
            </p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Link>
      </section>

      {/* Database Management */}
      <section className="rounded-2xl border border-border/50 bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Database className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">Database Management</h2>
        </div>
        <dl className="space-y-2 text-sm">
          <Row
            label="Estimated database size"
            value={
              !stats.storageEstimateSupported
                ? "Not available"
                : stats.estimatedBytes === null
                  ? "Calculating…"
                  : formatBytes(stats.estimatedBytes)
            }
          />
          <Row label="Workouts" value={String(stats.workoutCount ?? 0)} />
          <Row label="Routines" value={String(stats.routineCount ?? 0)} />
          <Row label="Personal Records" value={String(stats.prCount ?? 0)} />
          <Row label="Exercises" value={String(stats.exerciseCount)} />
          <Row label="Oldest Workout" value={formatDate(stats.oldestWorkout)} />
          <Row label="Latest Workout" value={formatDate(stats.latestWorkout)} />
        </dl>
        <Link
          to="/settings/database"
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-secondary/40 py-3 text-sm font-medium text-foreground/80 active:bg-secondary/70"
        >
          <Wrench className="h-4 w-4" />
          Manage Database
        </Link>
      </section>

      {/* Backup & Restore */}
      <section className="rounded-2xl border border-border/50 bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Download className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">Backup & Restore</h2>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          Export all your data to a JSON file, or restore from a previous backup.
        </p>

        <div className="flex flex-col gap-2">
          <button
            onClick={openExportDialog}
            className="flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-medium text-primary-foreground active:scale-[0.99]"
          >
            <Download className="h-4 w-4" />
            Export Backup
          </button>

          <button
            onClick={triggerFilePick}
            className="flex items-center justify-center gap-2 rounded-xl bg-secondary py-3 text-sm font-medium active:scale-[0.99]"
          >
            <Upload className="h-4 w-4" />
            Import Backup
          </button>

          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      </section>

      {/* App Info */}
      <section className="rounded-2xl border border-border/50 bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Info className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">App Information</h2>
        </div>
        <dl className="space-y-2 text-sm">
          <Row label="App version" value={APP_VERSION} />
          <Row label="Schema version" value={String(SCHEMA_VERSION)} />
        </dl>
      </section>

      {/* License */}
      <section className="rounded-2xl border border-border/50 bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">License</h2>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Untrained Effort is licensed under the{" "}
          <a
            href="https://www.gnu.org/licenses/gpl-3.0.html"
            target="_blank"
            rel="noreferrer"
            className="text-primary underline"
          >
            GNU General Public License v3.0
          </a>{" "}
          (GPL-3.0).
        </p>
      </section>

      {/* Export selection dialog */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>What do you want to export?</DialogTitle>
            <DialogDescription>Choose which data to include in the backup file.</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 py-2">
            {(["routines", "workouts", "prHistory", "exerciseSettings"] as Category[]).map((c) => (
              <label key={c} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={exportSelected[c]}
                    onCheckedChange={(v) => setExportSelected((s) => ({ ...s, [c]: v === true }))}
                  />
                  {categoryLabel(c)}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {exportCounts ? exportCounts[c] : "…"}
                </span>
              </label>
            ))}
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              className="text-muted-foreground"
              onClick={() => setExportOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={confirmExport}>Export</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import selection dialog */}
      <Dialog open={!!importPayload} onOpenChange={(open) => !open && setImportPayload(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>What do you want to import?</DialogTitle>
            <DialogDescription>
              {importPayload
                ? `Backup from ${new Date(importPayload.exportedAt).toLocaleDateString()}. Choose which data to bring in and how.`
                : ""}
            </DialogDescription>
          </DialogHeader>

          {importPayload && (
            <>
              <div className="flex flex-col gap-3 py-2">
                {(["routines", "workouts", "exerciseSettings"] as ImportCategory[]).map((c) => {
                  const count = importCategoryCount(importPayload, c);
                  return (
                    <label key={c} className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={importSelected[c]}
                          disabled={count === 0}
                          onCheckedChange={(v) =>
                            setImportSelected((s) => ({ ...s, [c]: v === true }))
                          }
                        />
                        {categoryLabel(c)}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {count} {count === 0 ? "(empty)" : ""}
                      </span>
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Personal Records are recalculated automatically from imported workout history.
              </p>

              <div className="flex gap-2 rounded-lg bg-secondary/50 p-1">
                <button
                  onClick={() => setImportMode("merge")}
                  className={`flex-1 rounded-md py-2 text-xs font-semibold transition-colors ${
                    importMode === "merge"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  Merge
                </button>
                <button
                  onClick={() => setImportMode("replace")}
                  className={`flex-1 rounded-md py-2 text-xs font-semibold transition-colors ${
                    importMode === "replace"
                      ? "bg-destructive text-destructive-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  Replace
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                {importMode === "merge"
                  ? "Adds the selected data alongside what you already have."
                  : "Deletes your existing data in the selected categories first, then imports. Categories left unchecked are not affected."}
              </p>
            </>
          )}

          <DialogFooter>
            <Button
              variant="ghost"
              className="text-muted-foreground"
              onClick={() => setImportPayload(null)}
            >
              Cancel
            </Button>
            <Button
              variant={importMode === "replace" ? "destructive" : "default"}
              onClick={startImport}
            >
              {importMode === "replace" ? "Replace" : "Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Replace confirmation */}
      <AlertDialog open={replaceConfirmOpen} onOpenChange={setReplaceConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace selected data?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes your current data in the selected categories and replaces it
              with the contents of the backup. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={runImport}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Replace
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-border/30 py-1 last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}
