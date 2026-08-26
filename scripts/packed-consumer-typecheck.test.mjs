import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";

import {
  partitionPackedConsumerDiagnostics,
  summarizeExternalDiagnostics,
} from "./packed-consumer-typecheck.mjs";

const fixtureDirectory = "/tmp/authbound-sdk-packed-consumers-test/nextjs";

function diagnostic(fileName) {
  return fileName ? { file: { fileName } } : {};
}

test("blocks config, consumer, and Authbound package diagnostics", () => {
  const diagnostics = [
    diagnostic(),
    diagnostic(join(fixtureDirectory, "consumer.ts")),
    diagnostic(
      join(
        fixtureDirectory,
        "node_modules",
        "@authbound",
        "nuxt",
        "dist",
        "module.d.mts"
      )
    ),
  ];

  assert.deepEqual(
    partitionPackedConsumerDiagnostics(diagnostics, fixtureDirectory),
    {
      blocking: diagnostics,
      external: [],
    }
  );
});

test("reports external framework diagnostics without treating them as Authbound failures", () => {
  const external = diagnostic(
    join(
      fixtureDirectory,
      "node_modules",
      "@nuxt",
      "schema",
      "dist",
      "index.d.mts"
    )
  );

  assert.deepEqual(
    partitionPackedConsumerDiagnostics([external], fixtureDirectory),
    {
      blocking: [],
      external: [external],
    }
  );
});

test("does not confuse similarly named external scopes with Authbound packages", () => {
  const external = diagnostic(
    join(
      fixtureDirectory,
      "node_modules",
      "@authbound-tools",
      "compiler",
      "index.d.ts"
    )
  );

  assert.deepEqual(
    partitionPackedConsumerDiagnostics([external], fixtureDirectory),
    {
      blocking: [],
      external: [external],
    }
  );
});

test("summarizes external diagnostics by package without dumping every diagnostic", () => {
  const diagnostics = [
    {
      code: 2307,
      file: {
        fileName: join(
          fixtureDirectory,
          "node_modules",
          ".pnpm",
          "@nuxt+schema@4.4.4",
          "node_modules",
          "@nuxt",
          "schema",
          "dist",
          "index.d.mts"
        ),
      },
    },
    {
      code: 2724,
      file: {
        fileName: join(
          fixtureDirectory,
          "node_modules",
          ".pnpm",
          "@nuxt+schema@4.4.4",
          "node_modules",
          "@nuxt",
          "schema",
          "dist",
          "index.d.mts"
        ),
      },
    },
    {
      code: 2307,
      file: {
        fileName: join(
          fixtureDirectory,
          "node_modules",
          "h3",
          "dist",
          "index.d.ts"
        ),
      },
    },
  ];

  assert.equal(
    summarizeExternalDiagnostics(diagnostics),
    "3 nonblocking external diagnostics: @nuxt/schema (2; TS2307, TS2724), h3 (1; TS2307)"
  );
});
