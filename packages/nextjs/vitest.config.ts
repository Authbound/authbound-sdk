import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "@authbound/server/next",
        replacement: fileURLToPath(
          new URL("../server/src/next/index.ts", import.meta.url)
        ),
      },
      {
        find: "@authbound/server",
        replacement: fileURLToPath(
          new URL("../server/src/index.ts", import.meta.url)
        ),
      },
      {
        find: "@authbound/core",
        replacement: fileURLToPath(
          new URL("../core/src/index.ts", import.meta.url)
        ),
      },
    ],
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
