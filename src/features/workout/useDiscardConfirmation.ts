import { useCallback, useEffect, useState } from "react";
import { useBlocker } from "@tanstack/react-router";
import { useDismissOnBack } from "@/lib/backHandler";

/**
 * Shared "confirm before discarding unsaved changes" flow for full-screen
 * editor overlays that live within a route rather than being routes of
 * their own (RoutineEditor, CircuitRoutineEditor). Covers the three ways
 * such an editor can be asked to close — the in-UI close button, router
 * navigation away from the page underneath it, and the Android hardware
 * back button — routing all three through the same hasChanges-gated
 * confirmation dialog instead of each caller wiring it up separately.
 */
export function useDiscardConfirmation(hasChanges: boolean, onClose: () => void) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const blocker = useBlocker({ shouldBlockFn: () => hasChanges, withResolver: true });

  useEffect(() => {
    if (blocker.status === "blocked") setConfirmOpen(true);
  }, [blocker.status]);

  const handleClose = useCallback(() => {
    if (hasChanges) setConfirmOpen(true);
    else onClose();
  }, [hasChanges, onClose]);

  // The editor is a full-screen overlay within its route, not a separate
  // route itself — without this, Android back would fall through to route
  // history and exit the route entirely, skipping past the editor instead
  // of closing it first.
  useDismissOnBack(true, handleClose);

  const handleDiscard = useCallback(() => {
    setConfirmOpen(false);
    if (blocker.status === "blocked") blocker.proceed();
    else onClose();
  }, [blocker, onClose]);

  const handleCancel = useCallback(() => {
    setConfirmOpen(false);
    if (blocker.status === "blocked") blocker.reset();
  }, [blocker]);

  return { confirmOpen, handleClose, handleDiscard, handleCancel };
}
