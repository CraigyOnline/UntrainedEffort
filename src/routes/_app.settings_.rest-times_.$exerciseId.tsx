import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { getExercise, getRestDurationSec } from "@/lib/exercises";
import {
  getExerciseSettings,
  setExerciseRestDuration,
  clearExerciseRestDuration,
} from "@/lib/exerciseSettings";
import { formatTime } from "@/lib/format";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { MmSsInput } from "@/components/forms/MmSsInput";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app/settings_/rest-times_/$exerciseId")({
  head: () => ({
    meta: [{ title: "Rest Time · Untrained Effort" }],
  }),
  component: RestTimeEditorPage,
});

type Mode = "smart" | "custom";

function RestTimeEditorPage() {
  const { exerciseId } = Route.useParams();
  const navigate = useNavigate();
  const def = getExercise(exerciseId);
  const smartDefaultSec = getRestDurationSec(def);

  const existing = useLiveQuery(() => getExerciseSettings(exerciseId), [exerciseId]);

  const [mode, setMode] = useState<Mode>("smart");
  const [customSec, setCustomSec] = useState(90);

  // Seeds the radio + custom value from the persisted setting exactly
  // once, the moment it resolves — not on every `existing` change, so
  // saving (which re-fires this same live query) doesn't yank the radio
  // out from under someone still on this screen.
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (seeded || existing === undefined) return;
    if (existing?.restDurationSec !== undefined) {
      setMode("custom");
      setCustomSec(existing.restDurationSec);
    }
    setSeeded(true);
  }, [existing, seeded]);

  async function handleSave() {
    if (mode === "smart") {
      await clearExerciseRestDuration(exerciseId);
    } else {
      await setExerciseRestDuration(exerciseId, customSec);
    }
    toast.success("Rest time saved", { duration: 2500 });
    navigate({ to: "/settings/rest-times" });
  }

  if (!def || smartDefaultSec === undefined) {
    return (
      <div className="flex flex-col gap-4 px-4 pt-6 pb-8">
        <header className="flex items-center gap-3">
          <button onClick={() => navigate({ to: "/settings/rest-times" })} className="p-1">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-bold">Exercise not found</h1>
        </header>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 px-4 pt-6 pb-8">
      <header className="flex items-center gap-3">
        <button onClick={() => navigate({ to: "/settings/rest-times" })} className="p-1">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold">{def.name}</h1>
          <p className="text-xs text-muted-foreground">Rest duration after each completed set</p>
        </div>
      </header>

      <section className="rounded-2xl border border-border/50 bg-card p-5">
        <RadioGroup value={mode} onValueChange={(v) => setMode(v as Mode)} className="gap-4">
          <label className="flex items-center gap-2 text-sm">
            <RadioGroupItem value="smart" />
            Smart Default ({formatTime(smartDefaultSec)})
          </label>
          <label className="flex items-center gap-2 text-sm">
            <RadioGroupItem value="custom" />
            Custom
          </label>
        </RadioGroup>

        {mode === "custom" && (
          <div className="mt-3 pl-6">
            <MmSsInput seconds={customSec} onCommit={setCustomSec} />
          </div>
        )}
      </section>

      <Button onClick={handleSave}>Save</Button>
    </div>
  );
}
