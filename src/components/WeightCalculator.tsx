import { useState } from "react";
import { Calculator } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { getExercise, getExerciseLoggingSchema } from "@/lib/exercises";
import { getWeightUnit, formatWeight } from "@/lib/units";
import {
  getBarWeightKg,
  getAvailablePlatesKg,
  calculatePlateLoad,
  calculateWarmupSets,
} from "@/lib/plateCalculator";

interface WeightCalculatorProps {
  exerciseId: string;
  exerciseName: string;
  /** Canonical kg — same value ExerciseCard already computes for the
   *  expected-rep-range hint (the current/next set's target weight). */
  targetWeightKg: number;
  className?: string;
  /** See ExerciseFormViewer — lets callers stopPropagation when this
   *  trigger sits inside another clickable element. */
  onTriggerClick?: (e: React.MouseEvent) => void;
}

/**
 * Small "calculator" trigger that opens a dialog with two reference-only
 * sections for one exercise: a plate-per-side breakdown (barbell exercises
 * only) and a percentage warm-up ramp (any exercise that logs a weight).
 * Neither section logs anything or touches the workout in progress — both
 * are just computed suggestions, same spirit as the existing expected-rep-
 * range hint.
 *
 * Renders nothing for an exercise that doesn't log a weight at all
 * (cardio, intervals, time-based holds) — same graceful-degradation shape
 * as ExerciseFormViewer.
 *
 * Built on the existing Dialog component for the same reasons as
 * ExerciseFormViewer: tap-outside-to-dismiss, a close button, and Android
 * back-dismiss all already come from there.
 */
export function WeightCalculator({
  exerciseId,
  exerciseName,
  targetWeightKg,
  className,
  onTriggerClick,
}: WeightCalculatorProps) {
  const [open, setOpen] = useState(false);

  const def = getExercise(exerciseId);
  const schema = getExerciseLoggingSchema(def);
  if (schema.weight === "hidden") return null;

  const isBarbell = def?.equipment === "Barbell";
  const weightUnit = getWeightUnit();
  const barKg = getBarWeightKg();
  const plateResult = isBarbell
    ? calculatePlateLoad(targetWeightKg, barKg, getAvailablePlatesKg())
    : null;
  const warmupSets = calculateWarmupSets(targetWeightKg, isBarbell ? barKg : undefined);
  const showsAchievedNote =
    plateResult !== null && Math.abs(plateResult.achievedKg - targetWeightKg) > 0.01;

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          onTriggerClick?.(e);
          setOpen(true);
        }}
        aria-label={`${exerciseName} calculator`}
        className={
          className ??
          "relative flex h-11 w-8 shrink-0 items-center justify-center text-muted-foreground/70 after:absolute after:-inset-1 after:content-['']"
        }
      >
        <Calculator className="h-4 w-4" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogTitle className="text-base">{exerciseName}</DialogTitle>
          <div className="flex flex-col gap-4">
            {plateResult && (
              <div>
                <p className="text-xs font-semibold">Plates</p>
                <div className="mt-1 flex flex-col gap-0.5 text-sm">
                  <p>Bar: {formatWeight(barKg, weightUnit)}</p>
                  <p>
                    Per side:{" "}
                    {plateResult.perSideKg.length > 0
                      ? plateResult.perSideKg.map((p) => formatWeight(p, weightUnit)).join(" + ")
                      : "none"}
                  </p>
                  <p className="text-muted-foreground">
                    Total: {formatWeight(plateResult.achievedKg, weightUnit)}
                    {showsAchievedNote && <> (target {formatWeight(targetWeightKg, weightUnit)})</>}
                  </p>
                </div>
              </div>
            )}

            <div>
              <p className="text-xs font-semibold">Warm-up</p>
              {warmupSets.length > 0 ? (
                <ul className="mt-1 flex flex-col gap-1 text-sm">
                  {warmupSets.map((s, i) => (
                    <li key={i} className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">
                        {s.percent === 0 ? "Bar" : `${s.percent}%`}
                      </span>
                      <span className="tabular-nums">
                        {formatWeight(s.weightKg, weightUnit)} × {s.reps}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">
                  Set a target weight on this exercise to see a suggested warm-up.
                </p>
              )}
            </div>

            <p className="text-[10px] text-muted-foreground/70">
              Reference only — nothing here is logged as a set.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
