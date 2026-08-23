import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Share2 } from "lucide-react";
import { getDb, type Workout } from "@/lib/db";
import { getExercise, getExerciseLoggingSchema, formatCompletedSet } from "@/lib/exercises";
import { formatPRValue, formatPRDelta } from "@/lib/exerciseProgress";
import { Button } from "@/components/ui/button";
import {
  CardioPerformanceCard,
  IntervalPerformanceCard,
  WorkoutStatsRow,
} from "@/components/WorkoutSummary";
import {
  CircuitStatsRow,
  CircuitSignatureIcon,
  CircuitStationList,
} from "@/components/CircuitSummary";
import { computeIntensity } from "@/lib/muscles";
import { ShareableProgressCard } from "@/components/ShareableProgressCard";
import { shareProgressCard } from "@/lib/shareCard";
import {
  computeWorkoutDisplayStats,
  detectSessionGoal,
  type SessionGoal,
} from "@/lib/workoutStats";
import { ExpandableMuscleMap } from "@/components/ExpandableMuscleMap";
import icon from "@/assets/brand/icon.png";
import { haptics } from "@/lib/haptics";
import type { CompletionMessage } from "@/lib/completionMessages";

const SESSION_GOAL_LABELS: Record<SessionGoal, string> = {
  strength: "Strength session",
  hypertrophy: "Hypertrophy session",
  endurance: "Endurance session",
  mixed: "Mixed session",
};

/**
 * The post-workout reveal screen. Staged on purpose — this screen's whole
 * point is "let the achievement be felt before analysing it", not reveal
 * information faster/nicer, so it isn't one clock with per-element delays.
 * Real stages:
 *   0 — the acknowledgment alone. Nothing else exists yet.
 *   1 — the acknowledgment recedes to a quieter heading; today's numbers
 *       arrive.
 *   PR moment (if this session has one) — its own beat between stats and
 *   the detail breakdown, not bundled into stage 2's supporting content.
 *   Distinct on purpose: this is the one moment on the screen meant to
 *   feel like impact, everywhere else stays calm.
 *   2 — the detailed breakdown (muscle map, the log, Done). Reference
 *       material, arrives last.
 *
 * `onDone` is called for the Done button only — the caller (WorkoutPage)
 * owns what closing this screen actually means (the "Update Routine?"
 * prompt, clearing its own summary state), since that also has to run for
 * the Android back button and router-navigation exit paths that don't go
 * through this component at all.
 */
