import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/integration/setup.ts"],
    fileParallelism: false, // les tests d'intégration partagent la même base
  },
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
});
