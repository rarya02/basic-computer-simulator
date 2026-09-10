import { defineConfig } from "vitest/config";

// Kept separate from the web app's vite.config.ts so tests always run from the
// repo root rather than the web/ app root.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
