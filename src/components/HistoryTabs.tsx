import { Link, useLocation } from "@tanstack/react-router";

// Persistent Timeline/Insights switch rendered by the shared History layout
// (_app.history.tsx) above its <Outlet />, so it stays put across both
// sub-routes rather than being duplicated in each page.
const tabs = [
  { to: "/history/insights", label: "Insights" },
  { to: "/history/timeline", label: "Timeline" },
] as const;

export function HistoryTabs() {
  const { pathname } = useLocation();
  return (
    <div className="flex gap-1 rounded-full bg-secondary/60 p-1 mx-4 mt-4">
      {tabs.map(({ to, label }) => {
        const active = pathname.startsWith(to);
        return (
          <Link
            key={to}
            to={to}
            className="flex-1 rounded-full py-1.5 text-center text-sm font-medium transition-colors"
            style={{
              backgroundColor: active ? "var(--color-card)" : "transparent",
              color: active ? "var(--color-foreground)" : "var(--color-muted-foreground)",
            }}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
