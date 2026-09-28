import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { createCustomExercise, type CustomExerciseTrackingType } from "@/lib/customExercises";
import type { Equipment, MuscleGroup } from "@/lib/exercises";
import { muscleGroupToRegions, formatMuscleGroup } from "@/lib/muscles";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app/exercises_/new")({
  head: () => ({
    meta: [
      { title: "New Exercise · Untrained Effort" },
      { name: "description", content: "Add a custom exercise to your library." },
    ],
  }),
  component: NewExercisePage,
});

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

function NewExercisePage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [trackingType, setTrackingType] = useState<CustomExerciseTrackingType | null>(null);
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [muscle, setMuscle] = useState<MuscleGroup | null>(null);
  const [saving, setSaving] = useState(false);

  const needsEquipment = trackingType === "weighted";
  const needsMuscle = trackingType !== null && trackingType !== "cardio";

  const canSave =
    !saving &&
    name.trim() !== "" &&
    trackingType !== null &&
    (!needsEquipment || equipment !== null) &&
    (!needsMuscle || muscle !== null);

  async function handleCreate() {
    if (!canSave || trackingType === null) return;
    setSaving(true);
    try {
      const def = await createCustomExercise({
        name,
        trackingType,
        equipment: equipment ?? undefined,
        muscle: muscle ?? undefined,
      });
      toast.success(`"${def.name}" created`, { duration: 2500 });
      navigate({ to: "/exercises" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't create exercise");
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 px-4 pt-6 pb-8">
      <header className="flex items-center gap-3">
        <button onClick={() => navigate({ to: "/exercises" })} className="p-1">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold">New Exercise</h1>
          <p className="text-xs text-muted-foreground">Add your own exercise to the library</p>
        </div>
      </header>

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
              onClick={() => {
                setTrackingType(t.id);
                setEquipment(null);
                setMuscle(null);
              }}
              className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                trackingType === t.id
                  ? "border-primary bg-primary/10"
                  : "border-border/50 bg-card active:bg-secondary/40"
              }`}
            >
              <p className="text-sm font-medium">{t.label}</p>
              <p className="text-xs text-muted-foreground">{t.hint}</p>
            </button>
          ))}
        </div>
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

      <Button onClick={handleCreate} disabled={!canSave}>
        {saving ? "Creating…" : "Create Exercise"}
      </Button>
    </div>
  );
}
