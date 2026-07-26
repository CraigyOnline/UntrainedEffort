import { getDb } from "@/lib/db";

/**
 * The home screen's opening greeting — the counterpart to
 * completionMessages.ts, shown before a workout instead of after one.
 * Same spirit: always warm, always encouraging, never guilt-inducing
 * regardless of how long it's been or how training has gone lately.
 * "Reward first" has a mirror image here — this is the app saying
 * hello, not setting expectations.
 *
 * Deliberately NOT sharing code with completionMessages.ts, beyond the
 * concept (small rotating pools, deterministic selection, priority-
 * ordered contextual signals). The two systems are independent on
 * purpose — pickIndex/DAY_MS/WEEK_MS below are small enough that
 * duplicating them here outweighs the risk of touching the completion
 * system for a marginal de-duplication win.
 *
 * The rotation key is the day-of-year integer (see ProfilePage's own
 * previous message logic, which already used this exact value) rather
 * than a per-event id like completionMessages.ts uses — a greeting
 * should stay stable for the whole day rather than change every time
 * the app happens to be reopened.
 *
 * Every contextual message stays positive — there is deliberately no
 * signal anywhere in this file that produces a message referencing a
 * missed workout, a broken streak, or time away as something to feel
 * bad about. The only directions a context can move the choice are
 * toward a specific encouraging line or toward the (already warm)
 * default pool.
 */

export type HomeGreetingKind =
  | "workout-active"
  | "first-workout"
  | "streak"
  | "momentum"
  | "yesterday"
  | "few-days"
  | "longer-break"
  | "default";

export interface HomeGreeting {
  headline: string;
  kind: HomeGreetingKind;
}

const ACTIVE_WORKOUT_MESSAGES = [
  "Welcome back. Let's finish what you started.",
  "Your workout's still going — ready to pick it back up?",
  "Let's get back to it.",
  "Right where you left off.",
  "Still mid-session — let's finish strong.",
  "Back to it — you're not done yet.",
];

const FIRST_WORKOUT_MESSAGES = [
  "Welcome to Untrained Effort. Let's get started.",
  "Ready for your first session?",
  "Every journey starts with one workout.",
  "Let's begin.",
  "Your first session is waiting whenever you're ready.",
  "Time to get started.",
];

const YESTERDAY_MESSAGES = [
  "Welcome back. Recovery done?",
  "Good to see you again so soon.",
  "Back again — that's the way to do it.",
  "Ready to build on yesterday?",
  "Yesterday's work is in the bank.",
  "Good to have you back so quickly.",
];

const FEW_DAYS_MESSAGES = [
  "Great to see you again. Let's build some momentum.",
  "Good to have you back.",
  "Let's get back into it.",
  "Ready to pick things back up?",
  "Glad you're here — let's make today count.",
  "Time to get moving again.",
];

const LONGER_BREAK_MESSAGES = [
  "Welcome back. It's good to have you here.",
  "Glad you're back — let's ease back in.",
  "Good to see you again.",
  "Welcome back. No pressure, just start where you are.",
  "It's been a while — good to have you back.",
  "Welcome back. Let's begin again.",
];

const STREAK_MESSAGES = [
  "You're building something worthwhile. Keep it going.",
  "Real consistency lately. Keep it up.",
  "You've been showing up week after week.",
  "That's a strong run — let's keep it alive.",
  "Steady weeks in a row. Nice work.",
  "You're on a good run — let's continue it.",
];

const MOMENTUM_MESSAGES = [
  "You're on a roll. Ready for another one?",
  "Strong week so far — let's keep going.",
  "You've been putting in real work this week.",
  "Good week so far. Let's add to it.",
  "This week's been a good one for you.",
  "You're building real momentum right now.",
];

const DEFAULT_MESSAGES = [
  "Ready when you are.",
  "Let's make today count.",
  "Good to see you.",
  "Every workout starts with showing up.",
  "Whenever you're ready.",
  "Glad you're here.",
  "Let's get to work.",
  "Good to have you back.",
];

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/** Calendar-day index in UTC — "yesterday" means the UTC calendar day
 *  before today, not merely "less than 48 hours ago." Matches the plain,
 *  timezone-simple bucketing approach completionMessages.ts also uses,
 *  independently defined here rather than imported (see file header). */
function dayIndex(ms: number): number {
  return Math.floor(ms / DAY_MS);
}

function weekIndex(ms: number): number {
  return Math.floor(ms / WEEK_MS);
}

/** Deterministic (not random) pool index, cycled by the day-of-year —
 *  so the greeting stays the same all day rather than changing on every
 *  app open, while still varying day to day. */
function pickIndex(poolLength: number, dayKey: number): number {
  return ((dayKey % poolLength) + poolLength) % poolLength;
}

export async function selectHomeGreeting(): Promise<HomeGreeting> {
  const db = getDb();
  const now = Date.now();
  const dayKey = dayIndex(now);
  const pick = (pool: string[]) => pool[pickIndex(pool.length, dayKey)];

  // Highest priority: a workout is literally waiting to be resumed —
  // more immediately relevant than anything about training history.
  const hasActiveWorkout = (await db.activeWorkout.toCollection().count()) > 0;
  if (hasActiveWorkout) {
    return { headline: pick(ACTIVE_WORKOUT_MESSAGES), kind: "workout-active" };
  }

  const lastWorkout = await db.workouts.orderBy("startedAt").reverse().first();
  if (!lastWorkout) {
    return { headline: pick(FIRST_WORKOUT_MESSAGES), kind: "first-workout" };
  }

  // Bounded recent window for the streak/weekly-count signals below —
  // same reasoning as completionMessages.ts's own 90-day window: enough
  // history for these signals without loading everything ever for a
  // single line of text. The true last-workout lookup above is
  // deliberately unbounded so a long-gap return isn't ever misread as
  // "no history at all" just because it falls outside this window.
  const since = now - 90 * DAY_MS;
  const recent = await db.workouts
    .where("startedAt")
    .between(since, now, true, true)
    .sortBy("startedAt");

  // Weekly consistency streak: consecutive weeks with at least one
  // workout, counted backward from *last* week rather than this one —
  // the user hasn't necessarily trained yet today, so this week
  // shouldn't need a workout already logged to count toward it.
  const weeksWithWorkout = new Set(recent.map((w) => weekIndex(w.startedAt)));
  let streak = 0;
  let cursor = weekIndex(now) - 1;
  while (weeksWithWorkout.has(cursor)) {
    streak += 1;
    cursor -= 1;
  }
  if (streak >= 3) {
    return { headline: pick(STREAK_MESSAGES), kind: "streak" };
  }

  const workoutsThisWeek = recent.filter((w) => now - w.startedAt < WEEK_MS).length;
  if (workoutsThisWeek >= 3) {
    return { headline: pick(MOMENTUM_MESSAGES), kind: "momentum" };
  }

  const daysSince = dayIndex(now) - dayIndex(lastWorkout.endedAt);
  if (daysSince <= 0) {
    // Already trained today — a "returning" framing would be slightly
    // off, so this falls to the plain default pool rather than its own
    // dedicated one; nothing in the brief asked for a same-day case.
    return { headline: pick(DEFAULT_MESSAGES), kind: "default" };
  }
  if (daysSince === 1) {
    return { headline: pick(YESTERDAY_MESSAGES), kind: "yesterday" };
  }
  if (daysSince <= 6) {
    return { headline: pick(FEW_DAYS_MESSAGES), kind: "few-days" };
  }
  return { headline: pick(LONGER_BREAK_MESSAGES), kind: "longer-break" };
}
