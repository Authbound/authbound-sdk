import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "adapters/nextjs": "src/adapters/nextjs.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ["next", "next/server", "@authbound/quickid-core"],
  treeshake: true,
});
