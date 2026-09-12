import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const webRoot = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig({
  root: webRoot,
  // GitHub Pages serves this from a project subpath, so every asset URL needs that prefix.
  base: "/basic-computer-simulator/",
  // The page imports core/ and the shared programs/ from outside the app root.
  server: { fs: { allow: [repoRoot] } },
  build: { outDir: fileURLToPath(new URL("../dist", import.meta.url)), emptyOutDir: true },
  worker: { format: "es" },
});
