import { defineConfig } from "tsup";

export default defineConfig([
  // Main entry point (core utilities)
  {
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    clean: true,
    outDir: "dist",
    external: ["next", "next/server", "@authbound-sdk/core", "@authbound-sdk/shared"],
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
      "@authbound-sdk/core",
      "@authbound-sdk/shared",
      "jose",
    ],
  },
  // Express.js specific entry point
  {
    entry: ["src/express/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    outDir: "dist/express",
    external: ["express", "@authbound-sdk/core", "@authbound-sdk/shared", "jose"],
  },
  // Hono specific entry point
  {
    entry: ["src/hono/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    outDir: "dist/hono",
    external: [
      "hono",
      "hono/cookie",
      "@authbound-sdk/core",
      "@authbound-sdk/shared",
      "jose",
    ],
  },
  // Edge runtime entry point
  {
    entry: ["src/edge.ts"],
    format: ["esm"],
    dts: true,
    outDir: "dist",
    external: ["next", "next/server", "@authbound-sdk/core", "@authbound-sdk/shared"],
  },
]);
