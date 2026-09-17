// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  getWeightUnit,
  setWeightUnit,
  getDistanceSystem,
  setDistanceSystem,
  kgToLb,
  lbToKg,
  kmToMi,
  miToKm,
  weightUnitLabel,
  distanceSystemLabel,
  kgToDisplayWeight,
  displayWeightToKg,
  formatWeight,
  formatVolume,
  getWeightStepperConfig,
  kmToDisplayDistance,
  displayDistanceToKm,
} from "@/lib/units";

beforeEach(() => {
  window.localStorage.clear();
});

describe("getWeightUnit / setWeightUnit", () => {
  it("defaults to kg — every workout logged before this feature existed is in kg", () => {
    expect(getWeightUnit()).toBe("kg");
  });

  it("round-trips through localStorage", () => {
    setWeightUnit("lb");
    expect(getWeightUnit()).toBe("lb");
    setWeightUnit("kg");
    expect(getWeightUnit()).toBe("kg");
  });

  it("falls back to kg for anything unexpected already sitting in storage", () => {
    window.localStorage.setItem("weightUnit", "stone");
    expect(getWeightUnit()).toBe("kg");
  });
});

describe("getDistanceSystem / setDistanceSystem", () => {
  it("defaults to km", () => {
    expect(getDistanceSystem()).toBe("km");
  });

  it("round-trips through localStorage", () => {
    setDistanceSystem("mi");
    expect(getDistanceSystem()).toBe("mi");
    setDistanceSystem("km");
    expect(getDistanceSystem()).toBe("km");
  });
});

describe("kgToLb / lbToKg", () => {
  it("matches the known conversion", () => {
    expect(kgToLb(1)).toBeCloseTo(2.20462, 4);
    expect(lbToKg(1)).toBeCloseTo(0.453592, 4);
  });

  it("round-trips within floating-point precision", () => {
    expect(lbToKg(kgToLb(83.5))).toBeCloseTo(83.5, 9);
  });
});

describe("kmToMi / miToKm", () => {
  it("matches the known conversion", () => {
    expect(kmToMi(1)).toBeCloseTo(0.62137, 4);
    expect(miToKm(1)).toBeCloseTo(1.60934, 4);
  });

  it("round-trips within floating-point precision", () => {
    expect(miToKm(kmToMi(21.1))).toBeCloseTo(21.1, 9);
  });
});

describe("weightUnitLabel / distanceSystemLabel", () => {
  it("labels each unit", () => {
    expect(weightUnitLabel("kg")).toBe("Kg");
    expect(weightUnitLabel("lb")).toBe("Lb");
    expect(distanceSystemLabel("km")).toBe("Km");
    expect(distanceSystemLabel("mi")).toBe("Mi");
  });
});

describe("kgToDisplayWeight / displayWeightToKg", () => {
  it("passes kg straight through", () => {
    expect(kgToDisplayWeight(60, "kg")).toBe(60);
    expect(displayWeightToKg(60, "kg")).toBe(60);
  });

  it("converts to lb and rounds to the nearest 0.5", () => {
    // 60kg is ~132.277lb — should round to the nearest half pound.
    expect(kgToDisplayWeight(60, "lb")).toBe(132.5);
  });

  it("round-trips a value entered in lb back through kg without drifting", () => {
    const enteredLb = 135;
    const storedKg = displayWeightToKg(enteredLb, "lb");
    expect(kgToDisplayWeight(storedKg, "lb")).toBe(enteredLb);
  });
});

describe("formatWeight", () => {
  it("formats kg with no conversion", () => {
    expect(formatWeight(70, "kg")).toBe("70kg");
  });

  it("formats lb converted and rounded to the nearest 0.5", () => {
    expect(formatWeight(70, "lb")).toBe("154.5lb");
  });
});

describe("formatVolume", () => {
  it("comma-groups large kg totals with a spaced, lowercase unit", () => {
    expect(formatVolume(12345, "kg")).toBe("12,345 kg");
  });

  it("converts and comma-groups for lb", () => {
    expect(formatVolume(12345, "lb")).toBe("27,216 lb");
  });
});

describe("getWeightStepperConfig", () => {
  it("keeps kg's existing 2.5kg step", () => {
    expect(getWeightStepperConfig("kg")).toEqual({ step: 2.5, decimal: true });
  });

  it("uses a 0.5lb step", () => {
    expect(getWeightStepperConfig("lb")).toEqual({ step: 0.5, decimal: true });
  });
});

describe("kmToDisplayDistance / displayDistanceToKm", () => {
  it("passes km straight through", () => {
    expect(kmToDisplayDistance(5, "km")).toBe(5);
    expect(displayDistanceToKm(5, "km")).toBe(5);
  });

  it("converts to mi rounded to one decimal", () => {
    // 5km is ~3.107mi.
    expect(kmToDisplayDistance(5, "mi")).toBe(3.1);
  });

  it("converts a mi value back to km for storage", () => {
    expect(displayDistanceToKm(3.1, "mi")).toBeCloseTo(4.98895, 4);
  });
});
