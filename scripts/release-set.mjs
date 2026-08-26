import { readFileSync } from "node:fs";
import { join } from "node:path";

export const BASE_RELEASE_TAG = "sdk-v0.2.2";
export const BASE_VERSION = "0.2.2";
export const RELEASE_VERSION = "0.3.0";
export const AFFECTED_PACKAGES = Object.freeze([
  "@authbound/core",
  "@authbound/server",
]);
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

function manifestEntries(manifests) {
  return manifests instanceof Map
    ? [...manifests.entries()]
    : Object.entries(manifests);
}

function manifestFor(manifests, packageName) {
  const manifest =
    manifests instanceof Map
      ? manifests.get(packageName)
      : manifests[packageName];
  if (!manifest) {
    throw new Error(`Missing manifest for ${packageName}`);
  }
  return manifest;
}

function internalDependencies(manifest) {
  const fields = [
    manifest.dependencies,
    manifest.optionalDependencies,
    manifest.peerDependencies,
  ];
  return fields.flatMap((dependencies) =>
    Object.keys(dependencies ?? {}).filter((dependency) =>
      dependency.startsWith("@authbound/")
    )
  );
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

export function resolveAffectedReleaseSet(manifests, requestedPackages) {
  const affected = new Set(AFFECTED_PACKAGES);
  const resolved = new Set();
  const visiting = new Set();

  function visit(packageName) {
    if (resolved.has(packageName)) {
      return;
    }
    if (visiting.has(packageName)) {
      throw new Error(`Circular Authbound dependency at ${packageName}`);
    }

    visiting.add(packageName);
    const manifest = manifestFor(manifests, packageName);
    for (const dependency of internalDependencies(manifest)) {
      if (affected.has(dependency)) {
        visit(dependency);
      }
    }
    visiting.delete(packageName);
    resolved.add(packageName);
  }

  for (const packageName of requestedPackages) {
    visit(packageName);
  }

  return [...resolved];
}

export function assertInternalPins(manifests, packageName, version) {
  const manifest = manifestFor(manifests, packageName);
  const affected = new Set(AFFECTED_PACKAGES);

  for (const field of ["dependencies", "optionalDependencies"]) {
    for (const [dependency, range] of Object.entries(manifest[field] ?? {})) {
      if (affected.has(dependency) && range !== version) {
        throw new Error(
          `${packageName} ${dependency} must be pinned to ${version}; got ${range}`
        );
      }
    }
  }
}

export function unchangedAdapters(manifests) {
  const affected = new Set(AFFECTED_PACKAGES);
  return ADAPTER_PACKAGES.filter((packageName) => {
    const manifest = manifestFor(manifests, packageName);
    return !affected.has(packageName) && manifest.version === BASE_VERSION;
  }).sort();
}

export function classifyPublishablePackageChange(filePath) {
  const match = /^packages\/([^/]+)\/(.+)$/.exec(filePath);
  if (
    !match ||
    match[2].endsWith(".md") ||
    /(?:^|\/)__tests__(?:\/|$)/.test(match[2]) ||
    /\.(?:test|spec)\.[^/]+$/.test(match[2])
  ) {
    return null;
  }

  const packageName = `@authbound/${match[1]}`;
  return packageDirectoryByName.has(packageName) ? packageName : null;
}

export function assertChangedPublishablePackagesIncluded(
  changedPaths,
  affectedPackages
) {
  const affected = new Set(affectedPackages);
  const changedPackages = new Set(
    changedPaths.map(classifyPublishablePackageChange).filter(Boolean)
  );

  for (const packageName of changedPackages) {
    if (!affected.has(packageName)) {
      throw new Error(
        `${packageName} changed but is omitted from the affected release set`
      );
    }
  }
}

export function assertSourceReleaseManifests(manifests) {
  const affected = new Set(AFFECTED_PACKAGES);
  const resolved = resolveAffectedReleaseSet(manifests, AFFECTED_PACKAGES);
  if (JSON.stringify(resolved) !== JSON.stringify(AFFECTED_PACKAGES)) {
    throw new Error(
      `Affected release set must resolve to ${AFFECTED_PACKAGES.join(", ")}; got ${resolved.join(", ")}`
    );
  }

  for (const [packageName, manifest] of manifestEntries(manifests)) {
    const expectedVersion = affected.has(packageName)
      ? RELEASE_VERSION
      : BASE_VERSION;
    if (manifest.version !== expectedVersion) {
      throw new Error(
        `${packageName} must remain at ${expectedVersion}; got ${manifest.version}`
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

  const adapters = unchangedAdapters(manifests);
  if (JSON.stringify(adapters) !== JSON.stringify(ADAPTER_PACKAGES)) {
    throw new Error(
      `Unchanged adapters must remain ${ADAPTER_PACKAGES.join(", ")}; got ${adapters.join(", ")}`
    );
  }
}
