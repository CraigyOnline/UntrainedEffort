/** Shared "nothing here yet" treatment — a dashed, centered card with an
 *  explanatory line and an optional single action. Originally written for
 *  the "No routines yet" state on the Workout tab; reused everywhere a
 *  full (not nested-in-a-card) section can be empty, so all of those
 *  screens read as one consistent, intentional pattern rather than each
 *  screen inventing its own empty-state look. */
export function EmptyState({
  message,
  action,
}: {
  message: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border px-5 py-8 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
      {action && (
        <button onClick={action.onClick} className="mt-2 text-sm font-semibold text-primary">
          {action.label}
        </button>
      )}
    </div>
  );
}
