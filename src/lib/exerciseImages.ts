import type { BodyType } from "@/lib/bodyType";

// ─────────────────────────────────────────────────────────────────────────
// Exercise reference images
//
// Files live at public/exercises/<id>/<bodyType>/<shot>.webp — plain
// static assets (not imported through Vite/src/assets) so the path can be
// built from data at runtime: exercise id, the existing bodyType
// preference, and which shot. See docs/architecture notes from the image
// review — the id here is the ExerciseDef.id (e.g. "db-bench-press"), not
// a slug of the display name, since that's the stable, decoupled key the
// rest of the catalog already looks exercises up by.
//
// Art is produced exercise-by-exercise, not all at once, so coverage is
// tracked here rather than as a field on every ExerciseDef — that would
// mean touching all 100+ hardcoded catalog entries for something that's
// really about asset availability, not exercise data. Add an id below
// once both bodyType folders have real setup/movement files in public/.
// ─────────────────────────────────────────────────────────────────────────

const EXERCISES_WITH_IMAGES = new Set<string>(["db-bench-press"]);

export function hasExerciseImages(exerciseId: string): boolean {
  return EXERCISES_WITH_IMAGES.has(exerciseId);
}

export type ExerciseImageShot = "setup" | "movement";

export function getExerciseImagePath(
  exerciseId: string,
  bodyType: BodyType,
  shot: ExerciseImageShot,
): string {
  return `/exercises/${exerciseId}/${bodyType}/${shot}.webp`;
}
