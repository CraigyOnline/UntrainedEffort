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
 * the counterpart to the Workout Complete screen's opening acknowledgment:
 * one calm, encouraging line, alone, before anything else, then a
 * transition into the main app rather than an instant cut.
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

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // The hold timer only starts once there's actually a greeting to show —
  // an IndexedDB read is normally near-instant, but this avoids the edge
  // case of the fade-out firing before any text ever appeared.
  useEffect(() => {
    if (!greeting) return;
    const t = setTimeout(() => setLeaving(true), HOLD_MS);
    return () => clearTimeout(t);
  }, [greeting]);

  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => navigate({ to: "/profile", replace: true }), FADE_MS);
    return () => clearTimeout(t);
  }, [leaving, navigate]);

  return (
    <div
      className={`flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-center transition-opacity ease-in-out ${
        visible && !leaving ? "opacity-100" : "opacity-0"
      }`}
      style={{ transitionDuration: `${FADE_MS}ms` }}
    >
      <img
        src={icon}
        alt=""
        className={`h-16 w-16 rounded-2xl transition-all duration-500 ease-out ${
          visible ? "scale-100 opacity-100 blur-none" : "scale-95 opacity-0 blur-md"
        }`}
      />
      {greeting && (
        <p className="max-w-xs px-4 text-lg leading-snug font-semibold tracking-tight text-foreground">
          {greeting.headline}
        </p>
      )}
    </div>
  );
}
