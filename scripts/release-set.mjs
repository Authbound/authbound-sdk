import { readFileSync } from "node:fs";
import { join } from "node:path";

export const RELEASE_VERSION = "0.3.0";
export const PUBLISHABLE_PACKAGES = Object.freeze([
  "@authbound/core",
  "@authbound/server",
  "@authbound/react",
  "@authbound/vue",
  "@authbound/nextjs",
  "@authbound/nuxt",
]);
export const ADAPTER_PACKAGES = Object.freeze([
  "@authbound/nextjs",
  "@authbound/nuxt",
  "@authbound/react",
  "@authbound/vue",
]);

const packageDirectoryByName = new Map(
  PUBLISHABLE_PACKAGES.map((packageName) => [
    packageName,
    packageName.replace("@authbound/", ""),
  ])
);

function manifestFor(manifests, packageName) {
  const manifest = manifests[packageName];
  if (!manifest) {
    throw new Error(`Missing manifest for ${packageName}`);
  }
  return manifest;
}

export function packageDirectory(packageName) {
  const directory = packageDirectoryByName.get(packageName);
  if (!directory) {
    throw new Error(`Unknown publishable package ${packageName}`);
  }
  return directory;
}

export function loadWorkspaceManifests(rootDirectory = process.cwd()) {
  return Object.fromEntries(
    PUBLISHABLE_PACKAGES.map((packageName) => {
      const manifestPath = join(
        rootDirectory,
        "packages",
        packageDirectory(packageName),
        "package.json"
      );
      return [packageName, JSON.parse(readFileSync(manifestPath, "utf8"))];
    })
  );
}

export function assertInternalPins(manifests, packageName, version) {
  const manifest = manifestFor(manifests, packageName);

  for (const field of ["dependencies", "optionalDependencies"]) {
    for (const [dependency, range] of Object.entries(manifest[field] ?? {})) {
      if (dependency.startsWith("@authbound/") && range !== version) {
        throw new Error(
          `${packageName} ${dependency} must be pinned to ${version}; got ${range}`
        );
      }
    }
  }
}

export function assertSourceReleaseManifests(manifests) {
  for (const packageName of PUBLISHABLE_PACKAGES) {
    const manifest = manifestFor(manifests, packageName);
    if (manifest.version !== RELEASE_VERSION) {
      throw new Error(
        `${packageName} must be ${RELEASE_VERSION}; got ${manifest.version}`
      );
    }

    for (const field of ["dependencies", "optionalDependencies"]) {
      for (const [dependency, range] of Object.entries(manifest[field] ?? {})) {
        if (dependency.startsWith("@authbound/") && range !== "workspace:*") {
          throw new Error(
            `${packageName} source dependency ${dependency} must use workspace:*; got ${range}`
          );
        }
      }
    }
  }
}
