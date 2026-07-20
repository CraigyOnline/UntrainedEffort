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
import { Download, Upload, Info, FileText, Settings as SettingsIcon, Database, Wrench, MonitorSmartphone } from "lucide-react";
import { getKeepAwakeDefault, setKeepAwakeDefault } from "@/lib/keepAwake";
import { useDatabaseStats } from "@/hooks/useDatabaseStats";
import { exportBackup, isBackupPayload, SCHEMA_VERSION, type BackupPayload } from "@/lib/backup";
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

type Category = "routines" | "workouts" | "prHistory";

function categoryLabel(c: Category): string {
  if (c === "routines") return "Routines";
  if (c === "workouts") return "Workout History";
  return "PR Records";
}

function SettingsPage() {
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Export dialog state ─────────────────────────────────────────────
  const [exportOpen, setExportOpen] = useState(false);
  const [exportSelected, setExportSelected] = useState<Record<Category, boolean>>({
    routines: true,
    workouts: true,
    prHistory: true,
  });
  const [exportCounts, setExportCounts] = useState<Record<Category, number> | null>(null);

  // ── Import dialog state ─────────────────────────────────────────────
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [importPayload, setImportPayload] = useState<BackupPayload | null>(null);
  const [importSelected, setImportSelected] = useState<Record<Category, boolean>>({
    routines: true,
    workouts: true,
    prHistory: true,
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

  // ── Export flow ──────────────────────────────────────────────────────

  async function openExportDialog() {
    const db = getDb();
    const [routines, workouts, prHistory] = await Promise.all([
      db.routines.count(),
      db.workouts.count(),
      db.prHistory.count(),
    ]);
    setExportCounts({ routines, workouts, prHistory });
    setExportSelected({ routines: true, workouts: true, prHistory: true });
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
        prHistory: parsed.prHistory.length > 0,
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
      await db.transaction("rw", db.routines, db.workouts, db.prHistory, async () => {
        if (mode === "replace") {
          if (selected.routines) await db.routines.clear();
          if (selected.workouts) await db.workouts.clear();
        }

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
            const { id: _id, sortOrder: _sortOrder, ...rest } = r;
            await db.routines.add({ ...rest, sortOrder: nextSortOrder } as Routine);
            nextSortOrder++;
          }
        }
        if (selected.workouts) {
          for (const w of payload.workouts) {
            const { id: _id, ...rest } = w;
            await db.workouts.add(rest as Workout);
          }
        }

        // Personal Records are fully derived from workout history — an
        // imported backup's PR rows reference workoutIds from the old
        // database and can never line up with the fresh ids Dexie assigns
        // on import, so writing them directly would just recreate the
        // orphaned-PR bug this replaces. Rebuilding from whatever workouts
        // now exist is correct regardless of import mode or selection.
        await syncWorkoutIntegrity();
      });

      const parts: string[] = [];
      if (selected.routines) parts.push(`${payload.routines.length} routines`);
      if (selected.workouts) parts.push(`${payload.workouts.length} workouts`);
      toast.success(
        `${mode === "replace" ? "Replaced" : "Imported"} ${parts.join(", ")}. Personal Records recalculated.`,
        { duration: 4000 }
      );
    } catch (err) {
      console.error(err);
      toast.error(mode === "replace" ? "Replace import failed" : "Import failed", { duration: 4000 });
    } finally {
      setImportPayload(null);
      setReplaceConfirmOpen(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 px-4 pt-6 pb-8">
      <header className="flex items-center gap-4">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
          <SettingsIcon className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold tracking-tight">Settings</h1>
          <p className="text-xs text-muted-foreground">App management & data ownership</p>
        </div>
      </header>

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

      {/* Licenses */}
      <section className="rounded-2xl border border-border/50 bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">Open Source Licenses</h2>
        </div>
        <div className="space-y-3 text-xs leading-relaxed text-muted-foreground">
          <p>
            Portions of this application use assets, logos, or icons from{" "}
            <a
              href="https://github.com/wger-project/wger"
              target="_blank"
              rel="noreferrer"
              className="text-primary underline"
            >
              wger
            </a>
            .
          </p>
          <p>
            <span className="font-medium text-foreground">Software / Branding Assets:</span>{" "}
            Licensed under the GNU Affero General Public License v3.0 or later (AGPL-3.0+).
          </p>
          <p>
            <span className="font-medium text-foreground">Exercise Data and Media:</span>{" "}
            Licensed under Creative Commons Attribution-ShareAlike (CC-BY-SA).
          </p>
          <p>Copyright © wger Team and contributors.</p>
          <p>
            A copy of the AGPL-3.0 License is available at{" "}
            <a
              href="https://www.gnu.org/licenses/agpl-3.0.html"
              target="_blank"
              rel="noreferrer"
              className="break-all text-primary underline"
            >
              https://www.gnu.org/licenses/agpl-3.0.html
            </a>
            .
          </p>
        </div>
      </section>

      {/* Export selection dialog */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>What do you want to export?</DialogTitle>
            <DialogDescription>
              Choose which data to include in the backup file.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 py-2">
            {(["routines", "workouts", "prHistory"] as Category[]).map((c) => (
              <label key={c} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={exportSelected[c]}
                    onCheckedChange={(v) =>
                      setExportSelected((s) => ({ ...s, [c]: v === true }))
                    }
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
      <Dialog
        open={!!importPayload}
        onOpenChange={(open) => !open && setImportPayload(null)}
      >
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
                {(["routines", "workouts", "prHistory"] as Category[]).map((c) => {
                  const count =
                    c === "routines"
                      ? importPayload.routines.length
                      : c === "workouts"
                        ? importPayload.workouts.length
                        : importPayload.prHistory.length;
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
              This permanently deletes your current data in the selected categories
              and replaces it with the contents of the backup. This cannot be undone.
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
