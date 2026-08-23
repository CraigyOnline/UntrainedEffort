import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// This config runs TanStack Start in SPA mode (no SSR server) — the
// prerendered output is served as a static file bundle inside the Capacitor
// Android shell.
// tanstackStart's spa option is confirmed in TanStackStartViteInputConfig at
// @tanstack/start-plugin-core@1.169.6 (dist/esm/vite/schema.d.ts lines 6623-6707).
//
// spa.enabled: true        — disables SSR, produces a static client build
// spa.prerender.enabled    — crawls routes and writes static HTML shells
// spa.prerender.outputPath — all routes render to this single HTML file,
//                            which Capacitor loads as the app entry point
// spa.prerender.crawlLinks — discovers all routes automatically
// spa.maskPath             — the URL path Capacitor serves the shell from
//
// dist/client/ is the output directory; capacitor.config.json's webDir
// points there.

export default defineConfig({
  plugins: [
    tanstackStart({
      spa: {
        enabled: true,
        prerender: {
          enabled: true,
          outputPath: "index.html",
          crawlLinks: true,
          retryCount: 3,
        },
        maskPath: "/",
      },
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    tsconfigPaths: true,
    dedupe: ["react", "react-dom", "@tanstack/react-router"],
  },
});
