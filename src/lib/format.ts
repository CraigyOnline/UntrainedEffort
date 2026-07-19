/**
 * Shared formatting utilities — avoids the duplicate fmt() definitions
 * that existed in _app.history.$id.tsx and _app.workout.tsx
 */

/** Format seconds as M:SS or H:MM:SS */
export function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Format seconds as M:SS (alias kept for timer displays) */
export function formatTime(sec: number): string {
  return formatDuration(sec);
}

/** Format a timestamp as "12 Jan 2024", or "None" if absent */
export function formatDate(ts: number | undefined): string {
  if (!ts) return "None";
  return new Date(ts).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Format a timestamp relative to today ("Today", "Yesterday", "3 days
 * ago"), falling back to the absolute formatDate beyond a week — "14 days
 * ago" reads worse than a real date once you're more than a week out.
 */
export function formatRelativeDate(ts: number): string {
  const dayMs = 86400000;
  const startOfDay = (t: number) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const diffDays = Math.round((startOfDay(Date.now()) - startOfDay(ts)) / dayMs);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays <= 7) return `${diffDays} days ago`;
  return formatDate(ts);
}

/** Format a byte count as a human-readable size (B/KB/MB/GB/TB) */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value < 10 ? 2 : 1)} ${units[i]}`;
}
