import type { ReactNode } from "react";

interface PageHeaderProps {
  /** The tab's name — "Overview", "Workout", "History", "Settings".
   *  Rendered uppercase automatically; pass normal case. */
  eyebrow: string;
  /** One line beneath the eyebrow. A plain string for static pages
   *  (Workout, Settings, History); Overview passes its dynamic greeting
   *  sentence here instead — same slot, same typography either way. */
  children: ReactNode;
}

/**
 * The single header shape used across all four top-level tabs. Before
 * this, each tab had invented its own: Settings had an icon badge + a
 * bold title + a subtitle, Workout had a bold title + a subtitle with no
 * icon, History had no header at all, and Overview (built during the
 * IA redesign) had introduced a third pattern — small eyebrow label +
 * one line, no icon, no separate bold title. That third pattern is the
 * one every tab now uses, since it's the lightest of the three and matches
 * the redesign's "no-surface" tier for page-level chrome.
 */
export function PageHeader({ eyebrow, children }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-1">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {eyebrow}
      </p>
      {children}
    </header>
  );
}
