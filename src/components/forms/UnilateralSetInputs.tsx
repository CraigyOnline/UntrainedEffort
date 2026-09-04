import { sideLabel, type ExerciseLoggingSchema, type SetSide } from "@/lib/exercises";
import { MmSsInput } from "@/components/forms/MmSsInput";
import { StepperInput } from "@/components/forms/NumberInput";
import { SetTimer, TimerToggleButton } from "@/features/workout/WorkoutTimer";

/**
 * Which context this is rendering in, decided by the parent rather than
 * handed down as a rendering flag:
 * - "live": an active, in-progress workout (LiveSession) — a timed
 *   exercise gets the same running SetTimer + start/stop toggle every
 *   other timed set already uses, not a manual entry field.
 * - "history": viewing/editing a finished workout (_app.history.$id) —
 *   there's nothing to start or stop, so a timed exercise gets the
 *   manual MM:SS field it already had.
 */
export type UnilateralSetInputsMode =
  | {
      kind: "live";
      /** Each side's running-timer state — undefined/null means stopped. */
      timerStart: { primary: number | null | undefined; secondary: number | null | undefined };
      onToggleTimer: (side: "primary" | "secondary") => void;
    }
  | { kind: "history" };

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
  mode: UnilateralSetInputsMode;
  /** Passed straight through to editSide — see there for what each state
   *  means. */
  linked?: boolean;
  /** Tapping the connector rendered to the right of these two rows calls
   *  this. Undefined hides the connector entirely rather than rendering a
   *  dead control — used by History mode, which doesn't wire this up
   *  (nothing to persist a link choice into once a workout's finished),
   *  and internally for a timed exercise (side plank etc.), whose two
   *  sides never mirror regardless of `linked` (see editSide above), so a
   *  visible toggle there would do nothing. `linked`/`onToggleLinked` are
   *  still one exercise-wide choice, not a per-set one — this just
   *  renders that same choice once per set, next to the values it
   *  actually affects, rather than once up in the exercise header. */
  onToggleLinked?: () => void;
}

/**
 * Applies one field edit on one side. `linked` decides how it affects the
 * other side:
 * - undefined (never explicitly toggled) — mirrors onto the other side
 *   only while that field was still in sync between them, the same way
 *   this codebase already prefers absence-of-data over an extra boolean
 *   elsewhere (e.g. IntervalTimerState). The moment the two happen to
 *   differ, or a direct secondary edit lands, this stops propagating for
 *   that field on its own.
 * - true (explicitly linked) — always mirrors the edit onto the other
 *   side, in either direction, regardless of the sides' current values.
 * - false (explicitly unlinked) — never mirrors, in either direction,
 *   even when the two sides currently happen to match.
 *
 * Only ever called for a manual weight/reps/duration edit — starting or
 * stopping a live timer (mode.kind === "live") calls onToggleTimer
 * directly instead, bypassing this entirely, so the two sides' timers
 * are never mirrored or coupled to each other regardless of `linked`.
 *
 * Exported (unlike the rest of this module's internals) so the three
 * `linked` states can be unit-tested directly — see
 * UnilateralSetInputs.test.ts — rather than only indirectly through
 * StepperInput/MmSsInput rendering, matching how this codebase already
 * tests other pure logic.
 */
export function editSide(
  primary: SetSide,
  secondary: SetSide,
  edited: "primary" | "secondary",
  field: keyof SetSide,
  value: number,
  linked?: boolean,
): { primary: SetSide; secondary: SetSide } {
  if (edited === "secondary") {
    return linked === true
      ? { primary: { ...primary, [field]: value }, secondary: { ...secondary, [field]: value } }
      : { primary, secondary: { ...secondary, [field]: value } };
  }
  const shouldMirror =
    linked === true || (linked === undefined && secondary[field] === primary[field]);
  return {
    primary: { ...primary, [field]: value },
    secondary: shouldMirror ? { ...secondary, [field]: value } : secondary,
  };
}

/**
 * The stacked "Set 1 / Left 40kg × 10 / Right 40kg × 9" input block for a
 * unilateral exercise, shared between LiveSession's live logging and
 * History's edit mode so the two never grow independently-drifting
 * copies of this. Renders weight+reps steppers, or — depending on `mode`
 * — a live SetTimer+toggle (live) or a manual MM:SS field (history) for a
 * timed exercise. Same fields the non-unilateral row already shows, just
 * once per side instead of once per set.
 */
