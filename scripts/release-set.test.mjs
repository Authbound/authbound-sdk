import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AFFECTED_PACKAGES,
  assertChangedPublishablePackagesIncluded,
  assertInternalPins,
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
