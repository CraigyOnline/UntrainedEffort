import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/history")({
  component: HistoryPage,
});

function HistoryPage() {
  return <Outlet />;
}
