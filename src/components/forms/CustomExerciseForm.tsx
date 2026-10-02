import { useState } from "react";
import { toast } from "sonner";
import {
  createCustomExercise,
  updateCustomExercise,
  trackingTypeOf,
  type CustomExerciseDef,
  type CustomExerciseTrackingType,
} from "@/lib/customExercises";
import type { Equipment, MuscleGroup } from "@/lib/exercises";
import { muscleGroupToRegions, formatMuscleGroup } from "@/lib/muscles";
import { Button } from "@/components/ui/button";

const TRACKING_TYPES: { id: CustomExerciseTrackingType; label: string; hint: string }[] = [
  {
    id: "weighted",
    label: "Weighted",
    hint: "Barbell, dumbbell, machine, etc. — logs weight & reps",
  },
  {
    id: "bodyweight",
    label: "Bodyweight",
    hint: "Push-ups, pull-ups, etc. — logs reps, weight optional",
  },
  {
    id: "timed",
    label: "Timed Hold",
    hint: "Planks, holds — logs duration instead of reps",
  },
  {
    id: "cardio",
    label: "Cardio",
    hint: "Logs duration only — distance tracking isn't supported for custom exercises yet",
  },
];

const EQUIPMENT_OPTIONS: Equipment[] = [
  "Barbell",
  "Dumbbell",
  "Machine",
  "Cable",
  "Kettlebell",
  "Band",
  "Other",
];

// Every MuscleGroup except Cardio (which is auto-applied for the Cardio
// tracking type above, matching every built-in cardio exercise) — sourced
// from muscleGroupToRegions rather than a hand-written list so this can
// never drift from the canonical muscle set.
const MUSCLE_OPTIONS = Object.keys(muscleGroupToRegions) as Exclude<MuscleGroup, "Cardio">[];

/**
 * The fields for creating OR editing a custom exercise — Name, Type, and
 * whichever of Equipment/Primary Muscle the chosen type needs. Deliberately
 * just the fields, no header or page chrome, so it can be dropped into a
 * full page (_app.exercises_.new.tsx, _app.exercise.$id_.edit.tsx) or
 * opened inline over ExercisePicker without either caller fighting the
 * other's navigation/layout.
 *
 * Passing `existing` switches this into edit mode: fields prefill from it,
 * Type is shown but locked (see the note rendered with it — changing an
 * exercise's fundamental shape after it may already have sets logged
 * against the old one is exactly what updateCustomExercise's doc comment
 * explains not to allow), and saving calls updateCustomExercise instead of
 * createCustomExercise.
 *
 * What "success" means is the caller's call, not this form's: creating
 * from the Exercise Library and creating mid-routine-build both persist
 * the exercise the same way, but one wants a toast + navigate, the other
 * wants the new exercise added straight to whatever's being built with no
 * toast at all (consistent with picking an existing exercise, which
 * doesn't toast either). Failures are the one thing every context wants
 * the same response to, so those toast from in here.
 */
export function CustomExerciseForm({
  existing,
  initialName = "",
  showEntryPointHint = false,
  onSaved,
}: {
  /** Present → edit this exercise. Absent → create a new one. */
  existing?: CustomExerciseDef;
  /** Only meaningful when creating — ignored if `existing` is set. */
  initialName?: string;
  /** Shown as a small note below the submit button — for the copy opened
   *  from ExercisePicker, pointing back at the Exercise Library's own
   *  entry point, since that one's a few taps deeper than this shortcut.
   *  Not meaningful in edit mode. */
  showEntryPointHint?: boolean;
  onSaved: (def: CustomExerciseDef) => void;
}) {
  const [name, setName] = useState(existing?.name ?? initialName);
  const [trackingType, setTrackingType] = useState<CustomExerciseTrackingType | null>(
    existing ? trackingTypeOf(existing) : null,
  );
  const [equipment, setEquipment] = useState<Equipment | null>(existing?.equipment ?? null);
  const [muscle, setMuscle] = useState<MuscleGroup | null>(existing?.muscle ?? null);
  const [saving, setSaving] = useState(false);

  const needsEquipment = trackingType === "weighted";
  const needsMuscle = trackingType !== null && trackingType !== "cardio";

  const canSave =
    !saving &&
    name.trim() !== "" &&
    trackingType !== null &&
    (!needsEquipment || equipment !== null) &&
    (!needsMuscle || muscle !== null);

  async function handleSubmit() {
    if (!canSave || trackingType === null) return;
    setSaving(true);
    try {
      const def = existing
        ? await updateCustomExercise(existing.id, {
            name,
            equipment: equipment ?? undefined,
            muscle: muscle ?? undefined,
          })
        : await createCustomExercise({
            name,
            trackingType,
            equipment: equipment ?? undefined,
            muscle: muscle ?? undefined,
          });
      onSaved(def);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save exercise");
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 px-4 pt-6 pb-8">
      <section className="flex flex-col gap-2">
        <label className="text-sm font-semibold" htmlFor="custom-exercise-name">
          Name
        </label>
        <input
          id="custom-exercise-name"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Landmine Press"
          className="w-full rounded-lg border border-border/50 bg-card px-3 py-2 text-sm outline-none"
        />
      </section>

      <section className="flex flex-col gap-2">
        <p className="text-sm font-semibold">Type</p>
        <div className="flex flex-col gap-2">
          {TRACKING_TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              disabled={!!existing}
              onClick={() => {
                setTrackingType(t.id);
                setEquipment(null);
                setMuscle(null);
              }}
              className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                trackingType === t.id
                  ? "border-primary bg-primary/10"
                  : "border-border/50 bg-card active:bg-secondary/40"
              } ${existing ? "opacity-60" : ""}`}
            >
              <p className="text-sm font-medium">{t.label}</p>
              <p className="text-xs text-muted-foreground">{t.hint}</p>
            </button>
          ))}
        </div>
        {existing && (
          <p className="text-xs text-muted-foreground">
            Type can't be changed once an exercise has logged sets against it — delete and recreate
            instead if this needs to be a different type.
          </p>
        )}
      </section>

      {needsEquipment && (
        <section className="flex flex-col gap-2">
          <p className="text-sm font-semibold">Equipment</p>
          <div className="flex flex-wrap gap-2">
            {EQUIPMENT_OPTIONS.map((eq) => (
              <button
                key={eq}
                type="button"
                onClick={() => setEquipment(eq)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  equipment === eq
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground active:bg-secondary/70"
                }`}
              >
                {eq}
              </button>
            ))}
          </div>
        </section>
      )}

      {needsMuscle && (
        <section className="flex flex-col gap-2">
          <p className="text-sm font-semibold">Primary Muscle</p>
          <div className="flex flex-wrap gap-2">
            {MUSCLE_OPTIONS.map((mg) => (
              <button
                key={mg}
                type="button"
                onClick={() => setMuscle(mg)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  muscle === mg
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground active:bg-secondary/70"
                }`}
              >
                {formatMuscleGroup(mg)}
              </button>
            ))}
          </div>
        </section>
      )}

      <Button onClick={handleSubmit} disabled={!canSave}>
        {saving ? "Saving…" : existing ? "Save Changes" : "Create Exercise"}
      </Button>

      {showEntryPointHint && !existing && (
        <p className="text-center text-xs text-muted-foreground">
          You can also add exercises from Overview → Recent progress → See all progress → +
        </p>
      )}
    </div>
  );
}
