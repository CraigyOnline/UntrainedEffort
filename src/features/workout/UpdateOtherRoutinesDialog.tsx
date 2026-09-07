import { useState } from "react";
import {
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  RECENT_ROUTINE_WINDOW_DAYS,
  describeProposedValue,
  type OtherRoutineOption,
} from "@/features/workout/workoutHelpers";
import type { ProgressionSuggestion } from "@/lib/progressionSuggestions";

/**
 * Shown after a progression suggestion is accepted (from either the
 * post-workout dialog or the Overview page) when the same exercise also
 * has a routine-defined target in other routines. Only ever raised when
 * `options` is non-empty — see findOtherRoutinesForExercise, which is
 * also what already excluded the routine the suggestion came from.
 *
 * Routines untouched for more than RECENT_ROUTINE_WINDOW_DAYS start
 * tucked behind "show excluded routines" so a routine that's fallen out
 * of rotation doesn't clutter the list — but stay reachable, since the
 * exercise is still technically there and someone might pick it back up.
 * Unchecked is the default and the safe choice for every row here, same
 * as the main suggestions dialog.
 */
export function UpdateOtherRoutinesDialog({
  exerciseName,
  suggestion,
  options,
  onResolve,
}: {
  exerciseName: string;
  suggestion: ProgressionSuggestion;
  options: OtherRoutineOption[];
  onResolve: (selectedRoutineIds: number[]) => void;
}) {
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [showExcluded, setShowExcluded] = useState(false);

  const recent = options.filter(
    (o) => o.daysSinceLastUsed != null && o.daysSinceLastUsed <= RECENT_ROUTINE_WINDOW_DAYS,
  );
  const excluded = options.filter(
    (o) => !(o.daysSinceLastUsed != null && o.daysSinceLastUsed <= RECENT_ROUTINE_WINDOW_DAYS),
  );

  function toggle(routineId: number | undefined) {
    if (routineId == null) return;
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(routineId)) next.delete(routineId);
      else next.add(routineId);
      return next;
    });
  }

  function renderRow(option: OtherRoutineOption) {
    const routineId = option.routine.id;
    if (routineId == null) return null;
    const isRecent =
      option.daysSinceLastUsed != null && option.daysSinceLastUsed <= RECENT_ROUTINE_WINDOW_DAYS;
    return (
      <label
        key={routineId}
        className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/50 p-3"
      >
        <Checkbox
          className="mt-0.5"
          checked={checked.has(routineId)}
          onCheckedChange={() => toggle(routineId)}
        />
        <div className="min-w-0">
          <p className="text-sm font-medium">{option.routine.name}</p>
          <p className="text-xs text-muted-foreground">
            {isRecent
              ? `Currently ${option.currentWeight}kg × ${option.currentReps} reps`
              : option.daysSinceLastUsed == null
                ? "Never used"
                : `Last used ${option.daysSinceLastUsed} days ago`}
          </p>
        </div>
      </label>
    );
  }

  return (
    <AlertDialogContent className="flex max-h-[85vh] flex-col">
      <AlertDialogHeader>
        <AlertDialogTitle>Update your other routines?</AlertDialogTitle>
        <AlertDialogDescription>
          This updates {exerciseName} to {describeProposedValue(suggestion)}. It's also in these
          routines — leave any unchecked to keep them as they are.
        </AlertDialogDescription>
      </AlertDialogHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto py-1">
        {recent.length > 0 && (
          <p className="ml-0.5 text-[11px] text-muted-foreground">Recently used routines</p>
        )}
        {recent.map(renderRow)}
        {showExcluded && excluded.map(renderRow)}
      </div>

      {excluded.length > 0 && (
        <button
          type="button"
          className="py-1.5 text-center text-xs font-medium text-primary"
          onClick={() => setShowExcluded((s) => !s)}
        >
          {showExcluded ? "Hide excluded routines" : `Show excluded routines (${excluded.length})`}
        </button>
      )}

      <AlertDialogFooter>
        <AlertDialogAction onClick={() => onResolve([...checked])}>
          Apply to {checked.size} routine{checked.size === 1 ? "" : "s"}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  );
}
