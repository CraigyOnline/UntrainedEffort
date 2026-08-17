import { createFileRoute, Outlet } from "@tanstack/react-router";
import { HistoryTabs } from "@/components/HistoryTabs";

export const Route = createFileRoute("/_app/history")({
  component: HistoryPage,
});

function HistoryPage() {
  return (
    <>
      <HistoryTabs />
      <Outlet />
    </>
  );
}
