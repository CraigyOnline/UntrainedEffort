import path from "node:path";
import { defineConfig } from "vitest/config";

// Deliberately separate from vite.config.ts rather than extending it: the
// app's vite config wires up tanstackStart (SSR/prerender routing), which
// has no role in running unit tests over plain TypeScript modules and would
// only add startup cost and surface area here. Path alias resolution is
// duplicated from tsconfig.json's "@/*" mapping — the one thing this config
// actually needs from there.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
