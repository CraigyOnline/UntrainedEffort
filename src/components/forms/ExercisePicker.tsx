import { useState } from "react";
import { X, Check, Dumbbell, HeartPulse, Timer } from "lucide-react";
import { EXERCISES, matchesExerciseQuery, type MuscleGroup, type Equipment } from "@/lib/exercises";
import { formatMuscleGroup } from "@/lib/muscles";
import { BOTTOM_NAV_HEIGHT } from "@/components/BottomTabs";
import { useDismissOnBack } from "@/lib/backHandler";

// ─────────────────────────────────────────────────────────────────────────────
// ExercisePicker
//
// Full-screen overlay for selecting an exercise. Three independent (AND'd)
// filter facets, plus free-text search:
//   - Category: Strength / Cardio / Intervals — the one place "cardio" is
//     ever a selectable value. Every exercise is tagged `muscle: "Cardio"`
//     and `equipment: "Cardio"` in the data too, purely as an internal
//     grouping key (see MuscleMap etc.) — those values are deliberately
//     never surfaced as Muscle or Equipment chips, so "Cardio" can't appear
//     as a choice in more than one row with a different meaning each time.
//   - Muscle group and Equipment: both only meaningful for Strength (every
//     cardio/interval exercise shares the same placeholder muscle/equipment
//     value, so filtering by either would just return everything-or-nothing
//     for them) — hidden while Category is Cardio or Interval.
//   - grouped-by-muscle browsing when no filter/search is active. Cardio
//     and Interval exercises get their own two sections here (Category
//     "all" only) rather than being lumped under one "Cardio" heading.
//   - already-added exercises shown dimmed with a checkmark
//
// Previously exported from _app.routines.tsx. Moved here so no route file
// exports reusable components.
// ─────────────────────────────────────────────────────────────────────────────

const MUSCLE_GROUPS: MuscleGroup[] = [
  "Chest",
  "Shoulders",
  "Biceps",
  "Triceps",
  "Forearms",
  "Abs",
  "Obliques",
  "Lats",
  "UpperBack",
  "LowerBack",
  "Glutes",
  "Quads",
  "Hamstrings",
  "Calves",
];

const EQUIPMENT_GROUPS: Equipment[] = [
  "Barbell",
  "Dumbbell",
  "Machine",
  "Cable",
  "Bodyweight",
  "Kettlebell",
  "Band",
  "Other",
];

const CATEGORY_FILTERS = [
  { id: "all" as const, label: "All", icon: null },
  { id: "strength" as const, label: "Strength", icon: Dumbbell },
  { id: "cardio" as const, label: "Cardio", icon: HeartPulse },
  { id: "interval" as const, label: "Intervals", icon: Timer },
];

type Category = (typeof CATEGORY_FILTERS)[number]["id"];

