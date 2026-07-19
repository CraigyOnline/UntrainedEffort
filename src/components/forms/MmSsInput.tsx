import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// MmSsInput
//
// A duration input that splits minutes and seconds into two separate fields
// rather than requiring the user to enter raw seconds.
//
// - Accepts and emits total seconds (e.g. 90 = 1:30)
// - Validates on blur: seconds field clamps to 0–59 and zero-pads
// - Syncs to external `seconds` prop when not focused
// - Android numeric keyboard on both fields
//
// Usage:
//   <MmSsInput seconds={duration} onCommit={setDuration} />
// ─────────────────────────────────────────────────────────────────────────────

export interface MmSsInputProps {
  seconds: number;
  onCommit: (totalSeconds: number) => void;
  className?: string;
}

export function MmSsInput({ seconds, onCommit, className }: MmSsInputProps) {
  const totalSeconds = Math.max(0, seconds);
  const mm = Math.floor(totalSeconds / 60);
  const ss = totalSeconds % 60;

  const [mStr, setMStr] = useState(String(mm));
  const [sStr, setSStr] = useState(String(ss).padStart(2, "0"));
  const focused = useRef(false);

  // Sync external changes only when not being edited
  useEffect(() => {
    if (!focused.current) {
      setMStr(String(mm));
      setSStr(String(ss).padStart(2, "0"));
    }
    // mm and ss are derived from `seconds`, intentionally not in deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds]);

  function commit(nextM: string, nextS: string) {
    const m = Math.max(0, parseInt(nextM, 10) || 0);
    const s = Math.max(0, Math.min(59, parseInt(nextS, 10) || 0));
    onCommit(m * 60 + s);
  }

  const inputClass =
    "w-10 rounded bg-secondary px-2 py-1 text-center text-sm outline-none";

  return (
    <div
      className={cn("flex items-center gap-1", className)}
      onFocus={() => { focused.current = true; }}
      onBlur={() => { focused.current = false; }}
    >
      <input
        type="text"
        inputMode="numeric"
        value={mStr}
        placeholder="0"
        aria-label="Minutes"
        onChange={(e) => setMStr(e.target.value.replace(/[^0-9]/g, ""))}
        onFocus={(e) => e.target.select()}
        onBlur={() => commit(mStr, sStr)}
        className={inputClass}
      />
      <span className="text-sm text-muted-foreground select-none">:</span>
      <input
        type="text"
        inputMode="numeric"
        value={sStr}
        placeholder="00"
        aria-label="Seconds"
        onChange={(e) =>
          setSStr(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))
        }
        onFocus={(e) => e.target.select()}
        onBlur={() => {
          const padded = sStr === "" ? "00" : sStr.padStart(2, "0");
          setSStr(padded);
          commit(mStr, padded);
        }}
        className={inputClass}
      />
    </div>
  );
}
