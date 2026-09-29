import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { CustomExerciseForm } from "@/components/forms/CustomExerciseForm";

export const Route = createFileRoute("/_app/exercises_/new")({
  head: () => ({
    meta: [
      { title: "New Exercise · Untrained Effort" },
      { name: "description", content: "Add a custom exercise to your library." },
    ],
  }),
  component: NewExercisePage,
});

function NewExercisePage() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col">
      <header className="flex items-center gap-3 px-4 pt-6">
        <button onClick={() => navigate({ to: "/exercises" })} className="p-1">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold">New Exercise</h1>
          <p className="text-xs text-muted-foreground">Add your own exercise to the library</p>
        </div>
      </header>

      <CustomExerciseForm
        onCreated={(def) => {
          toast.success(`"${def.name}" created`, { duration: 2500 });
          navigate({ to: "/exercises" });
        }}
      />
    </div>
  );
}
