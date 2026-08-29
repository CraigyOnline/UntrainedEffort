import { useState } from "react";
import { Eye } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { getBodyType } from "@/lib/bodyType";
import {
  getExerciseImagePath,
  hasExerciseImages,
  type ExerciseImageShot,
} from "@/lib/exerciseImages";
import { getExerciseFormNotes } from "@/lib/exerciseFormNotes";

const SHOTS: ExerciseImageShot[] = ["setup", "movement"];
const SHOT_LABELS: Record<ExerciseImageShot, string> = {
  setup: "Setup",
  movement: "Movement",
};

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
 * reference images and captions for one exercise. Images come from
 * @/lib/exerciseImages (matching the body type already set for the muscle
 * map — same preference, read the same once-at-mount way MuscleMap does);
 * captions come from @/lib/exerciseFormNotes. The two are added on
 * different schedules — every exercise has a caption, but images arrive
 * exercise-by-exercise as they're generated — so each shot renders
 * whichever of the two it actually has rather than requiring both.
 *
 * Renders nothing for an exercise with neither an image nor a caption,
 * so the catalog can grow either independently without every exercise
 * needing full coverage before this can ship.
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
  const [brokenShots, setBrokenShots] = useState<Set<ExerciseImageShot>>(new Set());

  const notes = getExerciseFormNotes(exerciseId);
  if (!hasExerciseImages(exerciseId) && !notes) return null;

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
        <DialogContent className="max-w-md">
          <DialogTitle className="text-base">{exerciseName}</DialogTitle>
          <div className="flex flex-col gap-4">
            {SHOTS.map((shot) => {
              const caption = notes?.[shot];
              const showImage = !brokenShots.has(shot);
              if (!showImage && !caption) return null;
              return (
                <figure key={shot}>
                  {showImage && (
                    <img
                      src={getExerciseImagePath(exerciseId, bodyType, shot)}
                      alt={`${exerciseName} — ${shot}`}
                      className="w-full rounded-lg bg-secondary object-contain"
                      onError={() => setBrokenShots((prev) => new Set(prev).add(shot))}
                    />
                  )}
                  <figcaption className="mt-1.5">
                    <p className="text-xs font-semibold">{SHOT_LABELS[shot]}</p>
                    {caption && <p className="text-xs text-muted-foreground">{caption}</p>}
                  </figcaption>
                </figure>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
