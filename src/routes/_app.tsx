import { createFileRoute, Outlet } from "@tanstack/react-router";
import { BottomTabs } from "@/components/BottomTabs";
import { Toaster } from "@/components/ui/sonner";
import { ActiveWorkoutCard } from "@/components/ActiveWorkoutCard";
import { CustomExercisesLoader } from "@/lib/customExercises";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md min-w-0 flex-col overflow-x-hidden bg-background pb-24 pt-[env(safe-area-inset-top)]">
      <CustomExercisesLoader>
        <Outlet />
        <ActiveWorkoutCard />
      </CustomExercisesLoader>
      <BottomTabs />
      <Toaster />
    </div>
  );
}
