import { describe, expect, it } from "vitest";
import { EXERCISES } from "./exercises";
import { EXERCISE_FORM_NOTES } from "./exerciseFormNotes";

describe("exercise form notes coverage", () => {
  it("has a form note for every exercise in the catalog", () => {
    const missing = EXERCISES.map((e) => e.id).filter((id) => !EXERCISE_FORM_NOTES[id]);
    expect(missing).toEqual([]);
  });

  it("has no form note keys left over from removed or renamed exercises", () => {
    const ids = new Set(EXERCISES.map((e) => e.id));
    const stale = Object.keys(EXERCISE_FORM_NOTES).filter((id) => !ids.has(id));
    expect(stale).toEqual([]);
  });

  it("never has an empty cues list or empty warning text where present", () => {
    for (const [id, note] of Object.entries(EXERCISE_FORM_NOTES)) {
      if (note.cues) {
        expect(note.cues.length, `${id} has an empty cues array`).toBeGreaterThan(0);
        for (const cue of note.cues) {
          expect(cue.trim().length, `${id} has an empty cue`).toBeGreaterThan(0);
        }
      }
      if (note.warning) {
        expect(note.warning.text.trim().length, `${id} has an empty warning`).toBeGreaterThan(0);
      }
    }
  });
});
