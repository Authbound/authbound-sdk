import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  collectPackedConsumerTypeDiagnostics,
  summarizeExternalDiagnostics,
} from "./packed-consumer-typecheck.mjs";
import {
  AFFECTED_PACKAGES,
  assertInternalPins,
  BASE_RELEASE_TAG,
  BASE_VERSION,
  classifyPublishablePackageChange,
  expectedUnchangedAdapters,
  loadWorkspaceManifests,
  packageDirectory,
  RELEASE_VERSION,
  unchangedAdapters,
} from "./release-set.mjs";

const sdkRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tempPrefix = join(tmpdir(), "authbound-sdk-packed-consumers-");
const tempRoot = mkdtempSync(tempPrefix);
const resolvedTempRoot = realpathSync(tempRoot);
const resolvedSystemTemp = realpathSync(tmpdir());
const expectedTempPrefix = `${resolvedSystemTemp}${sep}authbound-sdk-packed-consumers-`;
if (!resolvedTempRoot.startsWith(expectedTempPrefix)) {
  throw new Error(`Unexpected packed-consumer temp directory ${tempRoot}`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? sdkRoot,
    encoding: "utf8",
    env: { ...process.env, ...options.env },
  });
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
    throw new Error(
      `${command} ${args.join(" ")} failed with ${result.status}${output ? `\n${output.trim()}` : ""}`
    );
  }
  return result.stdout.trim();
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function readPackedManifest(tarballPath) {
  return JSON.parse(run("tar", ["-xOf", tarballPath, "package/package.json"]));
}

function packPackage(packageName, sourceDirectory, outputDirectory, env) {
  const tarballPath = join(
    outputDirectory,
    `${packageDirectory(packageName)}-${readFileManifest(sourceDirectory).version}.tgz`
  );
  run("pnpm", ["pack", "--out", tarballPath], {
    cwd: sourceDirectory,
    env,
  });
  if (!existsSync(tarballPath)) {
    throw new Error(`${packageName} did not produce ${tarballPath}`);
  }
  return tarballPath;
}

function readFileManifest(packageDirectoryPath) {
  return JSON.parse(
    readFileSync(join(packageDirectoryPath, "package.json"), "utf8")
  );
}

function baseManifest(packageName) {
  const manifestPath = `packages/${packageDirectory(packageName)}/package.json`;
  return JSON.parse(
    run("git", ["show", `${BASE_RELEASE_TAG}:${manifestPath}`])
  );
}

function materializeBaseManifest(packageName) {
  const manifest = baseManifest(packageName);
  for (const field of ["dependencies", "optionalDependencies"]) {
    for (const [dependency, range] of Object.entries(manifest[field] ?? {})) {
      if (
        dependency.startsWith("@authbound/") &&
        range.startsWith("workspace:")
      ) {
        manifest[field][dependency] = baseManifest(dependency).version;
      }
    }
  }
  if (manifest.scripts) {
    delete manifest.scripts.prepack;
  }
  return manifest;
}

function assertAdapterSourceAndExportsUnchanged(packageName) {
  const directory = `packages/${packageDirectory(packageName)}`;
  const changedFiles = run("git", [
    "diff",
    "--name-only",
    BASE_RELEASE_TAG,
    "--",
    directory,
  ])
    .split(/\r?\n/)
    .filter(Boolean)
    .filter(
      (filePath) => classifyPublishablePackageChange(filePath) === packageName
    );

  if (changedFiles.length > 0) {
    throw new Error(
      `${packageName} cannot remain unchanged because tracked source/export files changed: ${changedFiles.join(", ")}`
    );
  }
}

function createCompatibilityAdapterTarball(packageName, outputDirectory) {
  assertAdapterSourceAndExportsUnchanged(packageName);
  const directoryName = packageDirectory(packageName);
  const sourceDirectory = join(sdkRoot, "packages", directoryName);
  const compatibilityDirectory = join(
    tempRoot,
    "compatibility-sources",
    directoryName
  );
  cpSync(sourceDirectory, compatibilityDirectory, {
    recursive: true,
    filter: (source) => {
      const basename = source.split(sep).at(-1);
      return basename !== "node_modules" && basename !== ".turbo";
    },
  });

  const manifest = materializeBaseManifest(packageName);
  writeJson(join(compatibilityDirectory, "package.json"), manifest);
  const tarballPath = packPackage(
    packageName,
    compatibilityDirectory,
    outputDirectory,
    { npm_config_ignore_scripts: "true" }
  );
  const packedManifest = readPackedManifest(tarballPath);

  for (const field of ["dependencies", "optionalDependencies"]) {
    for (const [dependency, range] of Object.entries(
      packedManifest[field] ?? {}
    )) {
      if (dependency.startsWith("@authbound/") && range !== BASE_VERSION) {
        throw new Error(
          `${packageName} compatibility tarball ${dependency} must be pinned to ${BASE_VERSION}; got ${range}`
        );
      }
    }
  }

  return { manifest: packedManifest, tarballPath };
}