export function UnilateralSetInputs({
  schema,
  primary,
  secondary,
  onChange,
  size = "large",
  mode,
  linked,
  onToggleLinked,
}: UnilateralSetInputsProps) {
  const rows: Array<{ key: "primary" | "secondary"; label: string; value: SetSide }> = [
    { key: "primary", label: sideLabel(0), value: primary },
    { key: "secondary", label: sideLabel(1), value: secondary },
  ];

  // One column-header row instead of one per side: the standard
  // (non-unilateral) set row already shows a single "Kg / Reps" header
  // per set, so a unilateral set repeating it twice (once per side) was
  // pure duplication, not a different information need. Skipped for the
  // live-timer case since there's no static column there — the running
  // SetTimer already carries its own label.
  const showValueHeader = !(schema.duration && mode.kind === "live");
  const valueHeaderLabel = schema.duration ? "Sec" : null;

  // See onToggleLinked's doc comment above for why duration is excluded.
  const showConnector = !!onToggleLinked && !schema.duration;
  // undefined (never explicitly toggled) renders connected, matching
  // today's default in-sync behavior — the visual only ever needs to be
  // one of two states, even though the underlying value has three; see
  // editSide for why undefined and true aren't quite the same thing.
  const showLine = linked ?? true;

  return (
    <div className="flex flex-col gap-2">
      {showValueHeader && (
        <div className="grid grid-cols-[3rem_1fr_1fr] gap-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <span />
          {valueHeaderLabel ? (
            <span className="col-span-2">{valueHeaderLabel}</span>
          ) : (
            <>
              <span>Kg</span>
              <span>Reps</span>
            </>
          )}
        </div>
      )}
      <div className="flex items-stretch gap-2">
        <div className="flex flex-1 flex-col gap-2">
          {rows.map((row) => (
            <div key={row.key} className="grid grid-cols-[3rem_1fr_1fr] items-center gap-3">
              <span className="text-xs font-semibold text-muted-foreground">{row.label}</span>
              {schema.duration ? (
                mode.kind === "live" ? (
                  <div className="col-span-2 flex items-center gap-2">
                    <SetTimer
                      duration={row.value.duration ?? 0}
                      timerStart={mode.timerStart[row.key]}
                    />
                    <TimerToggleButton
                      running={!!mode.timerStart[row.key]}
                      onClick={() => mode.onToggleTimer(row.key)}
                    />
                  </div>
                ) : (
                  <div className="col-span-2">
                    <MmSsInput
                      seconds={row.value.duration ?? 0}
                      onCommit={(v) =>
                        onChange(editSide(primary, secondary, row.key, "duration", v, linked))
                      }
                    />
                  </div>
                )
              ) : (
                <>
                  <StepperInput
                    value={row.value.weight}
                    onCommit={(v) =>
                      onChange(editSide(primary, secondary, row.key, "weight", v, linked))
                    }
                    step={2.5}
                    decimal
                    min={0}
                    size={size}
                  />
                  <StepperInput
                    value={row.value.reps}
                    onCommit={(v) =>
                      onChange(editSide(primary, secondary, row.key, "reps", v, linked))
                    }
                    step={1}
                    min={0}
                    size={size}
                  />
                </>
              )}
            </div>
          ))}
        </div>
        {showConnector && (
          // The dashed line spans this column's full height, which
          // items-stretch (the flex default) already sizes to match the
          // rows column next to it — no measuring either side. The dot
          // stays put in both states so there's always something visible
          // and tappable here, even when the line itself is gone.
          <div className="relative flex w-6 shrink-0 justify-center">
            <div
              aria-hidden="true"
              className={`h-full w-0 border-l-2 border-dashed border-primary transition-opacity ${
                showLine ? "opacity-100" : "opacity-0"
              }`}
            />
            <button
              onClick={onToggleLinked}
              aria-label={showLine ? "Unlink left and right" : "Link left and right"}
              className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-muted-foreground/30 bg-secondary after:absolute after:-inset-2 after:content-['']"
            />
          </div>
        )}
      </div>
    </div>
  );
}
