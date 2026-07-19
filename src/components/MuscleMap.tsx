import type { MuscleGroup } from "@/lib/exercises";
import { muscleNameToId } from "@/lib/muscles";

import frontBase from "@/assets/muscles/base/muscular_system_front.svg";
import backBase from "@/assets/muscles/base/muscular_system_back.svg";

import main1 from "@/assets/muscles/main/muscle-1.svg";
import main2 from "@/assets/muscles/main/muscle-2.svg";
import main3 from "@/assets/muscles/main/muscle-3.svg";
import main4 from "@/assets/muscles/main/muscle-4.svg";
import main5 from "@/assets/muscles/main/muscle-5.svg";
import main6 from "@/assets/muscles/main/muscle-6.svg";
import main7 from "@/assets/muscles/main/muscle-7.svg";
import main8 from "@/assets/muscles/main/muscle-8.svg";
import main9 from "@/assets/muscles/main/muscle-9.svg";
import main10 from "@/assets/muscles/main/muscle-10.svg";
import main11 from "@/assets/muscles/main/muscle-11.svg";
import main12 from "@/assets/muscles/main/muscle-12.svg";
import main13 from "@/assets/muscles/main/muscle-13.svg";
import main14 from "@/assets/muscles/main/muscle-14.svg";
import main15 from "@/assets/muscles/main/muscle-15.svg";
import main16 from "@/assets/muscles/main/muscle-16.svg";

import sec1 from "@/assets/muscles/secondary/muscle-1.svg";
import sec2 from "@/assets/muscles/secondary/muscle-2.svg";
import sec3 from "@/assets/muscles/secondary/muscle-3.svg";
import sec4 from "@/assets/muscles/secondary/muscle-4.svg";
import sec5 from "@/assets/muscles/secondary/muscle-5.svg";
import sec6 from "@/assets/muscles/secondary/muscle-6.svg";
import sec7 from "@/assets/muscles/secondary/muscle-7.svg";
import sec8 from "@/assets/muscles/secondary/muscle-8.svg";
import sec9 from "@/assets/muscles/secondary/muscle-9.svg";
import sec10 from "@/assets/muscles/secondary/muscle-10.svg";
import sec11 from "@/assets/muscles/secondary/muscle-11.svg";
import sec12 from "@/assets/muscles/secondary/muscle-12.svg";
import sec13 from "@/assets/muscles/secondary/muscle-13.svg";
import sec14 from "@/assets/muscles/secondary/muscle-14.svg";
import sec15 from "@/assets/muscles/secondary/muscle-15.svg";
import sec16 from "@/assets/muscles/secondary/muscle-16.svg";

interface MuscleMapProps {
  intensity: Partial<Record<MuscleGroup, number>>;
  activeMuscle?: MuscleGroup | null;
  className?: string;
  /**
   * Tightens the gap between the front/back panels for small thumbnail-sized
   * usage (e.g. routine cards). The default gap (16px) is tuned for the
   * full-width Profile/WorkoutSummary usage and looks oversized at small
   * sizes. Purely a layout tweak — no change to highlighting or assets.
   */
  compact?: boolean;
}

const mainSvgs: Record<number, string> = {
  1: main1, 2: main2, 3: main3, 4: main4, 5: main5, 6: main6, 7: main7, 8: main8,
  9: main9, 10: main10, 11: main11, 12: main12, 13: main13, 14: main14, 15: main15, 16: main16,
};
const secSvgs: Record<number, string> = {
  1: sec1, 2: sec2, 3: sec3, 4: sec4, 5: sec5, 6: sec6, 7: sec7, 8: sec8,
  9: sec9, 10: sec10, 11: sec11, 12: sec12, 13: sec13, 14: sec14, 15: sec15, 16: sec16,
};

// Muscle IDs from the wger project SVG set.
// Each ID corresponds to a layer that is positioned for one specific body view.
// Rendering a front-only layer on the back panel (or vice versa) causes the
// duplicate-highlight bug. Panels only render the IDs belonging to their view.
const FRONT_IDS = new Set([1, 2, 3, 4, 6, 10, 13, 14]);
const BACK_IDS  = new Set([5, 7, 8, 9, 11, 12, 15, 16]);

const ASPECT = "200 / 369";

function Layer({ src, opacity }: { src: string; opacity: number }) {
  return (
    <img
      src={src}
      alt=""
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "contain",
        opacity,
        pointerEvents: "none",
      }}
    />
  );
}

function Panel({
  base,
  view,
  intensity,
  activeMuscle,
}: {
  base: string;
  view: "front" | "back";
  intensity: Partial<Record<MuscleGroup, number>>;
  activeMuscle?: MuscleGroup | null;
}) {
  const allowedIds = view === "front" ? FRONT_IDS : BACK_IDS;
  const entries = Object.entries(muscleNameToId) as [string, number][];

  return (
    <div
      style={{
        position: "relative",
        flex: 1,
        aspectRatio: ASPECT,
        maxHeight: "100%",
      }}
    >
      <img
        src={base}
        alt=""
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "contain",
        }}
      />
      {entries.map(([muscle, id]) => {
        // Skip muscles whose SVG layer belongs to the other view
        if (!allowedIds.has(id)) return null;

        const raw = intensity[muscle as MuscleGroup];
        const hasIntensity = typeof raw === "number" && raw > 0;
        const v = Math.max(0, Math.min(1, raw ?? 0));
        const dim =
          activeMuscle && activeMuscle !== muscle ? 0.4 : 1;

        const secOpacity = hasIntensity
          ? (0.05 + v * 0.5) * dim
          : 0.05;
        const mainOpacity = hasIntensity ? (0.15 + v * 0.85) * dim : 0;

        return (
          <div key={muscle}>
            {secSvgs[id] && <Layer src={secSvgs[id]} opacity={secOpacity} />}
            {mainOpacity > 0 && mainSvgs[id] && (
              <Layer src={mainSvgs[id]} opacity={mainOpacity} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function MuscleMap({
  intensity,
  activeMuscle,
  className,
  compact = false,
}: MuscleMapProps) {
  return (
    <div
      className={className}
      style={{
        display: "flex",
        gap: compact ? 6 : 16,
        width: "100%",
        alignItems: "flex-start",
      }}
    >
      <Panel base={frontBase} view="front" intensity={intensity} activeMuscle={activeMuscle} />
      <Panel base={backBase}  view="back"  intensity={intensity} activeMuscle={activeMuscle} />
    </div>
  );
}
