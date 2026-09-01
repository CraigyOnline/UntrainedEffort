import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import { getKeepAwakeDefault, setKeepAwakeDefault } from "@/lib/keepAwake";
import { getHapticsEnabled, setHapticsEnabled } from "@/lib/haptics";
import {
  getRoutineUpdatePromptEnabled,
  setRoutineUpdatePromptEnabled,
} from "@/lib/routineUpdatePrompt";
import { getBodyType, setBodyType, type BodyType } from "@/lib/bodyType";
import {
  getProgressionSuggestionsEnabled,
  setProgressionSuggestionsEnabled,
} from "@/lib/progressionSuggestions";
import { setOnboardingComplete } from "@/lib/onboarding";

export const Route = createFileRoute("/onboarding")({
  component: OnboardingScreen,
});

/**
 * The one-time first-run setup screen — shown instead of Overview only
 * when resolveLaunchDestination() (@/lib/onboarding) decides this is a
 * genuinely fresh install; see index.tsx for where that decision is made.
 *
 * One scrollable screen rather than a multi-step wizard: there are only
 * a handful of preferences worth surfacing up front, so a step-per-question
 * carousel would be more ceremony than the decision warrants.
 *
 * Every control here reads and writes through the exact same get/set
 * module Settings itself uses (keepAwake.ts, haptics.ts,
 * routineUpdatePrompt.ts, bodyType.ts, progressionSuggestions.ts), with
 * the same defaults — so
 * skipping this screen entirely leaves someone in exactly the state
 * they'd have been in before this screen existed. Nothing here is a
 * one-way door: every one of these has the identical control sitting in
 * Settings → Workout, changeable any time. "Get started" and "Skip for
 * now" are therefore functionally identical (both just leave whatever's
 * currently set and move on) — Skip exists purely so declining to engage
 * with any of this feels like a normal, fine thing to do, not a dead end.
 *
 * Renders outside the `_app` shell (no `_app.` prefix, same reasoning as
 * index.tsx) — no bottom tab bar for a screen that isn't a tab. Notably,
 * this also means there's no <Toaster/> mounted here (it lives inside
 * `_app`'s layout) — nothing on this screen should ever need one.
 */
function OnboardingScreen() {
  const navigate = useNavigate();

  const [keepAwakeEnabled, setKeepAwakeEnabledState] = useState(getKeepAwakeDefault);
  const [hapticsEnabled, setHapticsEnabledState] = useState(getHapticsEnabled);
  const [routineUpdatePromptEnabled, setRoutineUpdatePromptEnabledState] = useState(
    getRoutineUpdatePromptEnabled,
  );
  const [bodyType, setBodyTypeState] = useState<BodyType>(getBodyType);
  const [progressionSuggestionsEnabled, setProgressionSuggestionsEnabledState] = useState(
    getProgressionSuggestionsEnabled,
  );

  function finish() {
    setOnboardingComplete();
    navigate({ to: "/overview", replace: true });
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background px-6 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <div className="flex flex-1 flex-col justify-center gap-8 py-10">
        <div className="flex flex-col gap-1 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Quick setup</h1>
          <p className="text-sm text-muted-foreground">
            A few preferences before you get started — all changeable later in Settings.
          </p>
        </div>

        <div className="rounded-2xl border border-border/50 bg-card p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm">Keep screen awake during workouts</p>
              <p className="text-xs text-muted-foreground">
                Applies by default whenever a workout starts.
              </p>
            </div>
            <Switch
              checked={keepAwakeEnabled}
              onCheckedChange={(checked) => {
                setKeepAwakeEnabledState(checked);
                setKeepAwakeDefault(checked);
              }}
            />
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/50 pt-4">
            <div className="min-w-0">
              <p className="text-sm">Haptic feedback</p>
              <p className="text-xs text-muted-foreground">
                Vibration on key actions — completing a set, finishing a workout.
              </p>
            </div>
            <Switch
              checked={hapticsEnabled}
              onCheckedChange={(checked) => {
                setHapticsEnabledState(checked);
                setHapticsEnabled(checked);
              }}
            />
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/50 pt-4">
            <div className="min-w-0">
              <p className="text-sm">Prompt to update routine</p>
              <p className="text-xs text-muted-foreground">
                After a workout that changed a routine's exercises, ask before saving that back to
                it.
              </p>
            </div>
            <Switch
              checked={routineUpdatePromptEnabled}
              onCheckedChange={(checked) => {
                setRoutineUpdatePromptEnabledState(checked);
                setRoutineUpdatePromptEnabled(checked);
              }}
            />
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/50 pt-4">
            <div className="min-w-0">
              <p className="text-sm">Muscle map body type</p>
              <p className="text-xs text-muted-foreground">
                Purely visual — doesn't affect exercise data.
              </p>
            </div>
            <RadioGroup
              value={bodyType}
              onValueChange={(value) => {
                const next = value as BodyType;
                setBodyTypeState(next);
                setBodyType(next);
              }}
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

          <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/50 pt-4">
            <div className="min-w-0">
              <p className="text-sm">Progression suggestions</p>
              <p className="text-xs text-muted-foreground">
                Occasionally suggest a rep or a bit of weight — or easing off — based on how recent
                sessions went.
              </p>
            </div>
            <Switch
              checked={progressionSuggestionsEnabled}
              onCheckedChange={(checked) => {
                setProgressionSuggestionsEnabledState(checked);
                setProgressionSuggestionsEnabled(checked);
              }}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 pb-6">
        <Button onClick={finish} size="lg">
          Get started
        </Button>
        <button
          onClick={finish}
          className="text-sm font-medium text-muted-foreground active:opacity-70"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
