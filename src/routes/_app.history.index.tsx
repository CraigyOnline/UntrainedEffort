import { createFileRoute, redirect } from "@tanstack/react-router";

// "/history" is only ever a landing spot, not a page of its own. Insights
// is the default landing tab (explicitly requested after living with the
// Timeline-default arrangement) — Timeline is one tap away via
// HistoryTabs, which now lists Insights first to match.
export const Route = createFileRoute("/_app/history/")({
  beforeLoad: () => {
    throw redirect({ to: "/history/insights", replace: true });
  },
});
