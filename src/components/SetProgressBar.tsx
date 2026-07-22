/**
 * The thin "completed / total sets" progress bar shown in both the
 * floating Workout HUD and the Active Workout Card — identical markup in
 * both places, so it's one component instead of two copies that could
 * drift apart.
 */
export function SetProgressBar({ value, className = "" }: { value: number; className?: string }) {
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-secondary ${className}`}>
      <div
        className="h-full rounded-full bg-primary transition-all duration-300"
        style={{ width: `${value * 100}%` }}
      />
    </div>
  );
}
