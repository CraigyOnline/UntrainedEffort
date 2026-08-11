import { useCallback, useEffect, useMemo, useState } from "react";
import { useBlocker } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react";
import { getDb, type CircuitStation, type Routine } from "@/lib/db";
import { getExercise } from "@/lib/exercises";
import { ExercisePicker } from "@/components/forms/ExercisePicker";
import { MmSsInput } from "@/components/forms/MmSsInput";
import { NumberInput } from "@/components/forms/NumberInput";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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
import { BOTTOM_NAV_HEIGHT } from "@/components/BottomTabs";
import { useDismissOnBack } from "@/lib/backHandler";

// Defaults for a newly added station — a common HIIT work/rest split, not
// meant to be authoritative. Every station's timing is independently
// editable immediately after adding it.
const DEFAULT_STATION_WORK_SECONDS = 30;
const DEFAULT_STATION_REST_SECONDS = 15;

const DEFAULT_ROUNDS = 3;
const DEFAULT_ROUND_REST_SECONDS = 60;

/**
 * Editor for a circuit/HIIT routine — an ordered list of exercise
 * "stations", each with its own work/rest duration, repeated for a
 * number of rounds with an optional rest between rounds. Mirrors
 * RoutineEditor's shell (header, name field, discard-confirmation flow)
 * but replaces the sets/reps/weight editor with station timing, since a
 * circuit routine's `exercises` field is unused (see Routine.circuit in
 * db.ts).
 */
