import type { ReactNode } from "react";

interface SummaryStatProps {
  icon: ReactNode;
  label: string;
  value: string;
  /** Short, encouraging line under the value — celebratory context rather
   *  than another number, e.g. "Keep the habit alive." */
  footnote?: string;
}

/** Small stat card shared by the Progress page's summary sections
 *  (Lifetime, Current Year, Milestones) — extracted once a second section
 *  needed the exact same card. Icon carries the primary accent color; the
 *  label stays neutral so only the icon reads as a highlight. */
export function SummaryStat({ icon, label, value, footnote }: SummaryStatProps) {
  return (
    <div className="rounded-2xl bg-card p-4">
      <div className="flex items-center gap-2">
        <span className="text-primary">{icon}</span>
        <span className="text-sm font-medium">{label}</span>
      </div>
      <p className="mt-2 text-xl font-bold">{value}</p>
      {footnote && <p className="mt-1 text-xs text-muted-foreground">{footnote}</p>}
    </div>
  );
}
