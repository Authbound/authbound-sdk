import { spawnSync } from "node:child_process";
import {
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
  ADAPTER_PACKAGES,
  AFFECTED_PACKAGES,
  assertInternalPins,
  loadWorkspaceManifests,
  packageDirectory,
  RELEASE_VERSION,
} from "./release-set.mjs";

function diagnosticBaseline(filePath, code, messages) {
  return messages.map((message) => `${filePath}|TS${code}|${message}`);
}

// Nuxt's declaration graph reports unresolved optional integrations under
// skipLibCheck: false. Only these reviewed fingerprints are nonblocking.
const NUXT_EXTERNAL_DIAGNOSTIC_BASELINE = Object.freeze([
  ...diagnosticBaseline("@nuxt/schema/dist/index.d.mts", 2307, [
    "Cannot find module '@vue/language-core' or its corresponding type declarations.",
    "Cannot find module 'css-minimizer-webpack-plugin' or its corresponding type declarations.",
    "Cannot find module 'esbuild-loader' or its corresponding type declarations.",
    "Cannot find module 'mini-css-extract-plugin' or its corresponding type declarations.",
    "Cannot find module 'oxc-transform' or its corresponding type declarations.",
    "Cannot find module 'pug' or its corresponding type declarations.",
    "Cannot find module 'vue-loader' or its corresponding type declarations.",
    "Cannot find module 'webpack' or its corresponding type declarations.",
    "Cannot find module 'webpack-bundle-analyzer' or its corresponding type declarations.",
    "Cannot find module 'webpack-dev-middleware' or its corresponding type declarations.",
    "Cannot find module 'webpack-hot-middleware' or its corresponding type declarations.",
  ]),
  ...diagnosticBaseline("@nuxt/schema/dist/index.d.mts", 2310, [
    "Type 'AppConfig' recursively references itself as a base type.",
    "Type 'ConfigSchema' recursively references itself as a base type.",
    "Type 'CustomAppConfig' recursively references itself as a base type.",
    "Type 'ModuleDependencies' recursively references itself as a base type.",
    "Type 'NuxtConfig' recursively references itself as a base type.",
    "Type 'NuxtDebugOptions' recursively references itself as a base type.",
    "Type 'NuxtOptions' recursively references itself as a base type.",
    "Type 'NuxtPage' recursively references itself as a base type.",
    "Type 'ViteOptions' recursively references itself as a base type.",
  ]),
  ...diagnosticBaseline("@nuxt/schema/dist/index.d.mts", 2724, [
    "'\"h3\"' has no exported member named 'CorsOptions'. Did you mean 'H3CorsOptions'?",
  ]),
  ...diagnosticBaseline("@types/node/process.d.ts", 2430, [
    "Interface 'Process' incorrectly extends interface 'NitroStaticBuildFlags'.\n  Types of property 'versions' are incompatible.\n    Type 'ProcessVersions' has no properties in common with type '{ nitro?: string | undefined; }'.",
  ]),
  ...diagnosticBaseline("@vue/babel-plugin-jsx/dist/index.d.mts", 7016, [
    "Could not find a declaration file for module '@babel/core'. '@babel/core/lib/index.js' implicitly has an 'any' type.\n  Try `npm i --save-dev @types/babel__core` if it exists or add a new declaration (.d.ts) file containing `declare module '@babel/core';`",
  ]),
  ...diagnosticBaseline(
    "@vue/babel-plugin-resolve-type/dist/index.d.mts",
    7016,
    [
      "Could not find a declaration file for module '@babel/core'. '@babel/core/lib/index.js' implicitly has an 'any' type.\n  Try `npm i --save-dev @types/babel__core` if it exists or add a new declaration (.d.ts) file containing `declare module '@babel/core';`",
    ]
  ),
  ...diagnosticBaseline("cssnano/types/index.d.ts", 2309, [
    "An export assignment cannot be used in a module with other exported elements.",
  ]),
  ...diagnosticBaseline("db0/dist/index.d.mts", 2307, [
    "Cannot find module '@electric-sql/pglite' or its corresponding type declarations.",
    "Cannot find module '@libsql/client' or its corresponding type declarations.",
    "Cannot find module '@planetscale/database' or its corresponding type declarations.",
    "Cannot find module 'mysql2/promise' or its corresponding type declarations.",
    "Cannot find module 'pg' or its corresponding type declarations.",
  ]),
  ...diagnosticBaseline("h3/dist/index.d.ts", 2552, [
    "Cannot find name 'FetchEvent'. Did you mean 'TouchEvent'?",
  ]),
  ...diagnosticBaseline("listhen/dist/index.d.ts", 2307, [
    "Cannot find module 'jiti/lib/types' or its corresponding type declarations.",
  ]),
  ...diagnosticBaseline("nitropack/dist/presets/cloudflare/types.d.ts", 2307, [
    "Cannot find module '@cloudflare/workers-types' or its corresponding type declarations.",
    "Cannot find module 'cloudflare:workers' or its corresponding type declarations.",
  ]),
  ...diagnosticBaseline("nitropack/dist/presets/firebase/types.d.ts", 2307, [
    "Cannot find module 'firebase-functions/v1' or its corresponding type declarations.",
    "Cannot find module 'firebase-functions/v2/https' or its corresponding type declarations.",
  ]),
  ...diagnosticBaseline("nitropack/dist/shared/nitro.D682J6aL.d.ts", 2307, [
    "Cannot find module '@scalar/api-reference' or its corresponding type declarations.",
  ]),
  ...diagnosticBaseline("nitropack/dist/types/index.d.ts", 2321, [
    "Excessive stack depth comparing types '{ key: string; exact: false; score: []; catchAll: false; }' and '{ score: MaxTuple<Matches[\"score\"], []>; }'.",
  ]),
  ...diagnosticBaseline("unplugin/dist/index.d.mts", 2307, [
    "Cannot find module '@farmfe/core' or its corresponding type declarations.",
    "Cannot find module '@rsbuild/core' or its corresponding type declarations.",
    "Cannot find module '@rspack/core' or its corresponding type declarations.",
    "Cannot find module 'bun' or its corresponding type declarations.",
    "Cannot find module 'unloader' or its corresponding type declarations.",
    "Cannot find module 'webpack' or its corresponding type declarations.",
  ]),
  ...diagnosticBaseline(
    "unstorage/drivers/azure-app-configuration.d.mts",
    2307,
    [
      "Cannot find module '@azure/app-configuration' or its corresponding type declarations.",
    ]
  ),
  ...diagnosticBaseline("unstorage/drivers/azure-cosmos.d.mts", 2307, [
    "Cannot find module '@azure/cosmos' or its corresponding type declarations.",
  ]),
  ...diagnosticBaseline("unstorage/drivers/azure-key-vault.d.mts", 2307, [
    "Cannot find module '@azure/keyvault-secrets' or its corresponding type declarations.",
  ]),
  ...diagnosticBaseline("unstorage/drivers/azure-storage-blob.d.mts", 2307, [
    "Cannot find module '@azure/storage-blob' or its corresponding type declarations.",
  ]),
  ...diagnosticBaseline("unstorage/drivers/azure-storage-table.d.mts", 2307, [
    "Cannot find module '@azure/data-tables' or its corresponding type declarations.",
  ]),
  ...diagnosticBaseline("unstorage/drivers/capacitor-preferences.d.mts", 2307, [
    "Cannot find module '@capacitor/preferences' or its corresponding type declarations.",
  ]),
  ...diagnosticBaseline("unstorage/drivers/cloudflare-kv-binding.d.mts", 2304, [
    "Cannot find name 'KVNamespace'.",
    "Cannot find name 'KVNamespace'.",
  ]),
  ...diagnosticBaseline("unstorage/drivers/cloudflare-r2-binding.d.mts", 2304, [
    "Cannot find name 'R2Bucket'.",
    "Cannot find name 'R2Bucket'.",
  ]),
  ...diagnosticBaseline("unstorage/drivers/deno-kv-node.d.mts", 2307, [
    "Cannot find module '@deno/kv' or its corresponding type declarations.",
  ]),
  ...diagnosticBaseline("unstorage/drivers/deno-kv.d.mts", 2307, [
    "Cannot find module '@deno/kv' or its corresponding type declarations.",
  ]),
  ...diagnosticBaseline("unstorage/drivers/deno-kv.d.mts", 2503, [
    "Cannot find namespace 'Deno'.",
  ]),
  ...diagnosticBaseline("unstorage/drivers/mongodb.d.mts", 2307, [
    "Cannot find module 'mongodb' or its corresponding type declarations.",
    "Cannot find module 'mongodb' or its corresponding type declarations.",
  ]),
  ...diagnosticBaseline("unstorage/drivers/netlify-blobs.d.mts", 2307, [
    "Cannot find module '@netlify/blobs' or its corresponding type declarations.",
  ]),
  ...diagnosticBaseline("unstorage/drivers/planetscale.d.mts", 2307, [
    "Cannot find module '@planetscale/database' or its corresponding type declarations.",
  ]),
  ...diagnosticBaseline("unstorage/drivers/uploadthing.d.mts", 2307, [
    "Cannot find module 'uploadthing/server' or its corresponding type declarations.",
  ]),
  ...diagnosticBaseline("unstorage/drivers/upstash.d.mts", 2307, [
    "Cannot find module '@upstash/redis' or its corresponding type declarations.",
  ]),
  ...diagnosticBaseline("unstorage/drivers/vercel-kv.d.mts", 2307, [
    "Cannot find module '@upstash/redis' or its corresponding type declarations.",
    "Cannot find module '@vercel/kv' or its corresponding type declarations.",
  ]),
  ...diagnosticBaseline("unstorage/drivers/vercel-runtime-cache.d.mts", 2307, [
    "Cannot find module '@vercel/functions' or its corresponding type declarations.",
  ]),
  ...diagnosticBaseline("webpack-virtual-modules/lib/index.d.ts", 2307, [
    "Cannot find module 'webpack' or its corresponding type declarations.",
  ]),
]);

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
  const releaseOverrides = AFFECTED_PACKAGES.map(
    (dependency) =>
      `  '${dependency}@${RELEASE_VERSION}': file:${affectedTarballs[dependency]}`
  ).join("\n");
  writeFileSync(
    join(fixtureDirectory, "pnpm-workspace.yaml"),
    `overrides:\n${releaseOverrides}\n`
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
    fixtureDirectory,
    packageName === "@authbound/nuxt" ? NUXT_EXTERNAL_DIAGNOSTIC_BASELINE : []
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
    `${packageName}@${RELEASE_VERSION} passed dependency-tree, type, and runtime checks with aligned Authbound dependencies`
  );
}

try {
  const manifests = loadWorkspaceManifests(sdkRoot);
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

  for (const packageName of ADAPTER_PACKAGES) {
    validateAdapterConsumer(
      packageName,
      affectedTarballs,
      affectedTarballs[packageName],
      packedAffectedManifests[packageName]
    );
  }
} finally {
  rmSync(resolvedTempRoot, { recursive: true });
}