export function ExercisePicker({
  onClose,
  onPick,
  addedIds,
}: {
  onClose: () => void;
  onPick: (id: string) => void;
  addedIds?: Set<string>;
}) {
  const [q, setQ] = useState("");
  const [muscle, setMuscle] = useState<MuscleGroup | null>(null);
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [category, setCategory] = useState<Category>("all");

  // ExercisePicker is a full-screen overlay, not a route — without this,
  // Android back would fall through to route history instead of closing it.
  useDismissOnBack(true, onClose);

  // Muscle/equipment only apply within Strength — every cardio/interval
  // exercise shares one placeholder value for each, so the rows are hidden
  // rather than left visible and silently unable to match anything.
  const showBodyFacets = category === "all" || category === "strength";

  const filtered = EXERCISES.filter((e) => {
    const matchesQ = matchesExerciseQuery(e, q);
    const matchesMuscle = muscle === null || e.muscle === muscle;
    const matchesEquipment = equipment === null || e.equipment === equipment;
    const matchesCategory =
      category === "cardio"
        ? Boolean(e.cardio) && !e.interval
        : category === "interval"
          ? Boolean(e.interval)
          : category === "strength"
            ? !e.cardio && !e.interval
            : true;
    return matchesQ && matchesMuscle && matchesEquipment && matchesCategory;
  });

  const showGrouped =
    q === "" &&
    muscle === null &&
    equipment === null &&
    category !== "cardio" &&
    category !== "interval";
  const groups: { label: string; exercises: typeof filtered }[] = [];
  if (showGrouped) {
    for (const mg of MUSCLE_GROUPS) {
      const exs = filtered.filter((e) => e.muscle === mg);
      if (exs.length > 0) groups.push({ label: mg, exercises: exs });
    }
    if (category === "all") {
      const cardioExs = filtered.filter((e) => e.cardio && !e.interval);
      if (cardioExs.length > 0) groups.push({ label: "Cardio", exercises: cardioExs });
      const intervalExs = filtered.filter((e) => e.interval);
      if (intervalExs.length > 0) groups.push({ label: "Intervals", exercises: intervalExs });
    }
  }

  return (
    <div
      className="fixed inset-x-0 top-0 z-[60] flex justify-center bg-background pt-[env(safe-area-inset-top)]"
      style={{ bottom: `${BOTTOM_NAV_HEIGHT}px` }}
    >
      <div className="flex w-full max-w-md flex-col h-full">
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          <button onClick={onClose} className="p-2 -ml-2">
            <X className="h-5 w-5" />
          </button>
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setMuscle(null);
              setEquipment(null);
            }}
            placeholder="Search exercises…"
            className="flex-1 rounded-lg bg-card px-3 py-2 text-sm outline-none"
          />
        </header>

        <div
          className={`flex gap-2 overflow-x-auto px-4 pt-2 pb-2 scrollbar-none ${
            showBodyFacets ? "" : "border-b border-border"
          }`}
        >
          {CATEGORY_FILTERS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setCategory(id);
                if (id === "cardio" || id === "interval") {
                  setMuscle(null);
                  setEquipment(null);
                }
              }}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                category === id
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground active:bg-secondary/70"
              }`}
            >
              {Icon && <Icon className="h-3.5 w-3.5" />}
              {label}
            </button>
          ))}
        </div>

        {showBodyFacets && (
          <>
            <div className="flex gap-2 overflow-x-auto px-4 pt-2 scrollbar-none">
              <button
                onClick={() => setMuscle(null)}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  muscle === null
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground"
                }`}
              >
                All Muscles
              </button>
              {MUSCLE_GROUPS.map((mg) => (
                <button
                  key={mg}
                  onClick={() => {
                    setMuscle(mg === muscle ? null : mg);
                    setQ("");
                  }}
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                    muscle === mg
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {formatMuscleGroup(mg)}
                </button>
              ))}
            </div>

            <div className="flex gap-2 overflow-x-auto px-4 py-2 border-b border-border scrollbar-none">
              <button
                onClick={() => setEquipment(null)}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  equipment === null
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground"
                }`}
              >
                All Equipment
              </button>
              {EQUIPMENT_GROUPS.map((eq) => (
                <button
                  key={eq}
                  onClick={() => {
                    setEquipment(eq === equipment ? null : eq);
                    setQ("");
                  }}
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                    equipment === eq
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {eq}
                </button>
              ))}
            </div>
          </>
        )}

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              No exercises found
            </p>
          )}

          {showGrouped
            ? groups.map(({ label, exercises: exs }) => (
                <div key={label}>
                  <p className="px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground bg-background sticky top-0">
                    {formatMuscleGroup(label)}
                  </p>
                  {exs.map((e) => (
                    <ExerciseRow
                      key={e.id}
                      exercise={e}
                      added={addedIds?.has(e.id) ?? false}
                      onPick={onPick}
                    />
                  ))}
                </div>
              ))
            : filtered.map((e) => (
                <ExerciseRow
                  key={e.id}
                  exercise={e}
                  added={addedIds?.has(e.id) ?? false}
                  onPick={onPick}
                />
              ))}
        </div>
      </div>
    </div>
  );
}

function ExerciseRow({
  exercise,
  added,
  onPick,
}: {
  exercise: (typeof EXERCISES)[number];
  added: boolean;
  onPick: (id: string) => void;
}) {
  return (
    <button
      onClick={() => onPick(exercise.id)}
      className={`flex w-full items-center justify-between border-b border-border px-4 py-3 text-left active:bg-card ${
        added ? "opacity-50" : ""
      }`}
    >
      <div className="min-w-0">
        <p className="font-medium text-sm truncate">{exercise.name}</p>
        <p className="text-xs text-muted-foreground">{exercise.muscle}</p>
      </div>
      {added && <Check className="h-4 w-4 shrink-0 text-primary" />}
    </button>
  );
}
