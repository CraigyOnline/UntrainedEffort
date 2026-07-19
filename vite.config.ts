import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

// Commit 2: enable SPA mode.
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
// dist/client/ remains the output directory (established in Commit 1).
// capacitor.config.json webDir already points at dist/client (Commit 1b).
//
// src/server.ts and src/start.ts are now dead code — the SSR server is not
// built in SPA mode. They will be removed in Commit 3.

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
    tsconfigPaths(),
  ],
  resolve: {
    dedupe: ["react", "react-dom", "@tanstack/react-router"],
  },
});
