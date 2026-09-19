/**
 * Plate and warm-up calculator — reference-only maths for "what do I load"
 * and "how should I warm up", shown from a new calculator trigger on any
 * exercise that logs a weight (see WeightCalculator.tsx). Nothing here is
 * logged as a set; it's purely a computed suggestion, same spirit as the
 * existing expected-rep-range hint in LiveSession.
 *
 * Bar weight and available plates follow the same localStorage get/set
 * shape as bodyType.ts and units.ts: a couple of values that don't need a
 * Dexie table, migration, or backup/export entry. Canonical storage is
 * always kg, exactly like WorkoutSet.weight/RoutineSet.targetWeight — see
 * units.ts's doc comment for why. Defaults branch on the current weight
 * unit rather than converting a single canonical default, because a 45lb
 * bar and a 20kg bar are two different real pieces of equipment, not a
 * rounding of each other — same reasoning as their real-world plate sets
 * (45/35/25/10/5/2.5lb vs 25/20/15/10/5/2.5/1.25kg) not lining up either.
 */

import { getWeightUnit, lbToKg, type WeightUnit } from "./units";

const BAR_WEIGHT_KEY = "plateCalcBarWeightKg";
const AVAILABLE_PLATES_KEY = "plateCalcAvailablePlatesKg";

const DEFAULT_BAR_KG = 20;
const DEFAULT_BAR_LB = 45;

/** Standard plate sizes offered per unit system, in that unit's own
 *  numbers — what Settings shows as toggle options. */
export const DEFAULT_PLATE_OPTIONS: Record<WeightUnit, number[]> = {
  kg: [25, 20, 15, 10, 5, 2.5, 1.25],
  lb: [45, 35, 25, 10, 5, 2.5],
};

export function getBarWeightKg(): number {
  if (typeof window === "undefined") return DEFAULT_BAR_KG;
  const stored = window.localStorage.getItem(BAR_WEIGHT_KEY);
  if (stored !== null) {
    const n = parseFloat(stored);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return getWeightUnit() === "lb" ? lbToKg(DEFAULT_BAR_LB) : DEFAULT_BAR_KG;
}

export function setBarWeightKg(kg: number): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(BAR_WEIGHT_KEY, String(kg));
}

function isValidPlateArray(value: unknown): value is number[] {
  return (
    Array.isArray(value) && value.every((n) => typeof n === "number" && Number.isFinite(n) && n > 0)
  );
}

export function getAvailablePlatesKg(): number[] {
  if (typeof window === "undefined") return [...DEFAULT_PLATE_OPTIONS.kg];
  const stored = window.localStorage.getItem(AVAILABLE_PLATES_KEY);
  if (stored !== null) {
    try {
      const parsed: unknown = JSON.parse(stored);
      if (isValidPlateArray(parsed)) return parsed;
    } catch {
      // Malformed value (shouldn't happen from our own setter) — fall
      // through to the unit-appropriate default below.
    }
  }
  const unit = getWeightUnit();
  return unit === "lb" ? DEFAULT_PLATE_OPTIONS.lb.map(lbToKg) : [...DEFAULT_PLATE_OPTIONS.kg];
}

export function setAvailablePlatesKg(platesKg: number[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AVAILABLE_PLATES_KEY, JSON.stringify(platesKg));
}

export interface PlateLoadResult {
  /** Plates for ONE side of the bar, largest first, in kg. */
  perSideKg: number[];
  /** Bar + both sides' plates, in kg — may sit below `targetKg` when the
   *  available plates can't reach it exactly (see doc comment below). */
  achievedKg: number;
}

/**
 * Greedy largest-plate-first allocation for one side of the bar — the same
 * way anyone actually loads a barbell by hand. Assumes an unlimited supply
 * of each available size (not a fixed inventory/count) — simpler, and
 * matches how every mainstream tracker's version of this works.
 *
 * If the available plates can't reach the target exactly (a gap smaller
 * than the smallest plate, or a target below the bar itself), this
 * returns the closest total it can actually build rather than a set that
 * doesn't add up — never a plate combination that overshoots.
 */
export function calculatePlateLoad(
  targetKg: number,
  barKg: number,
  availablePlatesKg: number[],
): PlateLoadResult {
  const perSideNeeded = Math.max(0, (targetKg - barKg) / 2);
  const sorted = [...availablePlatesKg].filter((p) => p > 0).sort((a, b) => b - a);

  const perSideKg: number[] = [];
  let remaining = perSideNeeded;
  // Guards against float noise (e.g. needing exactly 2.5 after subtracting
  // a run of 0.1-imprecise values) causing a plate to be skipped by a
  // hair — never lets a plate through it doesn't actually fit.
  const EPSILON = 1e-6;
  for (const plate of sorted) {
    while (remaining + EPSILON >= plate) {
      perSideKg.push(plate);
      remaining -= plate;
    }
  }

  const achievedPerSide = perSideKg.reduce((sum, p) => sum + p, 0);
  return { perSideKg, achievedKg: barKg + achievedPerSide * 2 };
}

export interface WarmupSet {
  /** 0 for the bar-only step, otherwise the percent of `targetKg` this
   *  step is based on — kept for display ("Bar" vs "60%"). */
  percent: number;
  weightKg: number;
  reps: number;
}

const WARMUP_STEPS: { percent: number; reps: number }[] = [
  { percent: 40, reps: 8 },
  { percent: 60, reps: 5 },
  { percent: 80, reps: 3 },
  { percent: 90, reps: 1 },
];

/**
 * A standard percentage ramp up to `targetKg` — light-and-many reps at the
 * bottom, heavy-and-few near the top, always finishing below the working
 * weight rather than at or above it. Reference-only: these are suggested
 * numbers to load and do before your working sets, not sets that get
 * logged or added to the workout.
 *
 * `barKg` is optional and only meaningful for barbell exercises — pass it
 * to get a leading bar-only step; omit it (or pass 0) for dumbbell/
 * machine/cable/kettlebell exercises, which have no equivalent "empty bar"
 * step and ramp on percentage alone.
 *
 * Returns an empty array when there's nothing meaningful to suggest (no
 * target weight set yet, or a target so light every step would round up
 * to it or above).
 */
export function calculateWarmupSets(targetKg: number, barKg?: number): WarmupSet[] {
  const result: WarmupSet[] = [];
  const seen = new Set<number>();

  function tryAdd(percent: number, weightKg: number, reps: number) {
    const rounded = Math.round(weightKg * 100) / 100;
    if (rounded >= targetKg) return; // never suggest a "warm-up" at/above the actual working weight
    if (seen.has(rounded)) return; // e.g. bar weight already equals the 40% step for a light target
    seen.add(rounded);
    result.push({ percent, weightKg: rounded, reps });
  }

  if (barKg && barKg > 0) {
    tryAdd(0, barKg, 10);
  }

  for (const step of WARMUP_STEPS) {
    const raw = targetKg * (step.percent / 100);
    tryAdd(step.percent, barKg ? Math.max(barKg, raw) : raw, step.reps);
  }

  return result;
}
