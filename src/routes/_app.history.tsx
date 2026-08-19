import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { HistoryTabs } from "@/components/HistoryTabs";

export const Route = createFileRoute("/_app/history")({
  component: HistoryPage,
});

function HistoryPage() {
  return (
    <>
      <div className="px-4 pt-6">
        <PageHeader eyebrow="History">
          <p className="text-lg font-semibold leading-snug">Your training log and insights</p>
        </PageHeader>
      </div>
      <HistoryTabs />
      <Outlet />
    </>
  );
}
