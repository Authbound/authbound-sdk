import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const packageNames = ["core", "server", "react", "nextjs", "vue", "nuxt"];
const authboundScope = "@authbound";
const forbiddenText = [`${authboundScope}-sdk/`, `${authboundScope}/shared`];
const expectedExportKeys = {
  core: ["."],
  server: [".", "./next", "./express", "./hono", "./edge"],
  react: [".", "./testing", "./styles.css"],
  nextjs: [".", "./middleware", "./server", "./client", "./styles.css"],
  vue: [".", "./styles.css"],
  nuxt: ["."],
};
const generatedMetadataSource =
  "Generated from Authbound mono @authbound/api-contract by scripts/generate-api-contract-artifacts.ts";
const generatedMetadataFiles = [
  "packages/core/src/generated/api-contract.ts",
  "packages/server/src/generated/api-contract.ts",
];

function preservesCssSideEffects(sideEffects) {
  return Array.isArray(sideEffects) && sideEffects.includes("**/*.css");
}

function collectExportTargets(exportsField, prefix = "exports") {
  if (typeof exportsField === "string") {
    return [[prefix, exportsField]];
  }

  if (!exportsField || typeof exportsField !== "object") {
    return [];
  }

  return Object.entries(exportsField).flatMap(([key, value]) =>
    collectExportTargets(value, `${prefix}.${key}`)
  );
}

let hasFailure = false;
let expectedVersion = null;

for (const packageName of packageNames) {
  const packageDir = join("packages", packageName);
  const manifestPath = join(packageDir, "package.json");
  const manifestText = readFileSync(manifestPath, "utf8");
  const manifest = JSON.parse(manifestText);

  expectedVersion ??= manifest.version;
  if (manifest.version !== expectedVersion) {
    hasFailure = true;
    console.error(
      `${manifest.name} version ${manifest.version} does not match ${expectedVersion}`
    );
  }

  const exportKeys = Object.keys(manifest.exports ?? {});
  const expectedExports = expectedExportKeys[packageName];
  if (JSON.stringify(exportKeys) !== JSON.stringify(expectedExports)) {
    hasFailure = true;
    console.error(
      `${manifest.name} exports changed: expected ${expectedExports.join(", ")}, got ${exportKeys.join(", ")}`
    );
  }

  const targets = [
    ...["main", "module", "types"]
      .filter((field) => manifest[field])
      .map((field) => [field, manifest[field]]),
    ...collectExportTargets(manifest.exports),
  ];

  for (const [field, target] of targets) {
    if (!existsSync(join(packageDir, target))) {
      hasFailure = true;
      console.error(
        `${manifest.name} ${field} points to missing artifact: ${target}`
      );
    }
  }

  for (const needle of forbiddenText) {
    if (manifestText.includes(needle)) {
      hasFailure = true;
      console.error(`${manifest.name} manifest contains ${needle}`);
    }
  }

  if (
    manifest.exports?.["./styles.css"] &&
    !preservesCssSideEffects(manifest.sideEffects)
  ) {
    hasFailure = true;
    console.error(
      `${manifest.name} exports CSS but does not preserve CSS side effects`
    );
  }
}

const [firstGeneratedMetadataPath, ...otherGeneratedMetadataPaths] =
  generatedMetadataFiles;
const generatedMetadata = readFileSync(firstGeneratedMetadataPath, "utf8");
if (!generatedMetadata.includes(generatedMetadataSource)) {
  hasFailure = true;
  console.error(
    `${firstGeneratedMetadataPath} is missing generated metadata provenance`
  );
}

for (const generatedMetadataPath of otherGeneratedMetadataPaths) {
  if (readFileSync(generatedMetadataPath, "utf8") !== generatedMetadata) {
    hasFailure = true;
    console.error(
      `${generatedMetadataPath} does not match ${firstGeneratedMetadataPath}`
    );
  }
}

if (hasFailure) {
  process.exit(1);
}
