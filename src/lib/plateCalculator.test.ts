// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  getBarWeightKg,
  setBarWeightKg,
  getAvailablePlatesKg,
  setAvailablePlatesKg,
  calculatePlateLoad,
  calculateWarmupSets,
  DEFAULT_PLATE_OPTIONS,
} from "@/lib/plateCalculator";
import { setWeightUnit, lbToKg } from "@/lib/units";

beforeEach(() => {
  window.localStorage.clear();
});

describe("getBarWeightKg / setBarWeightKg", () => {
  it("defaults to a 20kg bar when the weight unit is kg", () => {
    setWeightUnit("kg");
    expect(getBarWeightKg()).toBe(20);
  });

  it("defaults to a 45lb bar (converted to kg) when the weight unit is lb — not a rounded 20kg", () => {
    setWeightUnit("lb");
    expect(getBarWeightKg()).toBeCloseTo(lbToKg(45), 6);
  });

  it("round-trips a configured value regardless of the current display unit", () => {
    setBarWeightKg(15);
    expect(getBarWeightKg()).toBe(15);
    setWeightUnit("lb");
    expect(getBarWeightKg()).toBe(15); // canonical kg, unaffected by display-unit switches
  });

  it("falls back to the unit default for anything invalid sitting in storage", () => {
    window.localStorage.setItem("plateCalcBarWeightKg", "not-a-number");
    setWeightUnit("kg");
    expect(getBarWeightKg()).toBe(20);
  });
});

describe("getAvailablePlatesKg / setAvailablePlatesKg", () => {
  it("defaults to the standard kg plate set when the weight unit is kg", () => {
    setWeightUnit("kg");
    expect(getAvailablePlatesKg()).toEqual(DEFAULT_PLATE_OPTIONS.kg);
  });

  it("defaults to the standard lb plate set (converted to kg) when the weight unit is lb", () => {
    setWeightUnit("lb");
    const plates = getAvailablePlatesKg();
    expect(plates).toHaveLength(DEFAULT_PLATE_OPTIONS.lb.length);
    expect(plates[0]).toBeCloseTo(lbToKg(45), 6);
  });

  it("round-trips a configured set through localStorage", () => {
    setAvailablePlatesKg([20, 10, 5]);
    expect(getAvailablePlatesKg()).toEqual([20, 10, 5]);
  });

  it("falls back to the unit default for malformed JSON already sitting in storage", () => {
    window.localStorage.setItem("plateCalcAvailablePlatesKg", "{not json");
    setWeightUnit("kg");
    expect(getAvailablePlatesKg()).toEqual(DEFAULT_PLATE_OPTIONS.kg);
  });
});

describe("calculatePlateLoad", () => {
  const standardKgPlates = DEFAULT_PLATE_OPTIONS.kg;

  it("splits an exactly-reachable target evenly, largest plates first", () => {
    // 100kg target, 20kg bar -> 40kg per side -> 25 + 15
    const result = calculatePlateLoad(100, 20, standardKgPlates);
    expect(result.perSideKg).toEqual([25, 15]);
    expect(result.achievedKg).toBe(100);
  });

  it("returns just the bar with no plates when the target equals the bar weight", () => {
    const result = calculatePlateLoad(20, 20, standardKgPlates);
    expect(result.perSideKg).toEqual([]);
    expect(result.achievedKg).toBe(20);
  });

  it("never returns a set of plates that overshoots an unreachable target", () => {
    // 21kg target, 20kg bar -> 0.5kg per side, smaller than any available plate
    const result = calculatePlateLoad(21, 20, standardKgPlates);
    expect(result.perSideKg).toEqual([]);
    expect(result.achievedKg).toBeLessThanOrEqual(21);
  });

  it("treats a target below the bar weight as bar-only rather than a negative load", () => {
    const result = calculatePlateLoad(10, 20, standardKgPlates);
    expect(result.perSideKg).toEqual([]);
    expect(result.achievedKg).toBe(20);
  });

  it("uses only the plates it's told are available", () => {
    // 140kg target, 20kg bar -> 60kg per side. The full standard set would
    // reach for a 25, but this rack only has 20s and 10s, so it should
    // fall back to three 20s rather than inventing a plate that isn't there.
    const result = calculatePlateLoad(140, 20, [20, 10]);
    expect(result.perSideKg).toEqual([20, 20, 20]);
    expect(result.achievedKg).toBe(140);
  });
});

describe("calculateWarmupSets", () => {
  it("includes a bar-only first step when a bar weight is given", () => {
    const sets = calculateWarmupSets(100, 20);
    expect(sets[0]).toEqual({ percent: 0, weightKg: 20, reps: 10 });
  });

  it("omits the bar-only step for non-barbell exercises (no bar weight given)", () => {
    const sets = calculateWarmupSets(40);
    expect(sets.every((s) => s.percent !== 0)).toBe(true);
  });

  it("never suggests a step at or above the working weight", () => {
    const sets = calculateWarmupSets(100, 20);
    expect(sets.every((s) => s.weightKg < 100)).toBe(true);
  });

  it("ramps up through increasing weight and decreasing reps", () => {
    const sets = calculateWarmupSets(100, 20);
    for (let i = 1; i < sets.length; i++) {
      expect(sets[i].weightKg).toBeGreaterThan(sets[i - 1].weightKg);
      expect(sets[i].reps).toBeLessThanOrEqual(sets[i - 1].reps);
    }
  });

  it("de-duplicates a step that rounds to the same weight as the bar", () => {
    // Bar (20) already exceeds 40% and 60% of a light 40kg target, so
    // those percentage steps collapse into the single bar-only row.
    const sets = calculateWarmupSets(40, 20);
    const weights = sets.map((s) => s.weightKg);
    expect(new Set(weights).size).toBe(weights.length);
  });

  it("returns an empty list when there's no target weight to ramp toward", () => {
    expect(calculateWarmupSets(0, 20)).toEqual([]);
  });
});
