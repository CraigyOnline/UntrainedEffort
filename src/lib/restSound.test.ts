import { describe, expect, it } from "vitest";
import { shouldPlayRestSound } from "@/lib/restSound";

describe("shouldPlayRestSound", () => {
  it("plays for a live transition with the app visible", () => {
    expect(shouldPlayRestSound(10_000, 10_100, true)).toBe(true);
  });

  it("still plays right at the lateness limit", () => {
    expect(shouldPlayRestSound(10_000, 12_000, true)).toBe(true);
  });

  it("stays quiet when the timer only catches up long after the rest ended", () => {
    expect(shouldPlayRestSound(10_000, 12_001, true)).toBe(false);
    expect(shouldPlayRestSound(10_000, 600_000, true)).toBe(false);
  });

  it("stays quiet while the app isn't visible, however on-time", () => {
    expect(shouldPlayRestSound(10_000, 10_100, false)).toBe(false);
  });
});
