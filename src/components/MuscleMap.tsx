import { useId, useMemo, useState } from "react";
import type { MuscleGroup } from "@/lib/exercises";
import { muscleGroupToRegions, renderOnlyRegions } from "@/lib/muscles";
import { getBodyType, type BodyType } from "@/lib/bodyType";

import silhouetteMaleFront from "@/assets/muscles/silhouette-male-front.svg";
import silhouetteMaleBack from "@/assets/muscles/silhouette-male-back.svg";
import silhouetteFemaleFront from "@/assets/muscles/silhouette-female-front.svg";
import silhouetteFemaleBack from "@/assets/muscles/silhouette-female-back.svg";

import musclesMaleFront from "@/assets/muscles/muscles-male-front.svg?raw";
import musclesMaleBack from "@/assets/muscles/muscles-male-back.svg?raw";
import musclesFemaleFront from "@/assets/muscles/muscles-female-front.svg?raw";
import musclesFemaleBack from "@/assets/muscles/muscles-female-back.svg?raw";

interface MuscleMapProps {
  intensity: Partial<Record<MuscleGroup, number>>;
  activeMuscle?: MuscleGroup | null;
  className?: string;
  /**
   * Tightens the gap between the front/back panels for small thumbnail-sized
   * usage (e.g. routine cards). The default gap (16px) is tuned for the
   * full-width Profile/WorkoutSummary usage and looks oversized at small
   * sizes. Purely a layout tweak — no change to highlighting or assets.
   */
  compact?: boolean;
}

type View = "front" | "back";

const ASSETS: Record<BodyType, Record<View, { silhouette: string; muscles: string }>> = {
  male: {
    front: { silhouette: silhouetteMaleFront, muscles: musclesMaleFront },
    back: { silhouette: silhouetteMaleBack, muscles: musclesMaleBack },
  },
  female: {
    front: { silhouette: silhouetteFemaleFront, muscles: musclesFemaleFront },
    back: { silhouette: silhouetteFemaleBack, muscles: musclesFemaleBack },
  },
};

// Matches every muscles-*.svg file's fixed canvas size — see the split
// script that generated them. All four (male/female × front/back) share
// this exact size, so front and back panels are never visually mismatched.
const ASPECT = "330 / 735";

const RESTING_OPACITY = 0.12; // untrained region, always faintly visible
const MAX_OPACITY = 1;
const DIMMED_MULTIPLIER = 0.35; // applied when a different muscle is selected

function regionOpacity(rawIntensity: number | undefined, dimmed: boolean): number {
  const v = Math.max(0, Math.min(1, rawIntensity ?? 0));
  const base = v > 0 ? RESTING_OPACITY + v * (MAX_OPACITY - RESTING_OPACITY) : RESTING_OPACITY;
  return dimmed ? base * DIMMED_MULTIPLIER : base;
}

/**
 * Prepares one panel's raw muscles-*.svg source for inline injection:
 *  - namespaces every id="..." with this panel's unique prefix, so the
 *    front and back SVGs — which legitimately share region ids like
 *    trapezius-l/r — never collide in the DOM when both are mounted at
 *    once (and so two MuscleMap instances on the same page never collide
 *    with each other either, since the prefix includes a React useId).
 *  - swaps the root <svg>'s fixed width/height for 100%, so it fills its
 *    container exactly like the silhouette <img> below it (both share the
 *    same viewBox, so they overlay in perfect alignment either way).
 *  - sets a baseline fill-opacity on the root <g>, inherited by every
 *    path unless a more specific rule below overrides it — this is what
 *    makes an untrained, untracked region (e.g. serratus-anterior) render
 *    at the same resting opacity as a tracked-but-untrained one, with no
 *    need to enumerate every single region explicitly.
 */
function prepareSvg(svg: string, prefix: string): string {
  return svg
    .replace(/width="\d+" height="\d+"/, 'width="100%" height="100%"')
    .replace(/fill="#b5b5b5"/, `fill="#b5b5b5" fill-opacity="${RESTING_OPACITY}"`)
    .replace(/id="([a-zA-Z0-9-]+)"/g, `id="${prefix}-$1"`);
}

function Panel({
  idPrefix,
  view,
  bodyType,
  intensity,
  activeMuscle,
}: {
  idPrefix: string;
  view: View;
  bodyType: BodyType;
  intensity: Partial<Record<MuscleGroup, number>>;
  activeMuscle?: MuscleGroup | null;
}) {
  const { silhouette, muscles } = ASSETS[bodyType][view];
  const prefix = `${idPrefix}-${view}`;

  const preparedSvg = useMemo(() => prepareSvg(muscles, prefix), [muscles, prefix]);

  // Only regions that need to differ from the baked-in resting baseline
  // get an explicit rule — a group with no recorded intensity and no
  // active-muscle dimming in effect is already correct via inheritance.
  const styleRules = useMemo(() => {
    const rules: string[] = [];
    const groups = Object.entries(muscleGroupToRegions) as [MuscleGroup, string[]][];

    for (const [group, regions] of groups) {
      const dimmed = activeMuscle != null && activeMuscle !== group;
      const raw = intensity[group];
      if (!dimmed && !(typeof raw === "number" && raw > 0)) continue;
      const opacity = regionOpacity(raw, dimmed);
      for (const region of regions) {
        rules.push(`#${prefix}-${region}-l, #${prefix}-${region}-r { fill-opacity: ${opacity}; }`);
      }
    }

    if (activeMuscle != null) {
      const opacity = regionOpacity(undefined, true);
      for (const region of renderOnlyRegions) {
        rules.push(`#${prefix}-${region}-l, #${prefix}-${region}-r { fill-opacity: ${opacity}; }`);
      }
    }

    return rules.join("\n");
  }, [intensity, activeMuscle, prefix]);

  return (
    <div style={{ position: "relative", flex: 1, aspectRatio: ASPECT, maxHeight: "100%" }}>
      <img
        src={silhouette}
        alt=""
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "contain",
        }}
      />
      <style>{styleRules}</style>
      <div
        aria-hidden
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        dangerouslySetInnerHTML={{ __html: preparedSvg }}
      />
    </div>
  );
}

export function MuscleMap({ intensity, activeMuscle, className, compact = false }: MuscleMapProps) {
  // useId()'s default format (":r0:") contains colons, which are invalid
  // inside a CSS id selector — stripped here since this id is used to build
  // selector strings below, not just DOM/ARIA attributes.
  const idPrefix = useId().replace(/:/g, "");
  const [bodyType] = useState(() => getBodyType());

  return (
    <div
      className={className}
      style={{
        display: "flex",
        gap: compact ? 6 : 16,
        width: "100%",
        alignItems: "flex-start",
      }}
    >
      <Panel
        idPrefix={idPrefix}
        view="front"
        bodyType={bodyType}
        intensity={intensity}
        activeMuscle={activeMuscle}
      />
      <Panel
        idPrefix={idPrefix}
        view="back"
        bodyType={bodyType}
        intensity={intensity}
        activeMuscle={activeMuscle}
      />
    </div>
  );
}
