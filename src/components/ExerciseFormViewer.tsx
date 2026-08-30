import { useState } from "react";
import { Eye, Info, OctagonAlert, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { getBodyType } from "@/lib/bodyType";
import {
  getExerciseImagePath,
  hasExerciseImages,
  type ExerciseImageShot,
} from "@/lib/exerciseImages";
import { getExerciseFormNotes, type WarningSeverity } from "@/lib/exerciseFormNotes";

const SHOTS: ExerciseImageShot[] = ["setup", "movement"];
const SHOT_LABELS: Record<ExerciseImageShot, string> = {
  setup: "Setup",
  movement: "Movement",
};

/** Icon + label + Alert variant for each warning tier. Safety maps to the
 *  existing "destructive" Alert variant rather than a variant of its own —
 *  see the --caution/--important token comment in styles.css for why. */
const SEVERITY_CONFIG: Record<
  WarningSeverity,
  { variant: "caution" | "important" | "destructive"; label: string; icon: typeof Info }
> = {
  caution: { variant: "caution", label: "Caution", icon: Info },
  important: { variant: "important", label: "Important", icon: TriangleAlert },
  safety: { variant: "destructive", label: "Safety", icon: OctagonAlert },
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
 * reference images and captions for one exercise, plus any coaching cues
 * and warning for it. Images come from @/lib/exerciseImages (matching the
 * body type already set for the muscle map — same preference, read the
 * same once-at-mount way MuscleMap does); captions, cues, and the warning
 * all come from @/lib/exerciseFormNotes. Images and captions are added on
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

  const warning = notes?.warning;
  const warningConfig = warning ? SEVERITY_CONFIG[warning.severity] : undefined;

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
          <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1">
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
            {notes?.cues && notes.cues.length > 0 && (
              <div>
                <p className="text-xs font-semibold">Cues</p>
                <ul className="mt-1 flex flex-col gap-1 pl-4 text-xs text-muted-foreground [&>li]:list-disc">
                  {notes.cues.map((cue, i) => (
                    <li key={i}>{cue}</li>
                  ))}
                </ul>
              </div>
            )}
            {warning && warningConfig && (
              <Alert variant={warningConfig.variant}>
                <warningConfig.icon className="h-4 w-4" />
                <AlertTitle>{warningConfig.label}</AlertTitle>
                <AlertDescription>{warning.text}</AlertDescription>
              </Alert>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
