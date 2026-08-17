import { createFileRoute, redirect } from "@tanstack/react-router";

// "/history" is only ever a landing spot, not a page of its own — Timeline
// (the workout log) is the meaningful default when someone taps the History
// tab, with Insights one deliberate tap away via HistoryTabs. Previously
// this route rendered the full stats dashboard directly, which was the
// exact "History takes you to stats, and you have to dig for the actual
// history" problem this redirect fixes.
export const Route = createFileRoute("/_app/history/")({
  beforeLoad: () => {
    throw redirect({ to: "/history/timeline", replace: true });
  },
});
