import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  AFFECTED_PACKAGES,
  assertChangedPublishablePackagesIncluded,
  assertInternalPins,
  assertSourceReleaseManifests,
  RELEASE_VERSION,
  resolveAffectedReleaseSet,
  unchangedAdapters,
} from "./release-set.mjs";

function createManifests({ serverCoreVersion = RELEASE_VERSION } = {}) {
  return {
    "@authbound/core": {
      name: "@authbound/core",
      version: RELEASE_VERSION,
      dependencies: {},
    },
    "@authbound/server": {
      name: "@authbound/server",
      version: RELEASE_VERSION,
      dependencies: { "@authbound/core": serverCoreVersion },
    },
    "@authbound/react": {
      name: "@authbound/react",
      version: "0.2.2",
      dependencies: { "@authbound/core": "0.2.2" },
    },
    "@authbound/vue": {
      name: "@authbound/vue",
      version: "0.2.2",
      dependencies: { "@authbound/core": "0.2.2" },
    },
    "@authbound/nextjs": {
      name: "@authbound/nextjs",
      version: "0.2.2",
      dependencies: {
        "@authbound/core": "0.2.2",
        "@authbound/react": "0.2.2",
        "@authbound/server": "0.2.2",
      },
    },
    "@authbound/nuxt": {
      name: "@authbound/nuxt",
      version: "0.2.2",
      dependencies: {
        "@authbound/core": "0.2.2",
        "@authbound/server": "0.2.2",
        "@authbound/vue": "0.2.2",
      },
    },
  };
}

function createSourceManifests(affectedPackages = AFFECTED_PACKAGES) {
  const manifests = createManifests();
  const affected = new Set(affectedPackages);

  for (const manifest of Object.values(manifests)) {
    if (affected.has(manifest.name)) {
      manifest.version = RELEASE_VERSION;
    }
    for (const dependency of Object.keys(manifest.dependencies)) {
      if (dependency.startsWith("@authbound/")) {
        manifest.dependencies[dependency] = "workspace:*";
      }
    }
  }

  return manifests;
}

test("resolves the explicit release set in dependency order", () => {
  const manifests = createManifests();

  assert.deepEqual(
    resolveAffectedReleaseSet(manifests, [
      "@authbound/core",
      "@authbound/server",
    ]),
    ["@authbound/core", "@authbound/server"]
  );
  assert.deepEqual(AFFECTED_PACKAGES, ["@authbound/core", "@authbound/server"]);
});

test("adds affected internal prerequisites to the dependency closure", () => {
  const manifests = createManifests();

  assert.deepEqual(
    resolveAffectedReleaseSet(manifests, ["@authbound/server"]),
    ["@authbound/core", "@authbound/server"]
  );
});

test("rejects a stale affected internal dependency pin", () => {
  const manifests = createManifests({ serverCoreVersion: "0.2.2" });

  assert.throws(
    () => assertInternalPins(manifests, "@authbound/server", "0.3.0"),
    /@authbound\/core must be pinned to 0\.3\.0/
  );
});

test("allows unchanged adapters to retain their compatible base pins", () => {
  const manifests = createManifests();

  assert.deepEqual(unchangedAdapters(manifests), [
    "@authbound/nextjs",
    "@authbound/nuxt",
    "@authbound/react",
    "@authbound/vue",
  ]);
});

test("allows an adapter to be promoted into the affected release set", () => {
  const affectedPackages = [...AFFECTED_PACKAGES, "@authbound/react"];
  const manifests = createSourceManifests(affectedPackages);

  assert.deepEqual(unchangedAdapters(manifests, affectedPackages), [
    "@authbound/nextjs",
    "@authbound/nuxt",
    "@authbound/vue",
  ]);
  assert.doesNotThrow(() =>
    assertSourceReleaseManifests(manifests, affectedPackages)
  );
});

test("rejects a changed publishable package omitted from the affected set", () => {
  assert.throws(
    () =>
      assertChangedPublishablePackagesIncluded(
        ["packages/react/src/index.ts"],
        AFFECTED_PACKAGES
      ),
    /@authbound\/react changed but is omitted from the affected release set/
  );
});

test("ignores package documentation changes when deriving publishable code changes", () => {
  assert.doesNotThrow(() =>
    assertChangedPublishablePackagesIncluded(
      ["packages/react/README.md", "RELEASE.md"],
      AFFECTED_PACKAGES
    )
  );
});

test("ignores package test fixtures when deriving publishable code changes", () => {
  assert.doesNotThrow(() =>
    assertChangedPublishablePackagesIncluded(
      [
        "packages/react/src/__tests__/provider.test.tsx",
        "packages/vue/src/plugin.test.ts",
        "packages/nextjs/src/server.spec.ts",
      ],
      AFFECTED_PACKAGES
    )
  );
});

test("still rejects production source, manifest, and export artifact changes", () => {
  for (const changedPath of [
    "packages/react/src/index.tsx",
    "packages/react/package.json",
    "packages/react/styles.css",
  ]) {
    assert.throws(
      () =>
        assertChangedPublishablePackagesIncluded(
          [changedPath],
          AFFECTED_PACKAGES
        ),
      /@authbound\/react changed but is omitted from the affected release set/
    );
  }
});

test("packed consumers check concrete adapter values and dependency declarations", () => {
  const source = readFileSync(
    new URL("./validate-packed-consumers.mjs", import.meta.url),
    "utf8"
  );

  assert.doesNotMatch(source, /skipLibCheck:\s*true/);
  assert.doesNotMatch(source, /declare const adapterExport/);
  assert.doesNotMatch(source, /\["exec", "tsc"/);
  assert.match(source, /collectPackedConsumerTypeDiagnostics/);
  assert.match(source, /"@authbound\/nuxt": "\{\}"/);
  assert.match(
    source,
    /const adapterExport = \$\{adapterTypeValues\[packageName\]\} satisfies AdapterExport/
  );
  assert.match(source, /routes:\s*\{/);
});

test("release workflow fetches the base tag history", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/sdk-release-check.yml", import.meta.url),
    "utf8"
  );

  assert.match(
    workflow,
    /uses: actions\/checkout@v4\n\s+with:\n\s+fetch-depth: 0/
  );
});

test("Unreleased documents the credential-definition lifecycle breaking changes", () => {
  const changelog = readFileSync(
    new URL("../CHANGELOG.md", import.meta.url),
    "utf8"
  );
  const unreleased = changelog.slice(0, changelog.indexOf("## 0.2.2"));

  assert.match(unreleased, /### Breaking changes/);
  assert.match(unreleased, /`create\(\)`[\s\S]*publish by default/);
  assert.match(unreleased, /lifecycle-discriminated complete responses/);
  assert.match(unreleased, /default listing[\s\S]*owned drafts/);
  assert.match(
    unreleased,
    /`list\(\{ lifecycleStatus: "published" \}\)`[\s\S]*published-only/
  );
  assert.match(
    unreleased,
    /`createDraft\(\)`[\s\S]*`update\(\)`[\s\S]*`publish\(\)`/
  );
  assert.match(unreleased, /`expiresAt`/);
  assert.match(unreleased, /polling[\s\S]*authoritative verification expiry/);
  assert.match(unreleased, /abort[\s\S]*cleanup/);
});
