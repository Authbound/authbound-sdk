import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.tsx",
    testing: "src/testing.tsx",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  banner: {
    js: '"use client";',
  },
  external: ["@authbound/core", "qrcode", "react", "react-dom"],
});
