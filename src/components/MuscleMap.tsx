import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MuscleGroup } from "@/lib/exercises";
import { muscleGroupToRegions, renderOnlyRegions } from "@/lib/muscles";
import { getBodyType, type BodyType } from "@/lib/bodyType";

import silhouetteMaleFront from "@/assets/muscles/silhouette-male-front.svg?raw";
import silhouetteMaleBack from "@/assets/muscles/silhouette-male-back.svg?raw";
import silhouetteFemaleFront from "@/assets/muscles/silhouette-female-front.svg?raw";
import silhouetteFemaleBack from "@/assets/muscles/silhouette-female-back.svg?raw";

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
const PANEL_ASPECT = 330 / 735; // numeric form of ASPECT — used to size panels to fit the available width

/**
 * Resolves a height prop (a number in px, or any CSS length like "65vh")
 * down to an actual pixel value. Needed because sizing below has to check
 * whether a given height would make the two panels overflow the container
 * width — which requires a concrete number, not a string the browser
 * resolves internally. A hidden probe element carries the raw CSS length
 * so the browser does the resolving (vh, %, etc.) and this just reads the
 * result back off it.
 */
function useResolvedHeight(
  value: number | string,
): [number, React.RefObject<HTMLDivElement | null>] {
  const probeRef = useRef<HTMLDivElement>(null);
  const [resolved, setResolved] = useState(typeof value === "number" ? value : 0);

  useLayoutEffect(() => {
    if (typeof value === "number") {
      setResolved(value);
      return;
    }
    const el = probeRef.current;
    if (!el) return;
    const measure = () => setResolved(el.getBoundingClientRect().height);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [value]);

  return [resolved, probeRef];
}

/** Tracks an element's rendered width, so panel sizing can react to it. */
function useElementWidth(): [number, React.RefObject<HTMLDivElement | null>] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (typeof w === "number") setWidth(w);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [width, ref];
}

const REST_OPACITY = 0.08; // untrained/no-data region — a faint outline only, never mistaken for "worked"
const DIMMED_MULTIPLIER = 0.35; // applied when a different muscle is selected

// The app's one established accent colour (nav active state, progress bars,
// "current best" text, etc. — see --primary in styles.css) doubles as the
// muscle-map "heat" colour. Referencing the CSS variable directly, rather
// than a hardcoded hex, keeps this in lockstep with the rest of the theme
// if it's ever retuned. A plain grey fill read as muddy/indistinct against
// the app's near-black background regardless of opacity — a colour with
// real hue, not just lightness, is what actually reads at low opacity.
const MUSCLE_COLOR = "var(--primary)";

// Body-outline colour, drawn beneath the muscle overlay. See
// --muscle-silhouette in styles.css for why this is a dedicated token
// rather than the hardcoded #2e343a the source SVGs used to carry.
const SILHOUETTE_COLOR = "var(--muscle-silhouette)";

// Discrete intensity tiers rather than a continuous opacity ramp. A smooth
// gradient from REST_OPACITY to 1 reads as one undifferentiated wash of
// green once real workout data (which rarely produces an intensity near
// the theoretical max of 1) is plugged in — most trained muscles end up
// bunched in the low-to-mid range and become hard to tell apart. Named,
// stepped bands give the eye an actual jump to notice between "barely
// worked" and "worked a lot", and only the top tier gets the glow.
//
// Each tier also shifts lightness/chroma (not just fill-opacity) up the
// same hue as --primary. Opacity alone, blended onto the app's near-black
// background, compresses perceptually — two adjacent alpha values read as
// "similarly faint" even when the numbers are meaningfully different,
// which is exactly the range most real workout data lands in. Pairing the
// opacity step with an actual brightness/vividness step gives the eye a
// second, stronger cue: low tiers render as a dull, dark green and high
// tiers as a genuinely bright, saturated one.
const INTENSITY_TIERS: { upTo: number; opacity: number; color: string; glow: boolean }[] = [
  { upTo: 0.15, opacity: 0.55, color: "oklch(0.42 0.09 145)", glow: false }, // light
  { upTo: 0.35, opacity: 0.72, color: "oklch(0.55 0.13 145)", glow: false }, // moderate
  { upTo: 0.6, opacity: 0.88, color: "oklch(0.68 0.17 145)", glow: false }, // heavy
  { upTo: Infinity, opacity: 1, color: "oklch(0.8 0.2 145)", glow: true }, // max — the only tier with a glow
];

// Glow uses the max tier's own (brighter) colour rather than the base
// --primary, so the glow reads as an extension of the max-tier fill
// instead of a slightly duller colour haloing a brighter one.
const GLOW_FILTER = `drop-shadow(0 0 6px ${INTENSITY_TIERS[INTENSITY_TIERS.length - 1].color})`;

