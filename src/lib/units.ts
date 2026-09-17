/**
 * User-selectable weight and distance units — kg/lb and km/mi. Follows the
 * same localStorage get/set shape as bodyType.ts and the rest of Settings'
 * preferences (see that file's doc comment for why localStorage rather than
 * Dexie: this is app-level configuration, not workout data, so it doesn't
 * need to be queryable, exported in backups, or synced).
 *
 * Canonical storage never changes: WorkoutSet.weight/RoutineSet.targetWeight/
 * PRRecord.value stay in kg always, and a "km"-distanceUnit cardio exercise's
 * distance stays in km always, regardless of what's selected here. These
 * preferences only affect the number shown to and typed by the user — every
 * comparison, aggregate, and progression/PR calculation keeps operating on
 * the stored canonical value exactly as it did before this file existed, so
 * there's no Dexie migration and no risk to that math.
 *
 * "m" and "floors" distanceUnit exercises (rowing, swimming, stair
 * climbing) are never affected by DistanceSystem, even when it's "mi" — a
 * rowing erg always displays metres and a flight of stairs is just a
 * count, regardless of locale. See formatDistanceValue in exercises.ts.
 */

export type WeightUnit = "kg" | "lb";
export type DistanceSystem = "km" | "mi";

const WEIGHT_UNIT_KEY = "weightUnit";
const DISTANCE_SYSTEM_KEY = "distanceSystem";

export function getWeightUnit(): WeightUnit {
  if (typeof window === "undefined") return "kg";
  return window.localStorage.getItem(WEIGHT_UNIT_KEY) === "lb" ? "lb" : "kg";
}

export function setWeightUnit(unit: WeightUnit): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(WEIGHT_UNIT_KEY, unit);
}

export function getDistanceSystem(): DistanceSystem {
  if (typeof window === "undefined") return "km";
  return window.localStorage.getItem(DISTANCE_SYSTEM_KEY) === "mi" ? "mi" : "km";
}

export function setDistanceSystem(system: DistanceSystem): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DISTANCE_SYSTEM_KEY, system);
}

// Exact international conversion factors (NIST Handbook 44) — not
// approximations, so repeated round-trips don't drift.
export const KG_PER_LB = 0.45359237;
export const KM_PER_MILE = 1.609344;

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Rounds to the nearest 0.5 — the granularity lb values are shown and
 *  stepped at. Chosen as a middle ground: whole-lb loses too much
 *  precision, a full decimal place implies more accuracy than kg's own
 *  2.5kg steps ever claimed either. */
function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

export function kgToLb(kg: number): number {
  return kg / KG_PER_LB;
}

export function lbToKg(lb: number): number {
  return lb * KG_PER_LB;
}

export function kmToMi(km: number): number {
  return km / KM_PER_MILE;
}

export function miToKm(mi: number): number {
  return mi * KM_PER_MILE;
}

export function weightUnitLabel(unit: WeightUnit): string {
  return unit === "lb" ? "Lb" : "Kg";
}

/** Converts a canonical kg value to the number a stepper should show for
 *  the given unit — kg passes straight through; lb rounds to the nearest
 *  0.5 so a value entered in one unit round-trips to the same displayed
 *  number instead of drifting by a fraction on every open/close. */
export function kgToDisplayWeight(kg: number, unit: WeightUnit): number {
  return unit === "lb" ? roundToHalf(kgToLb(kg)) : kg;
}

/** Converts a stepper's displayed value (already in the user's unit) back
 *  to kg for storage. */
export function displayWeightToKg(value: number, unit: WeightUnit): number {
  return unit === "lb" ? lbToKg(value) : value;
}

/** Formats a canonical kg value for display, in the user's chosen unit. */
export function formatWeight(kg: number, unit: WeightUnit): string {
  return unit === "lb" ? `${roundToHalf(kgToLb(kg))}lb` : `${kg}kg`;
}

/** Same conversion as formatWeight, but comma-grouped with a space before
 *  a lowercase unit ("1,234 kg") rather than a single set's tightly-glued
 *  weight ("70kg") — matching the app's existing distinction between a
 *  logged weight and a total-volume stat. Callers should still round `kg`
 *  themselves first, same as before this file existed — this only
 *  converts and formats, it doesn't decide precision. */
export function formatVolume(kg: number, unit: WeightUnit): string {
  return `${kgToDisplayWeight(kg, unit).toLocaleString()} ${weightUnitLabel(unit).toLowerCase()}`;
}

/** Mirrors exercises.ts's getDistanceStepperConfig — one source of truth
 *  so a weight stepper can't drift out of sync with what each unit
 *  actually looks like on a set of plates. */
export function getWeightStepperConfig(unit: WeightUnit): { step: number; decimal: boolean } {
  return unit === "lb" ? { step: 0.5, decimal: true } : { step: 2.5, decimal: true };
}

// ---- Distance (km/mi) — only ever applies where the exercise's own
// distanceUnit is "km". "m" and "floors" exercises never consult this.

export function distanceSystemLabel(system: DistanceSystem): string {
  return system === "mi" ? "Mi" : "Km";
}

/** Converts a canonical km value to the number a stepper should show —
 *  mirrors kgToDisplayWeight. Rounded to 0.1 to match the granularity the
 *  km stepper already steps by (getDistanceStepperConfig's "km" case). */
export function kmToDisplayDistance(km: number, system: DistanceSystem): number {
  return system === "mi" ? roundTo(kmToMi(km), 1) : km;
}

/** Converts a stepper's displayed value (already in the user's system)
 *  back to km for storage. */
export function displayDistanceToKm(value: number, system: DistanceSystem): number {
  return system === "mi" ? miToKm(value) : value;
}
