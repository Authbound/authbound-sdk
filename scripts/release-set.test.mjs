import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  assertInternalPins,
  assertSourceReleaseManifests,
  RELEASE_VERSION,
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

function createSourceManifests() {
  const manifests = createManifests();

  for (const manifest of Object.values(manifests)) {
    manifest.version = RELEASE_VERSION;
    for (const dependency of Object.keys(manifest.dependencies)) {
      if (dependency.startsWith("@authbound/")) {
        manifest.dependencies[dependency] = "workspace:*";
      }
    }
  }

  return manifests;
}

test("rejects a stale affected internal dependency pin", () => {
  const manifests = createManifests({ serverCoreVersion: "0.2.2" });

  assert.throws(
    () => assertInternalPins(manifests, "@authbound/server", "0.3.0"),
    /@authbound\/core must be pinned to 0\.3\.0/
  );
});

test("accepts fully aligned source manifests", () => {
  const manifests = createSourceManifests();

  assert.doesNotThrow(() => assertSourceReleaseManifests(manifests));
});

test("rejects any package version outside the coherent release", () => {
  const manifests = createSourceManifests();
  manifests["@authbound/react"].version = "0.2.2";

  assert.throws(
    () => assertSourceReleaseManifests(manifests),
    /@authbound\/react must be 0\.3\.0; got 0\.2\.2/
  );
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
  assert.doesNotMatch(source, /createCompatibilityAdapterTarball/);
  assert.match(source, /for \(const packageName of ADAPTER_PACKAGES\)/);
  assert.match(source, /assertReviewedRegistryResolution/);
  assert.match(source, /"--lockfile-only"/);
  assert.match(source, /"--offline",\s*"--frozen-lockfile"/);
  assert.match(source, /env: runtimeEnvironment/);
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

test("release checklist blocks tagging until backend-first staging proof is recorded", () => {
  const release = readFileSync(
    new URL("../RELEASE.md", import.meta.url),
    "utf8"
  );

  assert.match(release, /backend[\s\S]*deployed to staging/i);
  assert.match(release, /deployed smoke/i);
  assert.match(release, /SDK 0\.2\.2[\s\S]*request compatibility/i);
  assert.match(release, /release candidate[\s\S]*lifecycle/i);
  assert.match(release, /record[\s\S]*staging evidence/i);
});
