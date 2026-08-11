import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react";
import { type CircuitConfig, type CircuitStation } from "@/lib/db";
import { getExercise } from "@/lib/exercises";
import { ExercisePicker } from "@/components/forms/ExercisePicker";
import { MmSsInput } from "@/components/forms/MmSsInput";
import { NumberInput } from "@/components/forms/NumberInput";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { BOTTOM_NAV_HEIGHT } from "@/components/BottomTabs";
import { useDismissOnBack } from "@/lib/backHandler";

const DEFAULT_STATION_WORK_SECONDS = 30;
const DEFAULT_STATION_REST_SECONDS = 15;
const DEFAULT_ROUNDS = 3;
const DEFAULT_ROUND_REST_SECONDS = 60;

/**
 * The quick-workout counterpart to CircuitRoutineEditor: same station/
 * rounds/round-rest controls, but with no name field and no save-to-
 * routines step — "Start" hands the built CircuitConfig straight to the
 * caller for an ephemeral session (see startCircuitWorkout in
 * _app.workout.tsx), matching the "fire and forget" quick-workout circuit
 * behaviour decided on. Deliberately not sharing a component with
 * CircuitRoutineEditor: the two diverge on name field, discard-
 * confirmation (nothing here is saved yet, so there's nothing to lose by
 * closing), and what the primary button does, and the shared bulk — the
 * station list markup and timing inputs — is small enough that factoring
 * it out would cost more indirection than it'd save.
 */
export function QuickCircuitSetup({
  onClose,
  onStart,
}: {
  onClose: () => void;
  onStart: (config: CircuitConfig) => void;
}) {
  const [stations, setStations] = useState<CircuitStation[]>([]);
  const [rounds, setRounds] = useState(DEFAULT_ROUNDS);
  const [roundRestSeconds, setRoundRestSeconds] = useState(DEFAULT_ROUND_REST_SECONDS);
  const [roundRestEnabled, setRoundRestEnabled] = useState(true);
  const [picking, setPicking] = useState(false);

  useDismissOnBack(true, onClose);

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

  function start() {
    if (stations.length === 0) return;
    onStart({ stations, rounds, roundRestSeconds, roundRestEnabled });
  }

  return (
    <div
      className="fixed inset-x-0 top-0 z-50 flex justify-center bg-background pt-[env(safe-area-inset-top)]"
      style={{ bottom: `${BOTTOM_NAV_HEIGHT}px` }}
    >
      <div className="flex h-full w-full max-w-md flex-col">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <button onClick={onClose} className="p-2">
            <X className="h-5 w-5" />
          </button>
          <h2 className="text-base font-semibold">Quick Circuit</h2>
          <button
            onClick={start}
            disabled={stations.length === 0}
            className="rounded-full px-4 py-1.5 text-sm font-semibold bg-primary text-primary-foreground disabled:opacity-40 active:opacity-80"
          >
            Start
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4 pb-6">
          <div className="flex items-center justify-between gap-2 rounded-xl bg-card px-4 py-3">
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
    </div>
  );
}