export function CircuitRoutineEditor({
  initial,
  onClose,
}: {
  initial: Routine | null;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [stations, setStations] = useState<CircuitStation[]>(initial?.circuit?.stations ?? []);
  const [rounds, setRounds] = useState(initial?.circuit?.rounds ?? DEFAULT_ROUNDS);
  const [roundRestSeconds, setRoundRestSeconds] = useState(
    initial?.circuit?.roundRestSeconds ?? DEFAULT_ROUND_REST_SECONDS,
  );
  const [roundRestEnabled, setRoundRestEnabled] = useState(
    initial?.circuit?.roundRestEnabled ?? true,
  );
  const [picking, setPicking] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const hasChanges = useMemo(() => {
    if (!initial) return name.trim() !== "" || stations.length > 0;
    const init = initial.circuit;
    if (name !== initial.name) return true;
    if (rounds !== (init?.rounds ?? DEFAULT_ROUNDS)) return true;
    if (roundRestSeconds !== (init?.roundRestSeconds ?? DEFAULT_ROUND_REST_SECONDS)) return true;
    if (roundRestEnabled !== (init?.roundRestEnabled ?? true)) return true;
    if (stations.length !== (init?.stations.length ?? 0)) return true;
    return stations.some((s, i) => {
      const is = init?.stations[i];
      return (
        !is ||
        s.exerciseId !== is.exerciseId ||
        s.workSeconds !== is.workSeconds ||
        s.restSeconds !== is.restSeconds
      );
    });
  }, [name, stations, rounds, roundRestSeconds, roundRestEnabled, initial]);

  const blocker = useBlocker({ shouldBlockFn: () => hasChanges, withResolver: true });

  useEffect(() => {
    if (blocker.status === "blocked") setConfirmOpen(true);
  }, [blocker.status]);

  const handleClose = useCallback(() => {
    if (hasChanges) setConfirmOpen(true);
    else onClose();
  }, [hasChanges, onClose]);

  // Same reasoning as RoutineEditor: this is a full-screen overlay within
  // the /workout route, not a separate route, so Android back needs to
  // close the editor rather than fall through to route history.
  useDismissOnBack(true, handleClose);

  const handleDiscard = useCallback(() => {
    setConfirmOpen(false);
    if (blocker.status === "blocked") blocker.proceed();
    else onClose();
  }, [blocker, onClose]);

  const handleCancel = useCallback(() => {
    setConfirmOpen(false);
    if (blocker.status === "blocked") blocker.reset();
  }, [blocker]);

  function moveUp(i: number) {
    if (i === 0) return;
    setStations((xs) => {
      const n = [...xs];
      [n[i - 1], n[i]] = [n[i], n[i - 1]];
      return n;
    });
  }

  function moveDown(i: number) {
    setStations((xs) => {
      if (i >= xs.length - 1) return xs;
      const n = [...xs];
      [n[i + 1], n[i]] = [n[i], n[i + 1]];
      return n;
    });
  }

  function updateStation(i: number, patch: Partial<CircuitStation>) {
    setStations((xs) => xs.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  async function save() {
    const trimmed = name.trim();
    if (!trimmed || stations.length === 0) return;
    const circuit = { stations, rounds, roundRestSeconds, roundRestEnabled };
    const db = getDb();
    if (initial?.id) {
      await db.routines.update(initial.id, { name: trimmed, type: "circuit", circuit });
    } else {
      // New routines go at the end of the manual order.
      const last = await db.routines.orderBy("sortOrder").last();
      const sortOrder = (last?.sortOrder ?? -1) + 1;
      await db.routines.add({
        name: trimmed,
        type: "circuit",
        exercises: [],
        circuit,
        createdAt: Date.now(),
        sortOrder,
      });
    }
    onClose();
  }

  return (
    <div
      className="fixed inset-x-0 top-0 z-50 flex justify-center bg-background pt-[env(safe-area-inset-top)]"
      style={{ bottom: `${BOTTOM_NAV_HEIGHT}px` }}
    >
      <div className="flex h-full w-full max-w-md flex-col">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <button onClick={handleClose} className="p-2">
            <X className="h-5 w-5" />
          </button>
          <h2 className="text-base font-semibold">{initial ? "Edit circuit" : "New circuit"}</h2>
          <button
            onClick={save}
            disabled={!name.trim() || stations.length === 0}
            className="rounded-full px-4 py-1.5 text-sm font-semibold bg-primary text-primary-foreground disabled:opacity-40 active:opacity-80"
          >
            Save
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4 pb-6">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Circuit name"
            className="w-full rounded-xl bg-card px-4 py-3 text-lg font-semibold outline-none focus:ring-2 focus:ring-ring"
          />

          <div className="mt-4 flex items-center justify-between gap-2 rounded-xl bg-card px-4 py-3">
            <label className="flex flex-col items-center gap-1">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Rounds
              </span>
              <NumberInput
                value={rounds}
                onCommit={setRounds}
                min={1}
                className="w-12 text-center"
              />
            </label>
            <label className="flex flex-col items-center gap-1">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Rest between rounds
              </span>
              <MmSsInput
                seconds={roundRestSeconds}
                onCommit={setRoundRestSeconds}
                className={!roundRestEnabled ? "opacity-40" : undefined}
              />
            </label>
            <div className="flex flex-col items-center gap-1">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Enabled
              </span>
              <Switch checked={roundRestEnabled} onCheckedChange={setRoundRestEnabled} />
            </div>
          </div>

          <p className="mt-4 text-xs text-muted-foreground">Add stations to build your circuit</p>

          <ul className="mt-3 flex flex-col gap-2">
            {stations.map((s, i) => {
              const def = getExercise(s.exerciseId);
              return (
                <li
                  key={i}
                  className="flex items-center justify-between rounded-xl bg-card px-4 py-3 gap-5"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{def?.name ?? s.exerciseId}</p>
                    <p className="text-xs text-muted-foreground">{def?.muscle}</p>

                    <div className="mt-3 flex items-center gap-4">
                      <label className="flex flex-col items-center gap-1">
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Work
                        </span>
                        <MmSsInput
                          seconds={s.workSeconds}
                          onCommit={(v) => updateStation(i, { workSeconds: v })}
                        />
                      </label>
                      <label className="flex flex-col items-center gap-1">
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Rest
                        </span>
                        <MmSsInput
                          seconds={s.restSeconds}
                          onCommit={(v) => updateStation(i, { restSeconds: v })}
                        />
                      </label>
                    </div>
                  </div>

                  <div className="flex flex-col items-center gap-2">
                    <button
                      onClick={() => moveUp(i)}
                      disabled={i === 0}
                      className="rounded p-1 text-muted-foreground disabled:opacity-30"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => moveDown(i)}
                      disabled={i === stations.length - 1}
                      className="rounded p-1 text-muted-foreground disabled:opacity-30"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setStations((xs) => xs.filter((_, j) => j !== i))}
                      className="rounded p-1 text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          <Button className="mt-4 w-full" onClick={() => setPicking(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add station
          </Button>
        </div>
      </div>

      {picking && (
        <ExercisePicker
          onClose={() => setPicking(false)}
          onPick={(id) => {
            setStations((xs) => [
              ...xs,
              {
                exerciseId: id,
                workSeconds: DEFAULT_STATION_WORK_SECONDS,
                restSeconds: DEFAULT_STATION_REST_SECONDS,
              },
            ]);
            setPicking(false);
          }}
          addedIds={new Set(stations.map((s) => s.exerciseId))}
        />
      )}

      <AlertDialog open={confirmOpen} onOpenChange={(open) => !open && handleCancel()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your changes to this circuit haven't been saved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancel}>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={handleDiscard}>Discard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
