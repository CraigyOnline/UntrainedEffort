import { useState } from "react";
import { MuscleMap } from "@/components/MuscleMap";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { MuscleGroup } from "@/lib/exercises";

interface ExpandableMuscleMapProps {
  intensity: Partial<Record<MuscleGroup, number>>;
  activeMuscle?: MuscleGroup | null;
  className?: string;
  compact?: boolean;
  /** Called before opening — lets callers stopPropagation when this map
   *  sits inside another clickable element (e.g. a card that navigates
   *  on click), without duplicating the open logic per call site. */
  onTriggerClick?: (e: React.MouseEvent) => void;
}

/**
 * Wraps any small/compact MuscleMap so tapping it opens a full-size view.
 * Reuses MuscleMap itself for both the trigger and the expanded view —
 * the only difference is which size props each is given — so there's no
 * second rendering implementation to keep in sync with the original.
 *
 * Built on the existing Dialog component, which already provides tap-
 * outside-to-dismiss and a close button, and (via its Root wrapper in
 * dialog.tsx) already registers with the Android back-dismiss stack — so
 * none of that needs to be re-implemented here.
 */
export function ExpandableMuscleMap({
  intensity,
  activeMuscle,
  className,
  compact,
  onTriggerClick,
}: ExpandableMuscleMapProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          onTriggerClick?.(e);
          setOpen(true);
        }}
        aria-label="View full muscle map"
        className="block w-full cursor-pointer"
      >
        <MuscleMap
          intensity={intensity}
          activeMuscle={activeMuscle}
          className={className}
          compact={compact}
        />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogTitle className="sr-only">Muscle activity</DialogTitle>
          <MuscleMap
            intensity={intensity}
            activeMuscle={activeMuscle}
            className="max-h-[65vh] w-full"
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
