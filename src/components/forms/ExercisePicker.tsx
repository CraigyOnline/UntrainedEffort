import { useState } from "react";
import { X, Check } from "lucide-react";
import { EXERCISES, type MuscleGroup } from "@/lib/exercises";
import { BOTTOM_NAV_HEIGHT } from "@/components/BottomTabs";
import { useDismissOnBack } from "@/lib/backHandler";

// ─────────────────────────────────────────────────────────────────────────────
// ExercisePicker
//
// Full-screen overlay for selecting an exercise. Supports:
//   - free-text search
//   - muscle-group chip filtering
//   - grouped-by-muscle browsing when no filter is active
//   - already-added exercises shown dimmed with a checkmark
//
// Previously exported from _app.routines.tsx. Moved here so no route file
// exports reusable components.
// ─────────────────────────────────────────────────────────────────────────────

const MUSCLE_GROUPS: MuscleGroup[] = [
  "Chest", "Shoulders", "Biceps", "Triceps", "Forearms",
  "Abs", "Obliques", "Lats", "UpperBack", "LowerBack",
  "Glutes", "Quads", "Hamstrings", "Calves", "Cardio",
];

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

  // ExercisePicker is a full-screen overlay, not a route — without this,
  // Android back would fall through to route history instead of closing it.
  useDismissOnBack(true, onClose);

  const filtered = EXERCISES.filter((e) => {
    const matchesQ = q === "" || e.name.toLowerCase().includes(q.toLowerCase());
    const matchesMuscle = muscle === null || e.muscle === muscle;
    return matchesQ && matchesMuscle;
  });

  const showGrouped = q === "" && muscle === null;
  const groups: { label: string; exercises: typeof filtered }[] = [];
  if (showGrouped) {
    for (const mg of MUSCLE_GROUPS) {
      const exs = filtered.filter((e) => e.muscle === mg);
      if (exs.length > 0) groups.push({ label: mg, exercises: exs });
    }
  }

  function formatMuscle(mg: string) {
    if (mg === "UpperBack") return "Upper Back";
    if (mg === "LowerBack") return "Lower Back";
    return mg;
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
            onChange={(e) => { setQ(e.target.value); setMuscle(null); }}
            placeholder="Search exercises…"
            className="flex-1 rounded-lg bg-card px-3 py-2 text-sm outline-none"
          />
        </header>

        <div className="flex gap-2 overflow-x-auto px-4 py-2 border-b border-border scrollbar-none">
          <button
            onClick={() => setMuscle(null)}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              muscle === null
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground"
            }`}
          >
            All
          </button>
          {MUSCLE_GROUPS.map((mg) => (
            <button
              key={mg}
              onClick={() => { setMuscle(mg === muscle ? null : mg); setQ(""); }}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                muscle === mg
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground"
              }`}
            >
              {formatMuscle(mg)}
            </button>
          ))}
        </div>

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
                    {formatMuscle(label)}
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
              ))
          }
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
