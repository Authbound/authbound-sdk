import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const coreSource = fileURLToPath(
  new URL("../core/src/index.ts", import.meta.url)
);
const serverSource = fileURLToPath(
  new URL("../server/src/index.ts", import.meta.url)
);

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "@authbound/core",
        replacement: coreSource,
      },
      {
        find: "@authbound/server",
        replacement: serverSource,
      },
    ],
  },
});