export function WorkoutCompleteScreen({
  summary,
  completionMessage,
  onDone,
}: {
  summary: Workout;
  completionMessage: CompletionMessage | null;
  onDone: () => void;
}) {
  // messageVisible is just the acknowledgment's own entrance fade — kept
  // separate from `stage` because it needs to flip true almost immediately
  // (one frame after mount, same technique as before) while `stage`
  // advances on genuine pauses measured in seconds, not frames.
  const [messageVisible, setMessageVisible] = useState(false);
  const [stage, setStage] = useState<0 | 1 | 2>(0);
  const shareCardRef = useRef<HTMLDivElement>(null);
  const [sharing, setSharing] = useState(false);
  const [prRevealed, setPrRevealed] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMessageVisible(true));
    // These durations are the actual design decision here, not the motion
    // curves — the brief this responds to explicitly asked for stillness
    // before analysis, not another speed target. ~2.6s of just sitting
    // with the acknowledgment, then a further ~1s with just the numbers,
    // before the PR moment (if any) or the reference material arrives.
    // Bumped up from the original ~1.7s per explicit feedback that the
    // message needed to stay on screen meaningfully longer.
    const toStage1 = setTimeout(() => setStage(1), 2600);
    // completionMessage.kind is known synchronously from the save itself
    // (see completionMessages.ts) — deliberately not derived from
    // summaryPRs, which is a separate useLiveQuery that may not have
    // resolved yet when this effect runs, and this timing can't wait on
    // that.
    const hasPRMoment = completionMessage?.kind === "pr";
    const toPr = hasPRMoment
      ? setTimeout(() => {
          setPrRevealed(true);
          haptics.prAchieved();
        }, 3400)
      : null;
    const toStage2 = setTimeout(() => setStage(2), hasPRMoment ? 4300 : 3600);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(toStage1);
      if (toPr) clearTimeout(toPr);
      clearTimeout(toStage2);
    };
  }, [completionMessage]);

  const summaryPRs = useLiveQuery(async () => {
    if (typeof window === "undefined" || !summary.id) return [];
    return getDb().prHistory.where("workoutId").equals(summary.id).toArray();
  }, [summary.id]);

  const hasPRs = completionMessage?.kind === "pr";
  const intensity = computeIntensity(summary.exercises);
  const sessionGoal = detectSessionGoal(summary.exercises);
  const displayStats = summary.circuit ? null : computeWorkoutDisplayStats(summary.exercises);

  return (
    <div className="flex flex-col gap-4 px-4 pb-8">
      {/* Stage 0: the acknowledgment, alone. Stage 1+: recedes to a
          quieter heading that still frames what follows — it doesn't
          vanish, since the numbers below are still about the thing it
          just said. The recede is a plain, non-bouncing transition
          (font-size + container height), deliberately calmer than the
          drop-settle-* keyframes used elsewhere — this specific moment
          is meant to feel composed, not impactful.

          Logo + message enter together as one group (same technique as
          the launch screen at "/", which shows the same kind of moment
          on app open) — blur-to-focus, scale/opacity, all on one
          wrapping div rather than the logo and text animating
          separately. The logo only shows at stage 0; it recedes away
          with the rest of the group rather than shrinking awkwardly
          alongside the heading. tracking-tight/leading-snug give the
          large type a more considered, less default feel. Deliberately
          kept at text-3xl rather than sized up further: several pool
          messages run 40-50 characters ("Welcome back — let's pick up
          where you left off."), and a bigger size would wrap those onto
          3-4 lines on a narrow phone — overwhelming rather than
          confident. */}
      <div
        className={`flex flex-col items-center justify-center text-center transition-all duration-500 ease-in-out ${
          stage === 0 ? "min-h-[42vh] pt-6" : "min-h-0 pt-8 pb-1"
        }`}
      >
        {completionMessage && (
          <div
            className={`flex flex-col items-center gap-4 transition-all duration-500 ease-in-out ${
              messageVisible ? "scale-100 opacity-100 blur-none" : "scale-[0.97] opacity-0 blur-md"
            }`}
          >
            {stage === 0 && <img src={icon} alt="" className="h-12 w-12 rounded-2xl" />}
            <p
              className={`px-4 ${
                stage === 0
                  ? `text-3xl leading-snug font-bold tracking-tight ${hasPRs ? "text-pr-gold" : ""}`
                  : `text-lg leading-snug font-semibold ${hasPRs ? "text-pr-gold" : "text-muted-foreground"}`
              }`}
            >
              {completionMessage.headline}
            </p>
            {stage >= 1 && sessionGoal && (
              <p className="px-4 text-xs font-medium text-muted-foreground/70">
                {SESSION_GOAL_LABELS[sessionGoal]}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Stage 1: today's numbers. */}
      {stage >= 1 && (
        <div className={`rounded-xl bg-card p-3 ${hasPRs ? "ring-2 ring-pr-gold/50" : ""}`}>
          {summary.circuit ? (
            <CircuitStatsRow durationSec={summary.durationSec} circuit={summary.circuit} />
          ) : (
            <WorkoutStatsRow
              durationSec={summary.durationSec}
              exercises={summary.exercises}
              revealed={stage >= 1}
            />
          )}
        </div>
      )}

      {stage >= 1 && displayStats?.mode === "cardio" && (
        <div
          className="animate-[fade-in-soft_320ms_ease-out_forwards]"
          style={{ animationDelay: "140ms" }}
        >
          <CardioPerformanceCard exercises={summary.exercises} />
        </div>
      )}

      {stage >= 1 && displayStats && displayStats.intervalActivities.length > 0 && (
        <div
          className="animate-[fade-in-soft_320ms_ease-out_forwards]"
          style={{ animationDelay: "200ms" }}
        >
          <IntervalPerformanceCard exercises={summary.exercises} />
        </div>
      )}

      {/* The Personal Record moment — its own beat, not bundled into
          stage 2's calm supporting content. pr-impact is the one
          keyframe on this screen meant to feel like impact (bigger drop
          distance, a glow flash that spikes then decays); haptics.
          prAchieved() fires in the timing effect above at the exact
          frame this mounts. Individual records stagger within the card
          (120ms apart) for a sequential feel when there's more than
          one, rather than every record landing at once. */}
      {prRevealed && summaryPRs && summaryPRs.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-pr-gold uppercase tracking-wide">
            Personal Records 🏆
          </h2>
          <div className="rounded-xl bg-pr-gold/10 ring-1 ring-pr-gold/30 px-4 py-3 flex flex-col gap-2">
            {summaryPRs.map((pr, i) => {
              const def = getExercise(pr.exerciseId);
              const name = def?.name ?? pr.exerciseId;
              const schema = getExerciseLoggingSchema(def);
              const typeLabel =
                pr.type === "weight"
                  ? "Weight"
                  : pr.type === "reps"
                    ? "Reps"
                    : pr.type === "time"
                      ? "Duration"
                      : pr.type === "distance"
                        ? "Distance"
                        : pr.type === "pace"
                          ? "Pace"
                          : pr.type === "volume"
                            ? "Volume"
                            : schema.paceConvention?.style === "rate"
                              ? "Rate"
                              : "Speed";
              const fmt = (v: number) => formatPRValue(pr.type, v, schema);
              const isFirst = (pr.previousBest ?? 0) === 0;
              return (
                <div
                  key={i}
                  className="flex items-start justify-between gap-2 rounded-lg px-3 py-2 animate-[pr-impact_450ms_ease-out_forwards]"
                  style={{ animationDelay: `${i * 120}ms` }}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{name}</p>
                    <p className="text-xs text-muted-foreground">
                      {typeLabel} •{" "}
                      {isFirst ? (
                        <span className="text-pr-gold">First PR ({fmt(pr.value)})</span>
                      ) : (
                        <span>
                          {fmt(pr.previousBest ?? 0)} →{" "}
                          <span className="text-pr-gold font-semibold">{fmt(pr.value)}</span>
                        </span>
                      )}
                    </p>
                  </div>
                  {!isFirst && (
                    <span className="shrink-0 text-xs text-pr-gold font-semibold">
                      {formatPRDelta(pr.type, pr.delta ?? pr.value, schema)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Stage 2: the detailed breakdown — reference material, supporting
          the achievement above rather than competing with it. Mounts
          fresh at this stage (rather than being present-but-hidden the
          whole time), so the fade-in-soft keyframe plays automatically
          on mount without needing its own revealed/visible state. Its
          own internal stagger (0/100/180ms) no longer needs to branch on
          hasPRs — the wait for the PR moment is handled by stage 2
          starting later altogether (see the timing effect above), not
          by extra per-element delay here. */}
      {stage >= 2 && (
        <div className="animate-[fade-in-soft_320ms_ease-out_forwards]">
          {summary.circuit ? (
            <CircuitSignatureIcon circuit={summary.circuit} className="mx-auto" />
          ) : (
            <ExpandableMuscleMap intensity={intensity} />
          )}
        </div>
      )}

      {stage >= 2 && (
        <div
          className="flex flex-col gap-2 animate-[fade-in-soft_320ms_ease-out_forwards]"
          style={{ animationDelay: "100ms" }}
        >
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            What you did
          </h2>
          {summary.circuit ? (
            <CircuitStationList circuit={summary.circuit} />
          ) : (
            summary.exercises.map((ex, ei) => {
              const def = getExercise(ex.exerciseId);
              const completedSets = ex.sets.filter((s) => s.completed);
              if (completedSets.length === 0) return null;
              return (
                <div key={ei} className="rounded-xl bg-muted px-4 py-3">
                  <p className="font-semibold text-sm">{def?.name ?? ex.exerciseId}</p>
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {completedSets.map((s, si) => (
                      <li key={si} className="text-xs text-muted-foreground tabular-nums">
                        Set {si + 1}: {formatCompletedSet(def, s)}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })
          )}
        </div>
      )}

      {stage >= 2 && (
        <div
          className="flex animate-[fade-in-soft_320ms_ease-out_forwards] items-center gap-2"
          style={{ animationDelay: "180ms" }}
        >
          <Button onClick={onDone} className="flex-1">
            Done
          </Button>
          <Button
            variant="outline"
            size="icon"
            disabled={sharing}
            onClick={async () => {
              if (!shareCardRef.current || sharing) return;
              setSharing(true);
              try {
                await shareProgressCard(shareCardRef.current, "untrained-effort-workout");
              } finally {
                setSharing(false);
              }
            }}
            aria-label="Share progress card"
          >
            <Share2 className="h-4 w-4" />
          </Button>
        </div>
      )}
      {/* Off-screen — never shown, only captured to an image on share.
          Needs real layout (not display:none) for html-to-image to
          measure it, so it's positioned far outside the viewport
          instead of hidden. */}
      <div style={{ position: "fixed", left: -9999, top: 0 }}>
        <ShareableProgressCard ref={shareCardRef} workout={summary} />
      </div>
    </div>
  );
}
