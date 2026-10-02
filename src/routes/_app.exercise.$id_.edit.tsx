import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { getExercise } from "@/lib/exercises";
import { archiveCustomExercise, isCustomExercise } from "@/lib/customExercises";
import { CustomExerciseForm } from "@/components/forms/CustomExerciseForm";

export const Route = createFileRoute("/_app/exercise/$id_/edit")({
  head: () => ({
    meta: [{ title: "Edit Exercise · Untrained Effort" }],
  }),
  component: EditExercisePage,
});

function EditExercisePage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const def = getExercise(id);

  // Not a custom exercise (unknown id, or one of the 103 built-ins) — this
  // route is only ever linked to from the detail page's edit icon, which
  // only shows for isCustomExercise results, so reaching this any other
  // way isn't a flow to design around, just one not to crash on.
  if (!def || !isCustomExercise(def)) {
    return (
      <div className="flex flex-col gap-4 px-4 pt-6">
        <p className="text-sm text-muted-foreground">This exercise can't be edited.</p>
        <Button variant="secondary" onClick={() => navigate({ to: "/exercises" })}>
          Back to Exercises
        </Button>
      </div>
    );
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await archiveCustomExercise(id);
      toast.success(`"${def!.name}" deleted`, { duration: 2500 });
      navigate({ to: "/exercises" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete exercise");
      setDeleting(false);
      setConfirmDeleteOpen(false);
    }
  }

  return (
    <div className="flex flex-col">
      <header className="flex items-center gap-3 px-4 pt-6">
        <button onClick={() => navigate({ to: "/exercise/$id", params: { id } })} className="p-1">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold">Edit Exercise</h1>
        </div>
      </header>

      <CustomExerciseForm
        existing={def}
        onSaved={() => {
          toast.success("Changes saved", { duration: 2000 });
          navigate({ to: "/exercise/$id", params: { id } });
        }}
      />

      <div className="flex flex-col gap-2 border-t border-border px-4 pt-6 pb-8">
        <p className="text-sm font-semibold text-destructive">Danger Zone</p>
        <p className="text-xs text-muted-foreground">
          Deleting keeps its logged history intact but removes it from everywhere you'd pick a new
          exercise.
        </p>
        <Button
          variant="outline"
          className="border-destructive text-destructive hover:bg-destructive/10"
          onClick={() => setConfirmDeleteOpen(true)}
        >
          Delete Exercise
        </Button>
      </div>

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{def.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Its logged history and past progress stay exactly as they are — this only removes it
              from the exercise picker, routine builder, and quick workouts, so it can't be added
              anywhere new.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={deleting} onClick={handleDelete}>
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
