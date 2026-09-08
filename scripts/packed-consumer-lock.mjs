import { join } from "node:path";
import semver from "semver";
import { parse as parseYaml } from "yaml";

function lockedPackages(lockfile) {
  const packages = parseYaml(lockfile)?.packages;
  if (!packages || typeof packages !== "object" || Array.isArray(packages)) {
    throw new Error("pnpm lockfile has no packages section");
  }

  return new Map(
    Object.entries(packages).map(([locator, manifest]) => [
      locator,
      manifest?.resolution?.integrity,
    ])
  );
}

function isLocalPackage(locator) {
  return (
    locator.startsWith("file:") ||
    locator.includes("@file:") ||
    locator.startsWith("link:") ||
    locator.includes("@link:")
  );
}

function localPackageName(locator) {
  for (const marker of ["@file:", "@link:"]) {
    const separator = locator.lastIndexOf(marker);
    if (separator > 0) {
      return locator.slice(0, separator);
    }
  }
}

function packageNameAndVersion(locator) {
  const separator = locator.lastIndexOf("@");
  if (separator <= 0) {
    return;
  }

  const name = locator.slice(0, separator);
  const version = locator.slice(separator + 1);
  const validName = name.startsWith("@")
    ? /^@[^/]+\/[^@/]+$/.test(name)
    : /^[^@/]+$/.test(name);
  return validName && semver.valid(version) ? [name, version] : undefined;
}

function compatibilityRange(version) {
  const parsed = semver.parse(version);
  if (!parsed) {
    return version;
  }
  if (parsed.major > 0) {
    return `>=${parsed.major}.0.0 <${parsed.major + 1}.0.0`;
  }
  if (parsed.minor > 0) {
    return `>=0.${parsed.minor}.0 <0.${parsed.minor + 1}.0`;
  }
  return version;
}

export function assertReviewedRegistryResolution(
  reviewedLockfile,
  candidateLockfile,
  allowedLocalIntegrities = new Map()
) {
  const reviewed = lockedPackages(reviewedLockfile);
  const candidate = lockedPackages(candidateLockfile);
  let registryPackageCount = 0;

  for (const [locator, integrity] of candidate) {
    if (isLocalPackage(locator)) {
      const packageName = localPackageName(locator);
      if (
        !(packageName && integrity) ||
        allowedLocalIntegrities.get(packageName) !== integrity
      ) {
        throw new Error(
          `${locator} does not match an allowed packed SDK artifact`
        );
      }
      continue;
    }
    registryPackageCount += 1;

    if (!integrity) {
      throw new Error(`${locator} has no locked integrity`);
    }
    if (!reviewed.has(locator)) {
      throw new Error(`${locator} is absent from the reviewed root lock`);
    }
    if (reviewed.get(locator) !== integrity) {
      throw new Error(
        `${locator} integrity differs from the reviewed root lock`
      );
    }
  }

  return registryPackageCount;
}

export function reviewedPackageOverrides(reviewedLockfile) {
  const versionsByName = new Map();
  for (const locator of lockedPackages(reviewedLockfile).keys()) {
    if (isLocalPackage(locator)) {
      continue;
    }
    const packageDetails = packageNameAndVersion(locator);
    if (!packageDetails) {
      continue;
    }
    const [name, version] = packageDetails;
    const versions = versionsByName.get(name) ?? new Set();
    versions.add(version);
    versionsByName.set(name, versions);
  }

  const overrides = [];
  for (const [name, versions] of versionsByName) {
    if (versions.size === 1) {
      overrides.push([name, [...versions][0]]);
      continue;
    }

    const versionsByRange = new Map();
    for (const version of versions) {
      const range = compatibilityRange(version);
      const compatibleVersions = versionsByRange.get(range) ?? [];
      compatibleVersions.push(version);
      versionsByRange.set(range, compatibleVersions);
    }
    for (const [range, compatibleVersions] of versionsByRange) {
      compatibleVersions.sort(semver.compare);
      overrides.push([`${name}@${range}`, compatibleVersions.at(-1)]);
    }
  }

  return Object.fromEntries(
    overrides.sort(([left], [right]) => left.localeCompare(right))
  );
}

export function credentialFreeEnvironment(parentEnvironment, sandboxDirectory) {
  const temporaryDirectory = join(sandboxDirectory, "tmp");
  const environment = {
    HOME: join(sandboxDirectory, "home"),
    TMPDIR: temporaryDirectory,
    TMP: temporaryDirectory,
    TEMP: temporaryDirectory,
    CI: "true",
    NO_COLOR: "1",
  };

  for (const key of [
    "PATH",
    "Path",
    "SystemRoot",
    "SYSTEMROOT",
    "ComSpec",
    "COMSPEC",
    "PATHEXT",
  ]) {
    if (parentEnvironment[key]) {
      environment[key] = parentEnvironment[key];
    }
  }

  return environment;
}

export function readOnlyNodeArguments(
  fixtureDirectory,
  scriptName,
  allowedFlags = process.allowedNodeEnvironmentFlags
) {
  const permissionFlag = allowedFlags.has("--permission")
    ? "--permission"
    : allowedFlags.has("--experimental-permission")
      ? "--experimental-permission"
      : undefined;
  if (!permissionFlag) {
    throw new Error("Packed consumer checks require the Node permission model");
  }
  return [permissionFlag, `--allow-fs-read=${fixtureDirectory}`, scriptName];
}
