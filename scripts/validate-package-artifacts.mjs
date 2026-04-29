import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const packageNames = ["core", "server", "react", "nextjs", "vue", "nuxt"];
const authboundScope = "@authbound";
const forbiddenText = [`${authboundScope}-sdk/`, `${authboundScope}/shared`];

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

for (const packageName of packageNames) {
  const packageDir = join("packages", packageName);
  const manifestPath = join(packageDir, "package.json");
  const manifestText = readFileSync(manifestPath, "utf8");
  const manifest = JSON.parse(manifestText);
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
}

if (hasFailure) {
  process.exit(1);
}
