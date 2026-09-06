import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  collectPackedConsumerTypeDiagnostics,
  partitionPackedConsumerDiagnostics,
  summarizeExternalDiagnostics,
} from "./packed-consumer-typecheck.mjs";

const fixtureDirectory = "/tmp/authbound-sdk-packed-consumers-test/nextjs";
const typescript = createRequire(import.meta.url)("typescript");

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

test("blocks external framework declaration diagnostics by default", () => {
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
      blocking: [external],
      external: [],
    }
  );
});

test("blocks similarly named external package diagnostics by default", () => {
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
      blocking: [external],
      external: [],
    }
  );
});

test("allows only exact count-bounded diagnostics from a reviewed external baseline", () => {
  const knownDiagnostic = {
    code: 2307,
    file: {
      fileName: join(
        fixtureDirectory,
        "node_modules",
        ".pnpm",
        "example-framework@2.0.0",
        "node_modules",
        "example-framework",
        "index.d.ts"
      ),
    },
    messageText:
      "Cannot find module 'optional-framework-types' or its corresponding type declarations.",
  };
  const sameCodeWithDifferentMeaning = {
    ...knownDiagnostic,
    messageText:
      "Cannot find module 'public-option-types' or its corresponding type declarations.",
  };
  const reviewedBaseline = [
    "example-framework/index.d.ts|TS2307|Cannot find module 'optional-framework-types' or its corresponding type declarations.",
  ];

  assert.deepEqual(
    partitionPackedConsumerDiagnostics(
      [knownDiagnostic, knownDiagnostic, sameCodeWithDifferentMeaning],
      fixtureDirectory,
      reviewedBaseline
    ),
    {
      blocking: [knownDiagnostic, sameCodeWithDifferentMeaning],
      external: [knownDiagnostic],
    }
  );
});

test("rejects a reviewed external baseline when an expected diagnostic disappears", () => {
  const expectedDiagnostic =
    "example-framework/index.d.ts|TS2307|Cannot find module 'optional-framework-types' or its corresponding type declarations.";

  assert.throws(
    () =>
      partitionPackedConsumerDiagnostics([], fixtureDirectory, [
        expectedDiagnostic,
      ]),
    /reviewed external diagnostic baseline was not observed[\s\S]*example-framework\/index\.d\.ts\|TS2307/
  );
});

test("blocks a transitive declaration error that erases an Authbound public option type", () => {
  const compilerFixture = mkdtempSync(
    join(tmpdir(), "authbound-sdk-broken-public-type-")
  );
  try {
    const frameworkDirectory = join(
      compilerFixture,
      "node_modules",
      "example-framework"
    );
    const authboundDirectory = join(
      compilerFixture,
      "node_modules",
      "@authbound",
      "example-adapter"
    );
    mkdirSync(frameworkDirectory, { recursive: true });
    mkdirSync(authboundDirectory, { recursive: true });

    writeFileSync(
      join(compilerFixture, "tsconfig.json"),
      `${JSON.stringify(
        {
          compilerOptions: {
            module: "ESNext",
            moduleResolution: "Bundler",
            noEmit: true,
            skipLibCheck: false,
            strict: true,
            target: "ES2022",
          },
          include: ["consumer.ts"],
        },
        null,
        2
      )}\n`
    );
    writeFileSync(
      join(frameworkDirectory, "package.json"),
      `${JSON.stringify({ name: "example-framework", types: "index.d.ts" })}\n`
    );
    writeFileSync(
      join(frameworkDirectory, "index.d.ts"),
      `import type { MissingFrameworkOption } from "missing-framework-types";\nexport interface FrameworkOptions { publicOption: MissingFrameworkOption; }\n`
    );
    writeFileSync(
      join(authboundDirectory, "package.json"),
      `${JSON.stringify({ name: "@authbound/example-adapter", types: "index.d.ts" })}\n`
    );
    writeFileSync(
      join(authboundDirectory, "index.d.ts"),
      `import type { FrameworkOptions } from "example-framework";\nexport interface AuthboundConfig { framework: FrameworkOptions; }\n`
    );
    writeFileSync(
      join(compilerFixture, "consumer.ts"),
      `import type { AuthboundConfig } from "@authbound/example-adapter";\ndeclare const config: AuthboundConfig;\nconst valueAcceptedBecauseMissingTypeBecomesAny: string = config.framework.publicOption;\nvoid valueAcceptedBecauseMissingTypeBecomesAny;\n`
    );

    const { blocking, external } = collectPackedConsumerTypeDiagnostics(
      typescript,
      compilerFixture
    );

    assert.deepEqual(
      [...blocking, ...external].map((diagnostic) => diagnostic.code),
      [2307]
    );
    assert.deepEqual(
      blocking.map((diagnostic) => diagnostic.code),
      [2307]
    );
    assert.deepEqual(external, []);
    assert.match(
      blocking[0].file.fileName,
      /node_modules\/example-framework\/index\.d\.ts$/
    );
  } finally {
    rmSync(compilerFixture, { force: true, recursive: true });
  }
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