function regionStyle(
  rawIntensity: number | undefined,
  dimmed: boolean,
): { opacity: number; color: string | null; glow: boolean } {
  const v = Math.max(0, Math.min(1, rawIntensity ?? 0));
  if (v <= 0)
    return {
      opacity: dimmed ? REST_OPACITY * DIMMED_MULTIPLIER : REST_OPACITY,
      // No colour override at rest — inherits the baseline --primary fill
      // `prepareSvg` bakes onto the root <g>, same as before this change.
      color: null,
      glow: false,
    };
  const tier =
    INTENSITY_TIERS.find((t) => v <= t.upTo) ?? INTENSITY_TIERS[INTENSITY_TIERS.length - 1];
  // A dimmed-but-trained region (another muscle is selected) still reads at
  // its tier's relative opacity and colour, just scaled down — but never
  // glows, since the glow is meant to draw the eye to what's currently
  // highlighted.
  return {
    opacity: dimmed ? tier.opacity * DIMMED_MULTIPLIER : tier.opacity,
    color: tier.color,
    glow: dimmed ? false : tier.glow,
  };
}

/**
 * Prepares one panel's raw muscles-*.svg source for inline injection:
 *  - namespaces every id="..." with this panel's unique prefix, so the
 *    front and back SVGs — which legitimately share region ids like
 *    trapezius-l/r — never collide in the DOM when both are mounted at
 *    once (and so two MuscleMap instances on the same page never collide
 *    with each other either, since the prefix includes a React useId).
 *  - swaps the root <svg>'s fixed width/height for 100%, so it fills its
 *    container exactly like the inlined silhouette beneath it (both share
 *    the same viewBox, so they overlay in perfect alignment either way).
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
    .replace(/fill="#b5b5b5"/, `fill="${MUSCLE_COLOR}" fill-opacity="${REST_OPACITY}"`)
    .replace(/id="([a-zA-Z0-9-]+)"/g, `id="${prefix}-$1"`);
}

/**
 * Prepares one panel's raw silhouette-*.svg source for inline injection —
 * same width/height treatment as prepareSvg, but recolours to
 * SILHOUETTE_COLOR at full opacity rather than the muscle overlay's
 * resting wash. No id-namespacing needed: the silhouette source has no
 * ids of its own to collide with.
 */
function prepareSilhouetteSvg(svg: string): string {
  return svg
    .replace(/width="\d+" height="\d+"/, 'width="100%" height="100%"')
    .replace(/fill="#b5b5b5"/, `fill="${SILHOUETTE_COLOR}"`);
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

  const preparedSilhouette = useMemo(() => prepareSilhouetteSvg(silhouette), [silhouette]);
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
      const { opacity, color, glow } = regionStyle(raw, dimmed);
      const filterRule = glow ? ` filter: ${GLOW_FILTER};` : "";
      const colorRule = color ? ` fill: ${color};` : "";
      for (const region of regions) {
        rules.push(
          `#${prefix}-${region}-l, #${prefix}-${region}-r { fill-opacity: ${opacity};${colorRule}${filterRule} }`,
        );
      }
    }

    if (activeMuscle != null) {
      const { opacity } = regionStyle(undefined, true);
      for (const region of renderOnlyRegions) {
        rules.push(`#${prefix}-${region}-l, #${prefix}-${region}-r { fill-opacity: ${opacity}; }`);
      }
    }

    return rules.join("\n");
  }, [intensity, activeMuscle, prefix]);

  return (
    <div style={{ position: "relative", height, aspectRatio: ASPECT, flexShrink: 0 }}>
      <div
        aria-hidden
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        dangerouslySetInnerHTML={{ __html: preparedSilhouette }}
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
  const gap = compact ? 6 : 16;

  const requestedHeight = height ?? (compact ? 72 : 288);
  const [desiredHeight, probeRef] = useResolvedHeight(requestedHeight);
  const [containerWidth, containerRef] = useElementWidth();

  // Both panels sit side by side at a fixed aspect ratio; a height alone
  // (e.g. the expanded dialog's "65vh") says nothing about how wide that
  // makes the pair, so on a narrow screen it can overflow the container
  // and get clipped instead of scaling down. Cap the height so both panels
  // plus the gap between them always fit the measured container width,
  // then use whichever of that cap and the requested height is smaller.
  const widthCappedHeight =
    containerWidth > 0 ? (containerWidth - gap) / (2 * PANEL_ASPECT) : Infinity;
  const panelHeight =
    desiredHeight > 0 ? Math.min(desiredHeight, widthCappedHeight) : desiredHeight;

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        display: "flex",
        justifyContent: "center",
        gap,
        width: "100%",
        overflow: "hidden",
      }}
    >
      {typeof requestedHeight === "string" && (
        <div
          ref={probeRef}
          aria-hidden
          style={{
            position: "absolute",
            visibility: "hidden",
            pointerEvents: "none",
            width: 0,
            height: requestedHeight,
          }}
        />
      )}
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
