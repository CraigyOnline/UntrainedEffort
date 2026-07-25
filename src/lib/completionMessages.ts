import { getDb, type Workout } from "@/lib/db";
import { computeWorkoutStats } from "@/lib/workoutStats";

/**
 * The Workout Complete screen's opening acknowledgment — a single line of
 * text, meant to be shown alone before any statistics or breakdown appear.
 * This replaces "report the workout" with "recognise the effort": it has
 * to say something genuine on every single completed workout, not just
 * the rare one that happens to include a new PR.
 *
 * Selection is priority-ordered, roughly by rarity/significance, and stops
 * at the first contextual signal that applies — one line, not a checklist.
 * If nothing contextual applies, it falls back to the universal pool,
 * which is the actual floor every workout gets, not a lesser option.
 * Nothing here ever produces a negative or apologetic message; a short,
 * light, or deload session gets the exact same warm baseline as a
 * personal-best day. There is deliberately no signal anywhere in this file
 * that produces a message based on a workout being "not enough" — the
 * only directions a session can move the choice are toward a contextual
 * highlight or toward the (already warm) universal pool.
 *
 * Two signals are deliberately distinct even though they sound similar:
 * "tenure" recognises someone who has trained consistently over months or
 * years (even with occasional missed weeks), while "streak" recognises an
 * unbroken run of recent weeks. A real gap since the last workout always
 * overrides tenure — someone returning after a break gets the warm
 * welcome-back message, not a line that glosses over the gap they just
 * came back from.
 *
 * Every contextual message pairs its factual observation with an actual
 * word or two of recognition — "3 weeks of consistency" on its own is a
 * statistic, not encouragement. Keep that pairing when adding messages.
 *
 * Every signal — including the contextual ones, not just the universal
 * fallback — rotates through a small pool of phrasings (deterministic by
 * workout id, not random). A signal that keeps firing the same way (e.g.
 * a streak sitting at "3 weeks" across several workouts in the same
 * week) would otherwise show the exact same sentence every time, which
 * reads as a canned notification rather than genuine recognition.
 */

export type CompletionMessageKind =
  | "pr"
  | "tenure"
  | "streak"
  | "weekly-frequency"
  | "welcome-back"
  | "longest-session"
  | "more-volume"
  | "universal";

export interface CompletionMessage {
  headline: string;
  /** Which signal produced this. Not shown to the user — a later phase's
   *  visual treatment may want to key off it (e.g. a PR reads differently
   *  from a streak), so it's carried alongside the text rather than
   *  thrown away after selection. */
  kind: CompletionMessageKind;
}

const UNIVERSAL_MESSAGES = [
  "Nice work.",
  "Workout complete.",
  "Another session in the bank.",
  "Well done.",
  "Every workout counts.",
  "One step stronger.",
  "Progress is built one workout at a time.",
  "Keep showing up.",
  "Consistency wins.",
  "You're investing in yourself today.",
];

const WELCOME_BACK_MESSAGES = [
  "It's great to see you again.",
  "Good to have you back.",
  "Welcome back — let's pick up where you left off.",
  "Glad you're back.",
];

const STREAK_MESSAGES: Array<(weeks: number) => string> = [
  (n) => `${n} weeks of consistency — well earned.`,
  (n) => `${n} weeks running. That's real discipline.`,
  (n) => `${n} weeks in a row — you're building something.`,
];

const WEEKLY_FREQUENCY_MESSAGES = [
  "You're building real momentum this week.",
  "Three sessions this week — that's serious commitment.",
  "This week's been a strong one for you.",
];

const LONGEST_SESSION_MESSAGES = [
  "Your biggest session this month — strong work.",
  "That's your toughest session this month. Well earned.",
  "Biggest effort this month, right there.",
];

const MORE_VOLUME_MESSAGES = [
  "More work than last time — nice progress.",
  "You pushed harder than last time.",
  "That's more than last time. Progress noted.",
];

const TENURE_YEARS_MESSAGES: Array<(span: string) => string> = [
  (span) => `${span} of showing up. That adds up.`,
  (span) => `${span} in. That's real dedication.`,
  (span) => `${span} of training — that's a real commitment.`,
];

const TENURE_SIX_MONTHS_MESSAGES = [
  "Six months of consistency. That adds up.",
  "Half a year of showing up. That's real commitment.",
];

const TENURE_THREE_MONTHS_MESSAGES = [
  "Three months in — a real habit now.",
  "Three months of consistency. That's sticking with it.",
];

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/** Rolling week index since the Unix epoch, in UTC — used only to bucket
 *  workouts into "which week" for the streak/frequency signals below.
 *  Rolling 7-day buckets rather than true ISO calendar weeks: simpler,
 *  avoids timezone/locale edge cases, and close enough for an encouraging
 *  message rather than anything needing calendar precision. */
function weekIndex(ms: number): number {
  return Math.floor(ms / WEEK_MS);
}

/** Deterministic (not random) pool index, cycled by workout id — so
 *  repeated triggers of the same signal (e.g. a multi-week streak that
 *  stays at "3 weeks" across several workouts in the same week) don't
 *  always show verbatim identical text, while staying testable/
 *  reproducible rather than depending on Math.random(). */
function pickIndex(poolLength: number, id: number | undefined): number {
  return id ? id % poolLength : 0;
}

/**
 * Picks the single opening acknowledgment for a just-finished workout.
 * `justFinished` must already be saved (have an id) — it's included in its
 * own history window so every signal below can filter it out explicitly
 * and compare only against what came *before* it.
 */
