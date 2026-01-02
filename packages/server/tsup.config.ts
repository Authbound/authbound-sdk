import { defineConfig } from "tsup";

export default defineConfig([
  // Main entry point (core utilities)
  {
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    clean: true,
    outDir: "dist",
    external: ["next", "next/server", "@authbound/core", "@authbound/shared"],
  },
  // Next.js specific entry point
  {
    entry: ["src/next/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    outDir: "dist/next",
    external: [
      "next",
      "next/server",
      "@authbound/core",
      "@authbound/shared",
      "jose",
    ],
  },
  // Edge runtime entry point
  {
    entry: ["src/edge.ts"],
    format: ["esm"],
    dts: true,
    outDir: "dist",
    external: ["next", "next/server", "@authbound/core", "@authbound/shared"],
  },
]);
