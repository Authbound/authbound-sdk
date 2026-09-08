import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  assertReviewedRegistryResolution,
  credentialFreeEnvironment,
  readOnlyNodeArguments,
  reviewedPackageOverrides,
} from "./packed-consumer-lock.mjs";

const reviewedLock = `
lockfileVersion: '9.0'

packages:

  '@scope/reviewed@1.2.3':
    resolution: {integrity: sha512-reviewed}

  plain-package@4.5.6:
    resolution: {integrity: sha512-plain}
    peerDependencies:
      peer-package: ^1.0.0

snapshots:

  '@scope/reviewed@1.2.3': {}
`;

test("accepts only registry artifacts present in the reviewed lock", () => {
  const candidate = `
packages:

  '@authbound/core@file:../core.tgz':
    resolution: {integrity: sha512-local, tarball: file:../core.tgz}

  '@scope/reviewed@1.2.3':
    resolution: {integrity: sha512-reviewed}

  plain-package@4.5.6:
    resolution: {integrity: sha512-plain}
    peerDependencies:
      peer-package: ^1.0.0

snapshots:
`;

  assert.equal(
    assertReviewedRegistryResolution(
      reviewedLock,
      candidate,
      new Map([["@authbound/core", "sha512-local"]])
    ),
    2
  );
});

test("rejects local artifacts outside the explicit packed SDK allowlist", () => {
  const candidate = `
packages:

  unreviewed-local@file:../unreviewed.tgz:
    resolution: {integrity: sha512-local, tarball: file:../unreviewed.tgz}

snapshots:
`;

  assert.throws(
    () => assertReviewedRegistryResolution(reviewedLock, candidate, new Map()),
    /unreviewed-local@file:\.\.\/unreviewed\.tgz does not match an allowed packed SDK artifact/
  );
});

test("rejects a packed SDK artifact whose content integrity changed", () => {
  const candidate = `
packages:

  '@authbound/core@file:../core.tgz':
    resolution: {integrity: sha512-tampered, tarball: file:../core.tgz}

snapshots:
`;

  assert.throws(
    () =>
      assertReviewedRegistryResolution(
        reviewedLock,
        candidate,
        new Map([["@authbound/core", "sha512-expected"]])
      ),
    /@authbound\/core@file:\.\.\/core\.tgz does not match an allowed packed SDK artifact/
  );
});

test("rejects a newly resolved compatible registry version", () => {
  const candidate = `
packages:

  '@scope/reviewed@1.2.4':
    resolution: {integrity: sha512-newer}

snapshots:
`;

  assert.throws(
    () => assertReviewedRegistryResolution(reviewedLock, candidate),
    /@scope\/reviewed@1\.2\.4 is absent from the reviewed root lock/
  );
});

test("rejects changed integrity for a reviewed registry version", () => {
  const candidate = `
packages:

  '@scope/reviewed@1.2.3':
    resolution: {integrity: sha512-replaced}

snapshots:
`;

  assert.throws(
    () => assertReviewedRegistryResolution(reviewedLock, candidate),
    /@scope\/reviewed@1\.2\.3 integrity differs from the reviewed root lock/
  );
});

test("rejects a registry resolution without integrity", () => {
  const candidate = `
packages:

  plain-package@4.5.6:
    resolution: {tarball: https://registry.invalid/plain.tgz}

snapshots:
`;

  assert.throws(
    () => assertReviewedRegistryResolution(reviewedLock, candidate),
    /plain-package@4\.5\.6 has no locked integrity/
  );
});

test("runtime environment excludes credentials and host injection options", () => {
  const environment = credentialFreeEnvironment(
    {
      PATH: "/safe/bin",
      HOME: "/host/home",
      NPM_TOKEN: "secret",
      NODE_OPTIONS: "--require=/host/inject.cjs",
      AWS_SECRET_ACCESS_KEY: "secret",
    },
    "/isolated"
  );

  assert.deepEqual(environment, {
    PATH: "/safe/bin",
    HOME: "/isolated/home",
    TMPDIR: "/isolated/tmp",
    TMP: "/isolated/tmp",
    TEMP: "/isolated/tmp",
    CI: "true",
    NO_COLOR: "1",
  });
});

test("runtime node permissions grant only fixture reads", () => {
  assert.deepEqual(
    readOnlyNodeArguments(
      "/isolated/consumer",
      "runtime.mjs",
      new Set(["--permission"])
    ),
    ["--permission", "--allow-fs-read=/isolated/consumer", "runtime.mjs"]
  );
  assert.deepEqual(
    readOnlyNodeArguments(
      "/isolated/consumer",
      "runtime.mjs",
      new Set(["--experimental-permission"])
    ),
    [
      "--experimental-permission",
      "--allow-fs-read=/isolated/consumer",
      "runtime.mjs",
    ]
  );
  assert.throws(
    () => readOnlyNodeArguments("/isolated/consumer", "runtime.mjs", new Set()),
    /Node permission model/
  );
});

test("runtime containment hides secrets and blocks host-file reads", () => {
  const testRoot = mkdtempSync(join(tmpdir(), "authbound-permission-test-"));
  try {
    const fixtureDirectory = join(testRoot, "fixture");
    mkdirSync(fixtureDirectory);
    const hostFile = join(testRoot, "host-secret.txt");
    writeFileSync(hostFile, "must-not-be-readable");
    writeFileSync(
      join(fixtureDirectory, "probe.mjs"),
      `
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

assert.equal(process.env.RELEASE_SECRET, undefined);
assert.throws(
  () => readFileSync(process.argv[2], "utf8"),
  (error) => error?.code === "ERR_ACCESS_DENIED"
);
`
    );
    const environment = credentialFreeEnvironment(
      { ...process.env, RELEASE_SECRET: "not-for-the-child" },
      fixtureDirectory
    );
    const result = spawnSync(
      process.execPath,
      [
        ...readOnlyNodeArguments(realpathSync(fixtureDirectory), "probe.mjs"),
        hostFile,
      ],
      { cwd: fixtureDirectory, encoding: "utf8", env: environment }
    );

    assert.equal(result.status, 0, result.stderr);
  } finally {
    rmSync(testRoot, { recursive: true });
  }
});

test("derives reviewed overrides without crossing semver compatibility families", () => {
  const lockfile = `
packages:

  '@authbound/core@file:../core.tgz':
    resolution: {integrity: sha512-local, tarball: file:../core.tgz}

  '@scope/reviewed@1.2.3':
    resolution: {integrity: sha512-reviewed}

  plain-package@4.5.6:
    resolution: {integrity: sha512-plain}

  multi-version@1.0.0:
    resolution: {integrity: sha512-one}

  multi-version@2.0.0:
    resolution: {integrity: sha512-two}

  prerelease-family@1.0.0-rc.1:
    resolution: {integrity: sha512-rc-one}

  prerelease-family@1.0.0-rc.2:
    resolution: {integrity: sha512-rc-two}

snapshots:
`;

  assert.deepEqual(reviewedPackageOverrides(lockfile), {
    "@scope/reviewed": "1.2.3",
    "multi-version@>=1.0.0 <2.0.0": "1.0.0",
    "multi-version@>=2.0.0 <3.0.0": "2.0.0",
    "plain-package": "4.5.6",
    "prerelease-family@>=1.0.0 <2.0.0": "1.0.0-rc.2",
  });
});
