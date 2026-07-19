import { Link, useLocation } from "@tanstack/react-router";
import { User, Play, History, Settings } from "lucide-react";

// Exported so overlay components (ExercisePicker, RoutineEditor) can calculate
// their bottom offset without hardcoding the nav height in multiple places.
export const BOTTOM_NAV_HEIGHT = 62;

const tabs = [
  { to: "/profile",  label: "Profile",  Icon: User     },
  { to: "/workout",  label: "Workout",  Icon: Play     },
  { to: "/history",  label: "History",  Icon: History  },
  { to: "/settings", label: "Settings", Icon: Settings },
] as const;

export function BottomTabs() {
  const { pathname } = useLocation();
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <ul className="mx-auto grid max-w-md grid-cols-4 pb-[env(safe-area-inset-bottom)]">
        {tabs.map(({ to, label, Icon }) => {
          const active = pathname.startsWith(to);
          return (
            <li key={to}>
              <Link
                to={to}
                className="flex flex-col items-center gap-1 py-3 text-xs transition-colors"
                style={{ color: active ? "var(--color-primary)" : "var(--color-muted-foreground)" }}
              >
                <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
                <span className={active ? "font-semibold" : ""}>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
