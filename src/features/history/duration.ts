/** Total time invested, in whichever unit reads best at the scale reached
 *  so far ("45 min" early on, "12h" once there's real volume of time). */
export function formatTimeTrained(totalSeconds: number): string {
  const totalMinutes = Math.round(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} min`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}
