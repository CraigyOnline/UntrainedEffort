import type { IntervalTimerState } from "@/lib/db";
import type { IntervalConfig } from "@/lib/exercises";

export function isIntervalDone(
  state: IntervalTimerState | undefined,
  config: IntervalConfig,
): boolean {
  return !!state && state.round > config.rounds;
}