const adapterTypeImports = {
  "@authbound/nextjs":
    'import type { AuthboundConfig as AdapterExport } from "@authbound/nextjs";',
  "@authbound/nuxt":
    'import type { ModuleOptions as AdapterExport } from "@authbound/nuxt";',
  "@authbound/react":
    'import type { UseVerificationOptions as AdapterExport } from "@authbound/react";',
  "@authbound/vue":
    'import type { UseVerificationOptions as AdapterExport } from "@authbound/vue";',
};

const adapterTypeValues = {
  "@authbound/nextjs": `{
  apiKey: "sk_test_packed_consumer",
  secret: "packed-consumer-secret-at-least-32-characters",
  routes: { protected: [], verify: "/verify" },
}`,
  "@authbound/nuxt": "{}",
  "@authbound/react": "{}",
  "@authbound/vue": "{}",
};

function typeFixture(packageName) {
  return `
import {
  AuthboundClient,
  type CredentialDefinition,
  type CreateCredentialDefinitionOptions,
} from "@authbound/server";
${adapterTypeImports[packageName]}

const client = new AuthboundClient({
  apiKey: "sk_test_packed_consumer",
  apiUrl: "https://packed.invalid",
});
const definition = {
  credentialDefinitionId: "employee_badge_v2",
  vct: "urn:vc:authbound:employee_badge:2",
  format: "dc+sd-jwt",
  title: "Employee badge",
  claims: [{ path: ["employeeId"], mandatory: true }],
} satisfies CreateCredentialDefinitionOptions;

void client.issuer.credentialDefinitions.create(definition);
void client.issuer.credentialDefinitions.createDraft(definition);
void client.issuer.credentialDefinitions.publish("employee_badge_v2");

function narrowLifecycle(value: CredentialDefinition): string {
  switch (value.lifecycleStatus) {
    case "draft":
      return value.lifecycleStatus;
    case "published":
      return value.lifecycleStatus;
    case "archived":
      return value.lifecycleStatus;
    default: {
      const exhaustive: never = value;
      return exhaustive;
    }
  }
}

const adapterExport = ${adapterTypeValues[packageName]} satisfies AdapterExport;
void adapterExport;
void narrowLifecycle;
`;
}

function runtimeFixture(packageName) {
  return `
import assert from "node:assert/strict";
import { AuthboundClient } from "@authbound/server";

let requestCount = 0;
globalThis.fetch = async (input) => {
  requestCount += 1;
  assert.ok(String(input).startsWith("https://packed.invalid/"));
  return new Response(JSON.stringify({ object: "list", data: [] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};

const adapter = await import(${JSON.stringify(packageName)});
assert.equal(typeof adapter.asPolicyId, "function");
assert.equal(
  adapter.asPolicyId("pol_authbound_packed_fixture_v1"),
  "pol_authbound_packed_fixture_v1"
);

const client = new AuthboundClient({
  apiKey: "sk_test_packed_consumer",
  apiUrl: "https://packed.invalid",
});
const definitions = await client.issuer.credentialDefinitions.list();
assert.deepEqual(definitions, { object: "list", data: [] });
assert.equal(requestCount, 1);
`;
}

function dependencyTreeFixture(packageName, expectedDependencies) {
  return `
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const fixtureRequire = createRequire(import.meta.url);

function packageManifestFromEntry(entry) {
  let current = dirname(entry);
  while (true) {
    const candidate = join(current, "package.json");
    try {
      return JSON.parse(readFileSync(candidate, "utf8"));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    const parent = dirname(current);
    if (parent === current) throw new Error("Could not locate package.json for " + entry);
    current = parent;
  }
}

const rootCore = packageManifestFromEntry(fixtureRequire.resolve("@authbound/core"));
const rootServer = packageManifestFromEntry(fixtureRequire.resolve("@authbound/server"));
assert.equal(rootCore.version, ${JSON.stringify(RELEASE_VERSION)});
assert.equal(rootServer.version, ${JSON.stringify(RELEASE_VERSION)});

const adapterEntry = fileURLToPath(
  import.meta.resolve(${JSON.stringify(packageName)})
);
const adapterRequire = createRequire(adapterEntry);
const expected = ${JSON.stringify(expectedDependencies)};
for (const [dependency, version] of Object.entries(expected)) {
  const manifest = packageManifestFromEntry(adapterRequire.resolve(dependency));
  assert.equal(manifest.version, version, dependency + " resolved from adapter");
}
`;
}

