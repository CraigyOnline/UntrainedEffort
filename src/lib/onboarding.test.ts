// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import {
  getOnboardingComplete,
  resolveLaunchDestination,
  setOnboardingComplete,
} from "@/lib/onboarding";

beforeEach(async () => {
  window.localStorage.clear();
  const db = getDb();
  await db.routines.clear();
  await db.workouts.clear();
});

describe("resolveLaunchDestination", () => {
  it("goes straight to Overview once onboarding has already been completed", async () => {
    setOnboardingComplete();
    expect(await resolveLaunchDestination()).toBe("/overview");
  });

  it("sends a genuinely fresh install — no routines, no workouts — to Onboarding", async () => {
    expect(await resolveLaunchDestination()).toBe("/onboarding");
  });

  it("treats an install with an existing routine as already onboarded, and marks it complete", async () => {
    const db = getDb();
    await db.routines.add({ name: "Push Day", exercises: [], createdAt: 0 });

    expect(await resolveLaunchDestination()).toBe("/overview");
    expect(getOnboardingComplete()).toBe(true);
  });

  it("treats an install with an existing workout (but no routines) as already onboarded", async () => {
    const db = getDb();
    await db.workouts.add({
      name: "Workout",
      startedAt: 0,
      endedAt: 0,
      durationSec: 0,
      exercises: [],
    });

    expect(await resolveLaunchDestination()).toBe("/overview");
  });
});
