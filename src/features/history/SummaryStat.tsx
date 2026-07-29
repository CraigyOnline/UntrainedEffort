import type { ReactNode } from "react";

interface SummaryStatProps {
  icon: ReactNode;
  label: string;
  value: string;
}

/** Small stat card shared by the Progress page's summary sections
 *  (Lifetime, Current Year, ...) — extracted once a second section
 *  needed the exact same card. */
export function SummaryStat({ icon, label, value }: SummaryStatProps) {
  return (
    <div className="rounded-2xl bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className="mt-1 text-xl font-bold">{value}</p>
    </div>
  );
}
