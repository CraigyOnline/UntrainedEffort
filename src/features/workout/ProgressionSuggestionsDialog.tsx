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
import { getExercise } from "@/lib/exercises";
import { formatWeight, getWeightUnit } from "@/lib/units";
import type { ProgressionSuggestion } from "@/lib/progressionSuggestions";

function describeProgressionSuggestion(suggestion: ProgressionSuggestion): {
  change: string;
  current: string;
  proposed: string;
  currentSecondary?: string;
  proposedSecondary?: string;
} {
  const unit = getWeightUnit();
  if (suggestion.kind === "add-weight") {
    return {
      change: `Cleared the top of the range at ${formatWeight(suggestion.currentWeight, unit)} for 2 sessions running.`,
      current: formatWeight(suggestion.currentWeight, unit),
      proposed: formatWeight(suggestion.proposedWeight, unit),
      currentSecondary: `${suggestion.currentReps} reps`,
      proposedSecondary: `${suggestion.proposedReps} reps`,
    };
  }
  if (suggestion.kind === "ease-off") {
    return {
      change: `${formatWeight(suggestion.currentWeight, unit)} has been a stretch for 2 sessions running — easing back a little should help you build it up more steadily.`,
      current: formatWeight(suggestion.currentWeight, unit),
      proposed: formatWeight(suggestion.proposedWeight, unit),
    };
  }
  return {
    change: `Cleared ${suggestion.currentReps}+ reps at ${formatWeight(suggestion.currentWeight, unit)} for 2 sessions running.`,
    current: `${suggestion.currentReps} reps`,
    proposed: `${suggestion.proposedReps} reps`,
  };
}

/**
 * The post-workout progression-suggestions dialog. Every qualifying
 * exercise gets its own row and its own checkbox — accepting one and
 * snoozing another in the same dialog is the whole point, so there's
 * deliberately no "accept all" shortcut.
 *
 * Unchecked is the default and the safe choice: closing the dialog any
 * other way (back button, tapping outside) is handled by the caller as
 * "Done with nothing checked" — see resolvePendingProgressionSuggestions
 * in _app.workout.tsx. Every suggestion shown updates its own
 * progressionState regardless of its checkbox, accepted or not, so a
 * snoozed one doesn't repeat next time asking about the same level
 * again (a ceiling breach is the one exception — see
 * evaluateExerciseProgression).
 */
export function ProgressionSuggestionsDialog({
  suggestions,
  onResolve,
}: {
  suggestions: ProgressionSuggestion[];
  onResolve: (decisions: Map<string, boolean>) => void;
}) {
  const [decisions, setDecisions] = useState<Map<string, boolean>>(
    () => new Map(suggestions.map((s) => [s.exerciseId, false])),
  );

  return (
    <AlertDialogContent className="flex max-h-[85vh] flex-col">
      <AlertDialogHeader>
        <AlertDialogTitle>
          {suggestions.length === 1
            ? "One thing to consider"
            : `${suggestions.length} things to consider`}
        </AlertDialogTitle>
        <AlertDialogDescription>
          Based on your last couple of sessions, a few changes are worth considering. Check the ones
          you want to update — anything left unchecked stays exactly as it is.
        </AlertDialogDescription>
      </AlertDialogHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto py-1">
        {suggestions.map((suggestion) => {
          const name = getExercise(suggestion.exerciseId)?.name ?? suggestion.exerciseId;
          const copy = describeProgressionSuggestion(suggestion);
          const accepted = decisions.get(suggestion.exerciseId) ?? false;
          return (
            <label
              key={suggestion.exerciseId}
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/50 p-3"
            >
              <Checkbox
                className="mt-0.5"
                checked={accepted}
                onCheckedChange={(checked) =>
                  setDecisions((prev) => new Map(prev).set(suggestion.exerciseId, checked === true))
                }
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-sm font-medium">{name}</p>
                  <div className="shrink-0 text-right">
                    <p className="text-xs whitespace-nowrap">
                      <span className="text-muted-foreground">{copy.current} → </span>
                      <span className="font-medium text-primary">{copy.proposed}</span>
                    </p>
                    {copy.currentSecondary && copy.proposedSecondary && (
                      <p className="text-[11px] whitespace-nowrap">
                        <span className="text-muted-foreground">{copy.currentSecondary} → </span>
                        <span className="font-medium text-primary">{copy.proposedSecondary}</span>
                      </p>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{copy.change}</p>
              </div>
            </label>
          );
        })}
      </div>

      <AlertDialogFooter>
        <AlertDialogAction onClick={() => onResolve(decisions)}>Done</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  );
}