export async function selectCompletionMessage(
  justFinished: Workout,
  hasPR: boolean,
): Promise<CompletionMessage> {
  if (hasPR) {
    return { headline: "New Personal Best!", kind: "pr" };
  }

  const db = getDb();
  // Most signals only need a bounded recent window — 90 days comfortably
  // covers streaks, weekly counts, this month, and the last session,
  // without loading someone's entire multi-year history for a single
  // encouraging line of text.
  const since = justFinished.startedAt - 90 * DAY_MS;
  const recent = await db.workouts
    .where("startedAt")
    .between(since, justFinished.startedAt, true, true)
    .sortBy("startedAt");
  const history = recent.filter((w) => w.id !== justFinished.id);
  const previous = history.at(-1);

  const gapSincePrevious = previous ? justFinished.startedAt - previous.endedAt : Infinity;

  // ── Long-term training tenure ────────────────────────────────────────────
  // Distinct from the unbroken weekly streak below: someone who trains a
  // few times a week for months — even with the occasional missed week —
  // still deserves recognition for how long they've stuck with this. Uses
  // the very first workout ever recorded, not the bounded 90-day window
  // above, since tenure is exactly the thing that window is too short to
  // see. Requires a reasonable average pace (roughly a workout every ~10
  // days or better across the whole tenure) so a single workout a year ago
  // followed by today's doesn't count as "tenure" — that's welcome-back's
  // job below. Also requires no current gap: someone with six months of
  // history who just came back from a three-month break should get the
  // warm welcome-back message, not a tenure line that glosses over the
  // gap they just returned from — an actual gap always wins over
  // historical tenure.
  const firstEver = await db.workouts.orderBy("startedAt").first();
  if (firstEver && firstEver.id !== justFinished.id && gapSincePrevious < WEEK_MS) {
    const tenureDays = (justFinished.startedAt - firstEver.startedAt) / DAY_MS;
    const totalWorkouts = await db.workouts.count();
    if (tenureDays >= 90 && totalWorkouts >= tenureDays / 10) {
      if (tenureDays >= 365) {
        const years = Math.floor(tenureDays / 365);
        const span = years === 1 ? "A year" : `${years} years`;
        const idx = pickIndex(TENURE_YEARS_MESSAGES.length, justFinished.id);
        return { headline: TENURE_YEARS_MESSAGES[idx](span), kind: "tenure" };
      }
      if (tenureDays >= 180) {
        const idx = pickIndex(TENURE_SIX_MONTHS_MESSAGES.length, justFinished.id);
        return { headline: TENURE_SIX_MONTHS_MESSAGES[idx], kind: "tenure" };
      }
      const idx = pickIndex(TENURE_THREE_MONTHS_MESSAGES.length, justFinished.id);
      return { headline: TENURE_THREE_MONTHS_MESSAGES[idx], kind: "tenure" };
    }
  }

  // ── Weekly consistency streak ──────────────────────────────────────────
  const weeksWithWorkout = new Set(history.map((w) => weekIndex(w.startedAt)));
  weeksWithWorkout.add(weekIndex(justFinished.startedAt));
  let streak = 0;
  let cursor = weekIndex(justFinished.startedAt);
  while (weeksWithWorkout.has(cursor)) {
    streak += 1;
    cursor -= 1;
  }
  if (streak >= 3) {
    const idx = pickIndex(STREAK_MESSAGES.length, justFinished.id);
    return { headline: STREAK_MESSAGES[idx](streak), kind: "streak" };
  }

  // ── Workouts in the trailing 7 days, including this one ────────────────
  const workoutsThisWeek =
    history.filter((w) => justFinished.startedAt - w.startedAt < WEEK_MS).length + 1;
  if (workoutsThisWeek >= 3) {
    const idx = pickIndex(WEEKLY_FREQUENCY_MESSAGES.length, justFinished.id);
    return { headline: WEEKLY_FREQUENCY_MESSAGES[idx], kind: "weekly-frequency" };
  }

  // ── Welcome back ────────────────────────────────────────────────────────
  if (previous && gapSincePrevious >= WEEK_MS) {
    const idx = pickIndex(WELCOME_BACK_MESSAGES.length, justFinished.id);
    return { headline: WELCOME_BACK_MESSAGES[idx], kind: "welcome-back" };
  }

  // ── Longest session this calendar month ─────────────────────────────────
  const monthStart = (() => {
    const d = new Date(justFinished.startedAt);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  })();
  const thisMonth = history.filter((w) => w.startedAt >= monthStart);
  if (
    thisMonth.length > 0 &&
    justFinished.durationSec > Math.max(...thisMonth.map((w) => w.durationSec))
  ) {
    const idx = pickIndex(LONGEST_SESSION_MESSAGES.length, justFinished.id);
    return { headline: LONGEST_SESSION_MESSAGES[idx], kind: "longest-session" };
  }

  // ── More volume than the last comparable session ────────────────────────
  // Prefers the last workout on the same routine (a fairer like-for-like
  // comparison) and falls back to the last workout overall when this one
  // isn't tied to a routine or has no prior instance of it yet.
  const lastComparable =
    (justFinished.routineId !== undefined
      ? history.filter((w) => w.routineId === justFinished.routineId).at(-1)
      : undefined) ?? previous;
  if (lastComparable) {
    const thisVolume = computeWorkoutStats(justFinished.exercises).totalVolume;
    const lastVolume = computeWorkoutStats(lastComparable.exercises).totalVolume;
    if (lastVolume > 0 && thisVolume > lastVolume) {
      const idx = pickIndex(MORE_VOLUME_MESSAGES.length, justFinished.id);
      return { headline: MORE_VOLUME_MESSAGES[idx], kind: "more-volume" };
    }
  }

  // ── Fallback: universal pool ─────────────────────────────────────────────
  const index = pickIndex(UNIVERSAL_MESSAGES.length, justFinished.id);
  return { headline: UNIVERSAL_MESSAGES[index], kind: "universal" };
}
