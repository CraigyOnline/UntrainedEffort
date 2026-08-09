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
   * Shrinks the panel height and gap for small thumbnail-sized usage (e.g.
   * the live workout HUD). Purely a layout tweak — no change to highlighting
   * or assets. Overridden by an explicit `height`, if given.
   */
  compact?: boolean;
  /**
   * Panel height; width is derived per-panel from this via each SVG's
   * fixed aspect ratio. This is the only sizing input MuscleMap trusts —
   * deliberately not something callers reach with a `max-h-*` class on
   * `className`, since a max-height alone doesn't give a definite height
   * for the aspect-ratio'd panels to measure themselves against (that
   * mismatch is what let the figures spill past their card before).
   * Accepts a number (px) or any CSS length ("65vh", etc). Defaults to
   * 72px compact / 288px full-size.
   */
  height?: number | string;
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

const RESTING_OPACITY = 0.16; // untrained region, always faintly visible
const MAX_OPACITY = 1;
const DIMMED_MULTIPLIER = 0.35; // applied when a different muscle is selected

// The app's one established accent colour (nav active state, progress bars,
// "current best" text, etc. — see --primary in styles.css) doubles as the
// muscle-map "heat" colour. Referencing the CSS variable directly, rather
// than a hardcoded hex, keeps this in lockstep with the rest of the theme
// if it's ever retuned. A plain grey fill read as muddy/indistinct against
// the app's near-black background regardless of opacity — a colour with
// real hue, not just lightness, is what actually reads at low opacity.
const MUSCLE_COLOR = "var(--primary)";

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
 *  - recolours the root <g>'s fill from the source file's flat grey to the
 *    app's accent colour, and sets a baseline fill-opacity there too —
 *    both inherited by every path unless a more specific rule below
 *    overrides them. This is what makes an untrained, untracked region
 *    (e.g. serratus-anterior) render at the correct resting appearance
 *    with no need to enumerate every single region explicitly.
 */
function prepareSvg(svg: string, prefix: string): string {
  return svg
    .replace(/width="\d+" height="\d+"/, 'width="100%" height="100%"')
    .replace(/fill="#b5b5b5"/, `fill="${MUSCLE_COLOR}" fill-opacity="${RESTING_OPACITY}"`)
    .replace(/id="([a-zA-Z0-9-]+)"/g, `id="${prefix}-$1"`);
}

function Panel({
  idPrefix,
  view,
  bodyType,
  intensity,
  activeMuscle,
  height,
}: {
  idPrefix: string;
  view: View;
  bodyType: BodyType;
  intensity: Partial<Record<MuscleGroup, number>>;
  activeMuscle?: MuscleGroup | null;
  height: number | string;
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
    <div style={{ position: "relative", height, aspectRatio: ASPECT, flexShrink: 0 }}>
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

export function MuscleMap({
  intensity,
  activeMuscle,
  className,
  compact = false,
  height,
}: MuscleMapProps) {
  // useId()'s default format (":r0:") contains colons, which are invalid
  // inside a CSS id selector — stripped here since this id is used to build
  // selector strings below, not just DOM/ARIA attributes.
  const idPrefix = useId().replace(/:/g, "");
  const [bodyType] = useState(() => getBodyType());
  const panelHeight = height ?? (compact ? 72 : 288);

  return (
    <div
      className={className}
      style={{
        display: "flex",
        justifyContent: "center",
        gap: compact ? 6 : 16,
        width: "100%",
        overflow: "hidden",
      }}
    >
      <Panel
        idPrefix={idPrefix}
        view="front"
        bodyType={bodyType}
        intensity={intensity}
        activeMuscle={activeMuscle}
        height={panelHeight}
      />
      <Panel
        idPrefix={idPrefix}
        view="back"
        bodyType={bodyType}
        intensity={intensity}
        activeMuscle={activeMuscle}
        height={panelHeight}
      />
    </div>
  );
}
