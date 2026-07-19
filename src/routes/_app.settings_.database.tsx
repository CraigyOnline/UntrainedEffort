import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, CalendarClock, Database } from "lucide-react";
import { getDb } from "@/lib/db";
import { useDatabaseStats } from "@/hooks/useDatabaseStats";
import { exportBackup } from "@/lib/backup";
import { syncWorkoutIntegrity } from "@/lib/workoutIntegrity";
import { formatDate, formatBytes } from "@/lib/format";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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

export const Route = createFileRoute("/_app/settings/database")({
  head: () => ({
    meta: [{ title: "Database Maintenance · Untrained Effort" }],
  }),
  component: DatabaseMaintenancePage,
});

type RetentionOption = "keep" | "1y" | "2y" | "5y" | "custom";

interface PendingDeletion {
  cutoff: number;
  count: number;
  allWorkouts: boolean;
}

/** Null means "no deletion" (keep everything, or custom with no date chosen yet). */
function cutoffForOption(option: RetentionOption, customDate: string): number | null {
  if (option === "keep") return null;
  if (option === "custom") {
    if (!customDate) return null;
    const t = new Date(customDate).getTime();
    return Number.isNaN(t) ? null : t;
  }
  const years = option === "1y" ? 1 : option === "2y" ? 2 : 5;
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.getTime();
}

function DatabaseMaintenancePage() {
  const navigate = useNavigate();
  const stats = useDatabaseStats();

  const [option, setOption] = useState<RetentionOption>("keep");
  const [customDate, setCustomDate] = useState("");
  const [pending, setPending] = useState<PendingDeletion | null>(null);
  const [backupBeforeDelete, setBackupBeforeDelete] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  async function reviewCutoff(cutoff: number) {
    const db = getDb();
    const [count, total] = await Promise.all([
      db.workouts.where("startedAt").below(cutoff).count(),
      db.workouts.count(),
    ]);
    if (count === 0) {
      toast.info("No workouts are older than this date", { duration: 4000 });
      return;
    }
    setPending({ cutoff, count, allWorkouts: count === total });
  }

  function handleOptionChange(value: string) {
    const opt = value as RetentionOption;
    setOption(opt);
    // "keep" needs no action, and "custom" needs a date before it can be
    // reviewed — only the fixed-year options can compute+confirm immediately.
    if (opt === "keep" || opt === "custom") return;
    const cutoff = cutoffForOption(opt, customDate);
    if (cutoff != null) reviewCutoff(cutoff);
  }

  async function handleConfirmDelete() {
    if (!pending) return;
    const { cutoff, count, allWorkouts } = pending;
    setIsProcessing(true);
    try {
      if (backupBeforeDelete) {
        const backedUp = await exportBackup();
        if (!backedUp) {
          toast.error("Backup was not completed — no workouts were deleted", { duration: 5000 });
          return;
        }
      }

      const db = getDb();
      await db.transaction("rw", db.workouts, db.prHistory, async () => {
        const ids = await db.workouts.where("startedAt").below(cutoff).primaryKeys();
        await db.workouts.bulkDelete(ids);
        await syncWorkoutIntegrity();
      });

      toast.success(
        allWorkouts
          ? `Deleted all workout history (${count} workout${count === 1 ? "" : "s"})`
          : `Deleted ${count} workout${count === 1 ? "" : "s"} recorded before ${formatDate(cutoff)}`,
        { duration: 5000 },
      );
      setOption("keep");
      setCustomDate("");
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete workout history", { duration: 5000 });
    } finally {
      setIsProcessing(false);
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-6 px-4 pt-6 pb-8">
      <header className="flex items-center gap-3">
        <button onClick={() => navigate({ to: "/settings" })} className="p-1">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold">Database Maintenance</h1>
          <p className="text-xs text-muted-foreground">Manage stored workout data</p>
        </div>
      </header>

      {/* Database Statistics */}
      <section className="rounded-2xl border border-border/50 bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Database className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">Database Statistics</h2>
        </div>
        <dl className="space-y-2 text-sm">
          <Row
            label="Database size"
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
      </section>

      {/* Data Retention */}
      <section className="rounded-2xl border border-border/50 bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">Data Retention</h2>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          Permanently delete workout history older than a chosen age. Your routines and
          exercise library are never affected by this.
        </p>

        <RadioGroup value={option} onValueChange={handleOptionChange} className="gap-3">
          <label className="flex items-center gap-2 text-sm">
            <RadioGroupItem value="keep" />
            Keep everything (default)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <RadioGroupItem value="1y" />
            Delete workouts older than 1 year
          </label>
          <label className="flex items-center gap-2 text-sm">
            <RadioGroupItem value="2y" />
            Delete workouts older than 2 years
          </label>
          <label className="flex items-center gap-2 text-sm">
            <RadioGroupItem value="5y" />
            Delete workouts older than 5 years
          </label>
          <label className="flex items-center gap-2 text-sm">
            <RadioGroupItem value="custom" />
            Custom cutoff date
          </label>
        </RadioGroup>

        {option === "custom" && (
          <div className="mt-3 flex items-center gap-2 pl-6">
            <input
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              className="rounded-lg border border-border bg-secondary px-3 py-2 text-sm"
            />
            <button
              disabled={!customDate}
              onClick={() => {
                const cutoff = cutoffForOption("custom", customDate);
                if (cutoff != null) reviewCutoff(cutoff);
              }}
              className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40"
            >
              Review
            </button>
          </div>
        )}
      </section>

      {/* Future phase: a "Maintenance" section (Rebuild Personal Records,
          Delete orphaned Personal Records) goes here, as its own section
          following the same layout as the two above. Not implemented yet. */}

      {/* Delete confirmation */}
      <AlertDialog open={!!pending} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete old workout history?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-left">
                <p>
                  {pending?.allWorkouts ? (
                    <>This will permanently delete <strong className="text-foreground">all of your workout history</strong>.</>
                  ) : (
                    <>
                      This will permanently delete{" "}
                      <strong className="text-foreground">
                        {pending?.count} workout{pending && pending.count === 1 ? "" : "s"}
                      </strong>{" "}
                      recorded before{" "}
                      <strong className="text-foreground">
                        {pending ? formatDate(pending.cutoff) : ""}
                      </strong>
                      .
                    </>
                  )}
                </p>
                <p>Your routines and exercise library will not be affected.</p>
                <p>
                  Personal Records will be automatically recalculated from your remaining
                  workout history, so they stay accurate.
                </p>
                <p className="font-medium text-foreground">This action cannot be undone.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <label className="flex items-center gap-2 py-2 text-sm">
            <Checkbox
              checked={backupBeforeDelete}
              onCheckedChange={(v) => setBackupBeforeDelete(v === true)}
            />
            Create a backup before deleting
          </label>

          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setOption("keep")}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isProcessing}
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
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
