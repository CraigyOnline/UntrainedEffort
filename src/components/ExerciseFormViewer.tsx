import { useState } from "react";
import { Eye } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { getBodyType } from "@/lib/bodyType";
import {
  getExerciseImagePath,
  hasExerciseImages,
  type ExerciseImageShot,
} from "@/lib/exerciseImages";

const SHOTS: ExerciseImageShot[] = ["setup", "movement"];

interface ExerciseFormViewerProps {
  exerciseId: string;
  exerciseName: string;
  className?: string;
  /** See ExpandableMuscleMap — lets callers stopPropagation when this
   *  trigger sits inside another clickable element (an exercise row that
   *  otherwise picks/selects on click), without duplicating that logic
   *  per call site. */
  onTriggerClick?: (e: React.MouseEvent) => void;
}

/**
 * Small "view form" trigger that opens a dialog with the setup/movement
 * reference images for one exercise, matching the body type already set
 * for the muscle map (see @/lib/bodyType — same preference, read the same
 * once-at-mount way MuscleMap does).
 *
 * Renders nothing for exercises without images yet (see
 * hasExerciseImages), so the catalog can grow this art incrementally
 * rather than needing every exercise covered before it can ship.
 *
 * Built on the existing Dialog component for the same reasons as
 * ExpandableMuscleMap: tap-outside-to-dismiss, a close button, and Android
 * back-dismiss all already come from there.
 */
export function ExerciseFormViewer({
  exerciseId,
  exerciseName,
  className,
  onTriggerClick,
}: ExerciseFormViewerProps) {
  const [open, setOpen] = useState(false);
  const [bodyType] = useState(() => getBodyType());
  const [broken, setBroken] = useState<Set<ExerciseImageShot>>(new Set());

  if (!hasExerciseImages(exerciseId)) return null;

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          onTriggerClick?.(e);
          setOpen(true);
        }}
        aria-label={`View ${exerciseName} form`}
        className={
          className ??
          "relative flex h-11 w-8 shrink-0 items-center justify-center text-muted-foreground/70 after:absolute after:-inset-1 after:content-['']"
        }
      >
        <Eye className="h-4 w-4" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogTitle className="text-base">{exerciseName}</DialogTitle>
          <div className="grid grid-cols-2 gap-3">
            {SHOTS.filter((shot) => !broken.has(shot)).map((shot) => (
              <figure key={shot} className="min-w-0">
                <img
                  src={getExerciseImagePath(exerciseId, bodyType, shot)}
                  alt={`${exerciseName} — ${shot}`}
                  className="w-full rounded-lg bg-secondary object-contain"
                  onError={() => setBroken((prev) => new Set(prev).add(shot))}
                />
                <figcaption className="mt-1 text-center text-xs capitalize text-muted-foreground">
                  {shot}
                </figcaption>
              </figure>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
