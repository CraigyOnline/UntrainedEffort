import { getDb } from "@/lib/db";

/**
 * First-run onboarding — whether the person has already been through (or
 * skipped) the quick setup screen at /onboarding.
 *
 * Same storage approach as keepAwake.ts/haptics.ts/bodyType.ts: a single
 * boolean isn't worth a Dexie table/schema migration, so it lives in
 * localStorage. Unlike those, though, this flag can't just default to
 * "off" for anyone who's never set it: this key didn't exist before this
 * feature shipped, so an existing install updating from an older version
 * looks identical in localStorage to a brand new one — neither has ever
 * written this key. isLikelyFreshInstall() below, combined with
 * resolveLaunchDestination(), is how the launch screen tells the two
 * apart before deciding whether to show onboarding at all.
 */
const STORAGE_KEY = "onboardingComplete";

export function getOnboardingComplete(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(STORAGE_KEY) === "true";
}

export function setOnboardingComplete(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, "true");
}

/**
 * True only when there's no sign this install has ever been used — no
 * routines and no logged workouts. An update carries both forward; a
 * fresh install starts with neither.
 */
async function isLikelyFreshInstall(): Promise<boolean> {
  const db = getDb();
  const [routineCount, workoutCount] = await Promise.all([
    db.routines.count(),
    db.workouts.count(),
  ]);
  return routineCount === 0 && workoutCount === 0;
}

/**
 * Where the launch screen should send someone once its greeting has held
 * and it's ready to move on — see src/routes/index.tsx. Three cases:
 *
 *  - Onboarding already completed (or skipped) before → Overview, no DB
 *    check needed.
 *  - Never completed, and this install already has routines or
 *    workouts → this is an existing install updating to a version that
 *    added this screen, not a new user. Treated as already onboarded
 *    (and marked complete now) rather than surfacing setup questions for
 *    an app they've already set up.
 *  - Never completed, and genuinely no data yet → Onboarding.
 */
export async function resolveLaunchDestination(): Promise<"/onboarding" | "/overview"> {
  if (getOnboardingComplete()) return "/overview";

  const fresh = await isLikelyFreshInstall();
  if (!fresh) {
    setOnboardingComplete();
    return "/overview";
  }

  return "/onboarding";
}
