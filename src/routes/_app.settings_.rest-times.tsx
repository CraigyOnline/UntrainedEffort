import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Search } from "lucide-react";
import { EXERCISES, getRestDurationSec, matchesExerciseQuery } from "@/lib/exercises";
import { getAllExerciseSettings } from "@/lib/exerciseSettings";
import { formatTime } from "@/lib/format";

export const Route = createFileRoute("/_app/settings_/rest-times")({
  head: () => ({
    meta: [
      { title: "Exercise Rest Times · Untrained Effort" },
      {
        name: "description",
        content: "Set a custom automatic rest duration for individual exercises.",
      },
    ],
  }),
  component: RestTimesListPage,
});

// Only exercises that can ever get an automatic rest timer belong here —
// cardio and interval exercises are exempted entirely (see
// getRestDurationSec in exercises.ts), so an override for one of them
// would have nothing to apply to. Computed once at module load since the
// catalog itself is static.
const OVERRIDABLE_EXERCISES = EXERCISES.filter((e) => getRestDurationSec(e) !== undefined);

function formatMuscle(mg: string) {
  if (mg === "UpperBack") return "Upper Back";
  if (mg === "LowerBack") return "Lower Back";
  return mg;
}

function RestTimesListPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");

  // Only reads restDurationSec per exercise — matches the badge this list
  // shows, not the editor's own load (that's a fresh getExerciseSettings
  // call on the detail page, kept separate rather than sharing one query
  // across both routes).
  const settingsList = useLiveQuery(() => getAllExerciseSettings(), []);
  const overrideByExerciseId = new Map(
    (settingsList ?? [])
      .filter((s) => s.restDurationSec !== undefined)
      .map((s) => [s.exerciseId, s.restDurationSec as number]),
  );

  const filtered = OVERRIDABLE_EXERCISES.filter((e) => matchesExerciseQuery(e, q));

  return (
    <div className="flex flex-col gap-4 px-4 pt-6 pb-8">
      <header className="flex items-center gap-3">
        <button onClick={() => navigate({ to: "/settings" })} className="p-1">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold">Exercise Rest Times</h1>
          <p className="text-xs text-muted-foreground">
            Override the automatic rest duration for specific exercises
          </p>
        </div>
      </header>

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search exercises…"
          className="w-full rounded-lg border border-border/50 bg-card py-2 pr-3 pl-9 text-sm outline-none"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/50 bg-card">
        {filtered.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">No exercises found</p>
        )}
        {filtered.map((e, i) => {
          const overrideSec = overrideByExerciseId.get(e.id);
          // Non-null: every exercise in OVERRIDABLE_EXERCISES has a defined
          // duration by construction (that's exactly what filtered it in).
          const smartDefaultSec = getRestDurationSec(e) as number;
          return (
            <Link
              key={e.id}
              to="/settings/rest-times/$exerciseId"
              params={{ exerciseId: e.id }}
              className={`flex items-center justify-between px-4 py-3 text-left active:bg-secondary/40 ${
                i > 0 ? "border-t border-border/30" : ""
              }`}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{e.name}</p>
                <p className="text-xs text-muted-foreground">{formatMuscle(e.muscle)}</p>
              </div>
              <span className="shrink-0 pl-3 text-xs text-muted-foreground">
                {overrideSec !== undefined
                  ? `Custom (${formatTime(overrideSec)})`
                  : `Smart Default (${formatTime(smartDefaultSec)})`}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
