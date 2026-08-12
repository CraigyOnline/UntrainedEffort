import { useEffect, useRef, useState } from "react";
import { Check, MoreVertical } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
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
import { getKeepAwakeDefault, enableKeepAwake, disableKeepAwake } from "@/lib/keepAwake";
import { useDismissOnBack } from "@/lib/backHandler";
import { formatTime } from "@/lib/format";
import { totalRemainingSeconds } from "@/features/workout/circuitTimer";
import { WorkoutTimer } from "./WorkoutTimer";
import { sessionHasData, type ActiveSession } from "./workoutHelpers";

export const CIRCUIT_HUD_HEIGHT = 116;

export interface CircuitHUDProps {
  session: ActiveSession;
  setSession: React.Dispatch<React.SetStateAction<ActiveSession | null>>;
  onFinish: (save: boolean) => void | Promise<void>;
  onHeightChange?: (height: number) => void;
}

/**
 * The circuit-session counterpart to WorkoutHUD — name/timer/Finish, the
 * keep-awake option, and Finish's discard-vs-confirm gating, all lifted
 * near-verbatim since those apply identically to any session. Everything
 * WorkoutHUD carries on top of that (muscle map, sets/volume stats, live
 * PR celebration) is strength-specific and has no circuit equivalent, so
 * this is a genuinely smaller component rather than WorkoutHUD with
 * pieces hidden — see CircuitLiveSession's doc comment for why a circuit
 * session gets its own HUD instead of branching inside WorkoutHUD.
 * Adds a Laps/Time Left stat row in their place, using
 * totalRemainingSeconds from circuitTimer.ts.
 */
export function CircuitHUD({ session, setSession, onFinish, onHeightChange }: CircuitHUDProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = contentRef.current;
    if (!el || !onHeightChange) return;
    const report = () => onHeightChange(el.getBoundingClientRect().height);
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [onHeightChange]);

  const [keepAwake, setKeepAwake] = useState(() => getKeepAwakeDefault());
  const [optionsOpen, setOptionsOpen] = useState(false);
  useDismissOnBack(optionsOpen, () => setOptionsOpen(false));

  const [finishing, setFinishing] = useState(false);
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  const [finishConfirmOpen, setFinishConfirmOpen] = useState(false);

  function handleFinishClick() {
    if (finishing) return;
    if (!sessionHasData(session)) {
      onFinish(true);
      return;
    }
    setFinishConfirmOpen(true);
  }

  async function confirmFinish() {
    setFinishConfirmOpen(false);
    setFinishing(true);
    try {
      await onFinish(true);
    } finally {
      if (mountedRef.current) setFinishing(false);
    }
  }

  useEffect(() => {
    if (keepAwake) {
      enableKeepAwake();
    } else {
      disableKeepAwake();
    }
    return () => {
      disableKeepAwake();
    };
  }, [keepAwake]);

  // Re-renders every 250ms while the circuit timer itself does (via
  // CircuitTimer's own tick) so this stays in step — cheap since it's
  // just a re-read of totalRemainingSeconds against the same state.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (session.circuit?.state?.status.kind !== "running") return;
    const t = setInterval(() => setTick((x) => x + 1), 250);
    return () => clearInterval(t);
  }, [session.circuit?.state?.status.kind]);

  const circuit = session.circuit;
  const round = circuit ? Math.min(circuit.state?.round ?? 1, circuit.config.rounds) : 1;
  const timeLeft = circuit ? totalRemainingSeconds(circuit.state, circuit.config, Date.now()) : 0;
  void tick;

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-30 flex justify-center bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div
          ref={contentRef}
          className="relative flex w-full max-w-md min-w-0 flex-col gap-2 border-b border-border px-4 pt-3 pb-2"
        >
          <div className="flex items-center gap-2">
            <input
              value={session.name}
              onChange={(e) => setSession((s) => (s ? { ...s, name: e.target.value } : s))}
              className="min-w-0 flex-1 border-b border-border/30 bg-transparent text-lg font-bold outline-none transition-colors focus:border-border"
            />
            <WorkoutTimer startedAt={session.startedAt} />

            <div className="relative">
              <button
                onClick={() => setOptionsOpen((o) => !o)}
                aria-label="Workout options"
                className="flex h-11 w-11 items-center justify-center text-muted-foreground transition-colors active:text-foreground"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
              {optionsOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setOptionsOpen(false)} />
                  <div className="absolute right-0 top-11 z-50 w-64 rounded-xl border border-border bg-card p-3 shadow-xl">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm">Keep screen on</span>
                      <Switch checked={keepAwake} onCheckedChange={setKeepAwake} />
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex min-w-0 flex-1 items-center justify-between text-xs text-muted-foreground">
              <span>
                Round <span className="font-semibold text-foreground">{round}</span>/
                {circuit?.config.rounds ?? 1}
              </span>
              <span>
                Time left{" "}
                <span className="font-semibold text-foreground">{formatTime(timeLeft)}</span>
              </span>
            </div>

            <Button
              size="sm"
              onClick={handleFinishClick}
              disabled={finishing}
              className={`transition-colors duration-200 ${finishing ? "bg-primary/70" : ""}`}
            >
              {finishing ? <Check className="h-4 w-4" /> : "Finish"}
            </Button>
          </div>
        </div>
      </div>

      <AlertDialog open={finishConfirmOpen} onOpenChange={setFinishConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Finish workout?</AlertDialogTitle>
            <AlertDialogDescription>
              This will end your session and save your progress.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setFinishConfirmOpen(false)}>
              Keep going
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmFinish}>Finish</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
