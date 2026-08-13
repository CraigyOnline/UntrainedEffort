interface CardioSignatureProps {
  /** "steady" for continuous cardio (running, rowing, cycling), "interval"
   *  for work/rest interval exercises. Shape only — see `tone` for color,
   *  which is deliberately not derived from pattern (a plain interval
   *  cardio workout and a circuit both use the "interval" shape family,
   *  but need different colors to stay visually distinct from each
   *  other — see the --cardio token's rationale in styles.css). */
  pattern: "steady" | "interval";
  /** "cardio" (default) for a plain cardio/interval workout — always
   *  --cardio regardless of pattern, so the icon reads as "this is a
   *  cardio workout" first and "steady vs interval" second. "circuit" is
   *  for CircuitSignatureIcon's cardio-dominant case — --intensity,
   *  matching the Circuit badge's existing color, so a circuit reads as
   *  a circuit even though it also happens to render the "interval"
   *  shape. Also deliberately not heart-rate/EKG imagery either way: the
   *  app has no HR data yet, and that visual language should stay
   *  reserved for when real HR support ships, rather than being spent
   *  early as a generic cardio glyph. */
  tone?: "cardio" | "circuit";
  className?: string;
  /** Shrinks the icon for thumbnail-sized usage (history card, list rows).
   *  Mirrors MuscleMap's `compact` prop so the two can sit side by side
   *  in the same slot without a visible size mismatch. Overridden by an
   *  explicit `height`, if given. */
  compact?: boolean;
  /** Icon height in px; width matches (the icon is square). Defaults to
   *  72px compact / 160px full-size — smaller than MuscleMap's 288px
   *  default since this is a simple icon, not a tall body silhouette. */
  height?: number;
}

// Smooth continuous wave — three gentle peaks across the icon width.
const STEADY_PATH = "M20,50 C27,35 33,35 40,50 C47,65 53,65 60,50 C67,35 73,35 80,50";

// Square work/rest pulses — flat "up" segments (work) alternating with
// flat "down" segments (rest), matching the work/rest framing used
// elsewhere in the app's interval UI (CircuitTimer, IntervalPerformanceCard).
const INTERVAL_PATH =
  "M20,60 L20,40 L32,40 L32,60 L44,60 L44,40 L56,40 L56,60 L68,60 L68,40 L80,40 L80,60";

/**
 * A compact icon representing a cardio or interval workout, for use in the
 * same visual slot MuscleMap occupies for strength workouts. Exists
 * because that slot previously had no honest representation for cardio-
 * only workouts: WorkoutSummary rendered an empty, unhighlighted muscle
 * silhouette, and the history timeline card just left the slot blank.
 *
 * Not built as an expandable dialog like MuscleMap/ExpandableMuscleMap —
 * unlike a muscle map, there's no finer detail to reveal by tapping in;
 * the workout detail screen's existing CardioPerformanceCard/
 * IntervalPerformanceCard already cover that.
 */
export function CardioSignature({
  pattern,
  tone = "cardio",
  className,
  compact,
  height,
}: CardioSignatureProps) {
  const resolvedHeight = height ?? (compact ? 72 : 160);
  const color = tone === "circuit" ? "var(--intensity)" : "var(--cardio)";
  const path = pattern === "interval" ? INTERVAL_PATH : STEADY_PATH;

  return (
    <svg
      viewBox="0 0 100 100"
      width={resolvedHeight}
      height={resolvedHeight}
      className={className}
      role="img"
      aria-label={pattern === "interval" ? "Interval workout" : "Cardio workout"}
    >
      <circle
        cx={50}
        cy={50}
        r={46}
        fill="none"
        stroke={color}
        strokeOpacity={0.25}
        strokeWidth={3}
        strokeDasharray="4 4"
      />
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
