import { describe, expect, it } from "vitest";
import { editSide } from "@/components/forms/UnilateralSetInputs";
import type { SetSide } from "@/lib/exercises";

const inSync: SetSide = { weight: 20, reps: 10 };
const diverged: SetSide = { weight: 20, reps: 8 };

describe("editSide", () => {
  describe("linked: undefined (never explicitly toggled)", () => {
    it("mirrors a primary edit onto secondary while the two are still equal", () => {
      const result = editSide(inSync, { ...inSync }, "primary", "weight", 22.5);
      expect(result).toEqual({
        primary: { weight: 22.5, reps: 10 },
        secondary: { weight: 22.5, reps: 10 },
      });
    });

    it("stops mirroring a primary edit once the two have diverged", () => {
      const result = editSide(inSync, diverged, "primary", "reps", 12);
      expect(result).toEqual({
        primary: { weight: 20, reps: 12 },
        secondary: diverged,
      });
    });

    it("never mirrors a secondary edit back onto primary", () => {
      const result = editSide(inSync, { ...inSync }, "secondary", "weight", 22.5);
      expect(result).toEqual({
        primary: inSync,
        secondary: { weight: 22.5, reps: 10 },
      });
    });
  });

  describe("linked: true (explicitly linked)", () => {
    it("mirrors a primary edit onto secondary even once they've already diverged", () => {
      const result = editSide(inSync, diverged, "primary", "reps", 12, true);
      expect(result).toEqual({
        primary: { weight: 20, reps: 12 },
        secondary: { weight: 20, reps: 12 },
      });
    });

    it("also mirrors a secondary edit back onto primary", () => {
      const result = editSide(inSync, diverged, "secondary", "reps", 12, true);
      expect(result).toEqual({
        primary: { weight: 20, reps: 12 },
        secondary: { weight: 20, reps: 12 },
      });
    });
  });

  describe("linked: false (explicitly unlinked)", () => {
    it("never mirrors a primary edit, even while the two currently match", () => {
      const result = editSide(inSync, { ...inSync }, "primary", "weight", 22.5, false);
      expect(result).toEqual({
        primary: { weight: 22.5, reps: 10 },
        secondary: inSync,
      });
    });

    it("never mirrors a secondary edit", () => {
      const result = editSide(inSync, { ...inSync }, "secondary", "weight", 22.5, false);
      expect(result).toEqual({
        primary: inSync,
        secondary: { weight: 22.5, reps: 10 },
      });
    });
  });
});
