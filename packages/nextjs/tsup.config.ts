import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    middleware: "src/middleware.ts",
    server: "src/server.ts",
    client: "src/client.tsx",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  // External packages - don't bundle these
  // @authbound-sdk/* marked external to avoid dts resolution issues with workspace subpath exports
  external: [
    "react",
    "react-dom",
    "next",
    /^@authbound-sdk\//,
  ],
});
