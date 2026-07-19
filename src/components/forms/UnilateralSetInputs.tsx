import { sideLabel, type ExerciseLoggingSchema, type SetSide } from "@/lib/exercises";
import { MmSsInput } from "@/components/forms/MmSsInput";
import { StepperInput } from "@/components/forms/NumberInput";

export interface UnilateralSetInputsProps {
  schema: ExerciseLoggingSchema;
  /** The set's top-level weight/reps/duration — the first side. */
  primary: SetSide;
  /** The set's additionalPerformances[0] — the second side. Always
   *  defined by the time this renders; a unilateral set is seeded with
   *  it the moment it's created (see seedUnilateralSide). */
  secondary: SetSide;
  onChange: (next: { primary: SetSide; secondary: SetSide }) => void;
  size?: "compact" | "large";
}

/**
 * Applies one field edit on one side, mirroring it onto the other side
 * only while that field was still in sync between them — the moment the
 * user edits a field on the second side directly, or the two happen to
 * already differ, this stops propagating for that field on its own. No
 * separate "has been manually edited" flag is stored anywhere for this;
 * it's derived purely by comparing the two sides' current values, the
 * same way this codebase already prefers absence-of-data over an extra
 * boolean elsewhere (e.g. IntervalTimerState).
 */
function editSide(
  primary: SetSide,
  secondary: SetSide,
  edited: "primary" | "secondary",
  field: keyof SetSide,
  value: number,
): { primary: SetSide; secondary: SetSide } {
  if (edited === "secondary") {
    return { primary, secondary: { ...secondary, [field]: value } };
  }
  const wasInSync = secondary[field] === primary[field];
  return {
    primary: { ...primary, [field]: value },
    secondary: wasInSync ? { ...secondary, [field]: value } : secondary,
  };
}

/**
 * The stacked "Set 1 / Left 40kg × 10 / Right 40kg × 9" input block for a
 * unilateral exercise, shared between LiveSession's live logging and
 * History's edit mode so the two never grow independently-drifting
 * copies of this. Renders weight+reps steppers or a single duration
 * input per side, matching whatever the shared logging schema says this
 * exercise needs — the same fields the non-unilateral row already shows,
 * just once per side instead of once per set.
 */
export function UnilateralSetInputs({
  schema,
  primary,
  secondary,
  onChange,
  size = "large",
}: UnilateralSetInputsProps) {
  const rows: Array<{ key: "primary" | "secondary"; label: string; value: SetSide }> = [
    { key: "primary", label: sideLabel(0), value: primary },
    { key: "secondary", label: sideLabel(1), value: secondary },
  ];

  return (
    <div className="flex flex-col gap-2">
      {rows.map((row) => (
        <div key={row.key} className="flex items-center gap-3">
          <span className="w-12 shrink-0 text-xs font-semibold text-muted-foreground">
            {row.label}
          </span>
          {schema.duration ? (
            <MmSsInput
              seconds={row.value.duration ?? 0}
              onCommit={(v) => onChange(editSide(primary, secondary, row.key, "duration", v))}
            />
          ) : (
            <>
              <StepperInput
                value={row.value.weight}
                onCommit={(v) => onChange(editSide(primary, secondary, row.key, "weight", v))}
                step={2.5}
                decimal
                min={0}
                size={size}
              />
              <StepperInput
                value={row.value.reps}
                onCommit={(v) => onChange(editSide(primary, secondary, row.key, "reps", v))}
                step={1}
                min={0}
                size={size}
              />
            </>
          )}
        </div>
      ))}
    </div>
  );
}
