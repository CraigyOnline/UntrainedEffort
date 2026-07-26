import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import icon from "@/assets/brand/icon.png";
import { selectHomeGreeting, type HomeGreeting } from "@/lib/homeGreetings";

export const Route = createFileRoute("/")({
  component: LaunchScreen,
});

// How long the greeting holds on screen before the fade-out/navigate
// begins, and how long that fade-out itself takes. Same "a moment, then
// transition" shape as the Workout Complete acknowledgment stage this is
// deliberately modeled on — logo/greeting alone, a real pause, then move
// on — just shorter, since this happens on every single app open rather
// than once per workout.
const HOLD_MS = 1400;
const FADE_MS = 350;

/**
 * The very first thing the app shows on open: the logo and one line from
 * the same greeting pool the Profile screen itself uses (selectHomeGreeting,
 * see src/lib/homeGreetings.ts) — not a separate message system. This is
 * the counterpart to the Workout Complete screen's opening acknowledgment,
 * and deliberately matches its typography/motion (text-3xl, tracking-tight,
 * blur-to-focus) rather than inventing a different look for what's meant
 * to be the same kind of moment.
 *
 * Logo and text enter together as one group, only once the greeting has
 * actually resolved — not the logo immediately on mount with the text
 * popping in later. Firing them separately caused a visible layout jump:
 * this is a centered flex column, so the moment the text mounts after the
 * logo already had the column to itself, the whole group recenters and
 * the logo visibly shifts. Waiting for both means the group appears
 * together, already in its final layout, nothing to reflow.
 *
 * Renders outside the `_app` shell (this route has no `_app.` prefix), so
 * it deliberately doesn't get the bottom tab bar or active-workout card —
 * it's a moment before the app itself, not a page within it. Navigates
 * with `replace: true` so it never sits in history — same reasoning
 * __root.tsx already applies to "/profile" being the app's true root for
 * the Android back button.
 */
function LaunchScreen() {
  const navigate = useNavigate();
  const [greeting, setGreeting] = useState<HomeGreeting | null>(null);
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    selectHomeGreeting().then((g) => {
      if (!cancelled) setGreeting(g);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Waits for the greeting, not just mount — see the file-level comment
  // above for why entrance can't start before there's something to show.
  useEffect(() => {
    if (!greeting) return;
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, [greeting]);

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => setLeaving(true), HOLD_MS);
    return () => clearTimeout(t);
  }, [visible]);

  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => navigate({ to: "/profile", replace: true }), FADE_MS);
    return () => clearTimeout(t);
  }, [leaving, navigate]);

  return (
    <div
      className={`flex min-h-screen flex-col items-center justify-center bg-background px-6 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-center transition-opacity ease-in-out ${
        visible && !leaving ? "opacity-100" : "opacity-0"
      }`}
      style={{ transitionDuration: `${FADE_MS}ms` }}
    >
      <div
        className={`flex flex-col items-center gap-4 transition-all duration-500 ease-in-out ${
          visible ? "scale-100 opacity-100 blur-none" : "scale-[0.97] opacity-0 blur-md"
        }`}
      >
        <img src={icon} alt="" className="h-14 w-14 rounded-2xl" />
        {greeting && (
          <p className="max-w-xs px-4 text-3xl leading-snug font-bold tracking-tight">
            {greeting.headline}
          </p>
        )}
      </div>
    </div>
  );
}
