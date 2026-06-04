import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const require = createRequire(import.meta.url);
const coreSource = fileURLToPath(
  new URL("../core/src/index.ts", import.meta.url)
);
const testingLibraryRoot = dirname(require.resolve("@testing-library/react"));
const reactResolveOptions = { paths: [testingLibraryRoot] };
const reactSource = require.resolve("react", reactResolveOptions);
const reactJsxRuntimeSource = require.resolve(
  "react/jsx-runtime",
  reactResolveOptions
);
const reactJsxDevRuntimeSource = require.resolve(
  "react/jsx-dev-runtime",
  reactResolveOptions
);
const reactDomSource = require.resolve("react-dom", reactResolveOptions);
const reactDomClientSource = require.resolve(
  "react-dom/client",
  reactResolveOptions
);

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^react$/,
        replacement: reactSource,
      },
      {
        find: /^react\/jsx-runtime$/,
        replacement: reactJsxRuntimeSource,
      },
      {
        find: /^react\/jsx-dev-runtime$/,
        replacement: reactJsxDevRuntimeSource,
      },
      {
        find: /^react-dom$/,
        replacement: reactDomSource,
      },
      {
        find: /^react-dom\/client$/,
        replacement: reactDomClientSource,
      },
      {
        find: "@authbound/core",
        replacement: coreSource,
      },
    ],
  },
});