function validateAdapterConsumer(
  packageName,
  affectedTarballs,
  adapterTarball,
  adapterManifest
) {
  const fixtureDirectory = join(
    tempRoot,
    "consumers",
    packageDirectory(packageName)
  );
  mkdirSync(fixtureDirectory, { recursive: true });
  const peerDependencies = adapterManifest.peerDependencies ?? {};
  const manifest = {
    name: `packed-consumer-${packageDirectory(packageName)}`,
    private: true,
    type: "module",
    packageManager: "pnpm@11.1.3",
    dependencies: {
      ...peerDependencies,
      "@authbound/core": `file:${affectedTarballs["@authbound/core"]}`,
      "@authbound/server": `file:${affectedTarballs["@authbound/server"]}`,
      [packageName]: `file:${adapterTarball}`,
    },
    devDependencies: {
      "@types/node": "24.10.1",
      "@types/react": "19.2.0",
      "@types/react-dom": "19.2.0",
      typescript: "5.9.2",
    },
  };
  writeJson(join(fixtureDirectory, "package.json"), manifest);
  writeFileSync(
    join(fixtureDirectory, "pnpm-workspace.yaml"),
    `overrides:\n  '@authbound/core@${RELEASE_VERSION}': file:${affectedTarballs["@authbound/core"]}\n`
  );
  writeJson(join(fixtureDirectory, "tsconfig.json"), {
    compilerOptions: {
      strict: true,
      target: "ES2022",
      module: "ESNext",
      moduleResolution: "Bundler",
      noEmit: true,
      skipLibCheck: false,
    },
    include: ["consumer.ts"],
  });
  writeFileSync(
    join(fixtureDirectory, "consumer.ts"),
    typeFixture(packageName)
  );
  writeFileSync(
    join(fixtureDirectory, "runtime.mjs"),
    runtimeFixture(packageName)
  );

  const expectedInternalDependencies = Object.fromEntries(
    Object.entries(adapterManifest.dependencies ?? {}).filter(([dependency]) =>
      dependency.startsWith("@authbound/")
    )
  );
  writeFileSync(
    join(fixtureDirectory, "dependency-tree.mjs"),
    dependencyTreeFixture(packageName, expectedInternalDependencies)
  );

  run("pnpm", ["install", "--ignore-scripts", "--no-frozen-lockfile"], {
    cwd: fixtureDirectory,
  });
  const fixtureRequire = createRequire(join(fixtureDirectory, "package.json"));
  const typescript = fixtureRequire("typescript");
  const { blocking, external } = collectPackedConsumerTypeDiagnostics(
    typescript,
    fixtureDirectory
  );
  if (external.length > 0) {
    console.warn(`${packageName}: ${summarizeExternalDiagnostics(external)}`);
  }
  if (blocking.length > 0) {
    throw new Error(
      `${packageName} has blocking packed consumer declaration diagnostics:\n${typescript.formatDiagnostics(
        blocking,
        {
          getCanonicalFileName: (fileName) => fileName,
          getCurrentDirectory: () => fixtureDirectory,
          getNewLine: () => "\n",
        }
      )}`
    );
  }
  run(process.execPath, ["dependency-tree.mjs"], { cwd: fixtureDirectory });
  run(process.execPath, ["runtime.mjs"], { cwd: fixtureDirectory });
  console.log(
    `${packageName}@${BASE_VERSION} passed side-by-side dependency-tree, type, and runtime checks with core/server@${RELEASE_VERSION}`
  );
}

try {
  const manifests = loadWorkspaceManifests(sdkRoot);
  const expectedAdapters = expectedUnchangedAdapters(AFFECTED_PACKAGES).sort();
  const adapters = unchangedAdapters(manifests, AFFECTED_PACKAGES);
  if (JSON.stringify(adapters) !== JSON.stringify(expectedAdapters)) {
    throw new Error(
      `Expected unchanged adapters ${expectedAdapters.join(", ")}; got ${adapters.join(", ")}`
    );
  }

  const tarballDirectory = join(tempRoot, "tarballs");
  mkdirSync(tarballDirectory, { recursive: true });
  const affectedTarballs = Object.fromEntries(
    AFFECTED_PACKAGES.map((packageName) => [
      packageName,
      packPackage(
        packageName,
        join(sdkRoot, "packages", packageDirectory(packageName)),
        tarballDirectory
      ),
    ])
  );
  const packedAffectedManifests = Object.fromEntries(
    AFFECTED_PACKAGES.map((packageName) => [
      packageName,
      readPackedManifest(affectedTarballs[packageName]),
    ])
  );
  for (const packageName of AFFECTED_PACKAGES) {
    const manifest = packedAffectedManifests[packageName];
    if (manifest.version !== RELEASE_VERSION) {
      throw new Error(
        `${packageName} packed version must be ${RELEASE_VERSION}; got ${manifest.version}`
      );
    }
    assertInternalPins(
      packedAffectedManifests,
      packageName,
      RELEASE_VERSION,
      AFFECTED_PACKAGES
    );
  }
  console.log(
    `Affected tarballs contain exact ${RELEASE_VERSION} versions and internal pins`
  );

  for (const packageName of adapters) {
    const { manifest, tarballPath } = createCompatibilityAdapterTarball(
      packageName,
      tarballDirectory
    );
    validateAdapterConsumer(
      packageName,
      affectedTarballs,
      tarballPath,
      manifest
    );
  }
} finally {
  rmSync(resolvedTempRoot, { recursive: true });
}
