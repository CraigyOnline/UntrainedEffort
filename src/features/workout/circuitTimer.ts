import type { CircuitConfig, CircuitTimerState } from "@/lib/db";

export function isCircuitDone(
  state: CircuitTimerState | undefined,
  config: CircuitConfig,
): boolean {
  return !!state && state.round > config.rounds;
}
