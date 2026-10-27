import { afterEach, describe, expect, it } from "vitest";
import { addCalendarDays, getCalendarWeekStart } from "./format";

const originalTZ = process.env.TZ;

afterEach(() => {
  if (originalTZ === undefined) delete process.env.TZ;
  else process.env.TZ = originalTZ;
});

function dayStart(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Zones that actually observe daylight saving, with a "now" shortly after
// their autumn change — the case where the Overview mini consistency map
// went blank for every week before the change. (The sandbox/CI zone is
// usually UTC, which has no DST, so the zone is set explicitly.)
const DST_CASES = [
  { zone: "Europe/London", now: new Date(Date.UTC(2026, 9, 27, 14, 15)) },
  { zone: "America/New_York", now: new Date(Date.UTC(2026, 10, 3, 14, 15)) },
];

describe("addCalendarDays", () => {
  it.each(DST_CASES)(
    "stays on local midnight for every day of an 8-week window across a clock change ($zone)",
    ({ zone, now }) => {
      process.env.TZ = zone;

      const thisWeekStart = getCalendarWeekStart(now.getTime());
      for (let offset = -7 * 7; offset <= 6; offset++) {
        const date = addCalendarDays(thisWeekStart, offset);
        expect(new Date(date).getHours()).toBe(0);
        expect(date).toBe(dayStart(date));
      }
    },
  );

  it.each(DST_CASES)(
    "finds every trained day in an 8-week window, as the mini map looks them up ($zone)",
    ({ zone, now }) => {
      process.env.TZ = zone;

      // One workout per day for the last 8 weeks, keyed the way Overview
      // keys them: the day-start of each workout's timestamp.
      const trainedDays = new Set<number>();
      for (let i = 0; i < 8 * 7; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        trainedDays.add(dayStart(d.getTime()));
      }

      const today = dayStart(now.getTime());
      const thisWeekStart = getCalendarWeekStart(now.getTime());
      let matched = 0;
      let expected = 0;
      for (let w = 0; w < 8; w++) {
        for (let d = 0; d < 7; d++) {
          const date = addCalendarDays(thisWeekStart, (w - 7) * 7 + d);
          if (date > today) continue;
          expected += 1;
          if (trainedDays.has(date)) matched += 1;
        }
      }

      expect(expected).toBeGreaterThan(40);
      expect(matched).toBe(expected);
    },
  );

  it("moves backwards and forwards by whole calendar days", () => {
    process.env.TZ = "Europe/London";
    const monday = new Date(2026, 9, 26).getTime();
    expect(addCalendarDays(monday, 0)).toBe(monday);
    expect(new Date(addCalendarDays(monday, -1)).getDate()).toBe(25);
    expect(new Date(addCalendarDays(monday, 7)).getDate()).toBe(2);
    expect(new Date(addCalendarDays(monday, -49)).getDate()).toBe(7);
  });
});
