import { join, resolve, sep } from "node:path";

export function partitionPackedConsumerDiagnostics(
  diagnostics,
  fixtureDirectory
) {
  const consumerPath = resolve(fixtureDirectory, "consumer.ts");
  const authboundPackageMarker = `${sep}node_modules${sep}@authbound${sep}`;
  const blocking = [];
  const external = [];

  for (const diagnostic of diagnostics) {
    const filePath = diagnostic.file?.fileName
      ? resolve(diagnostic.file.fileName)
      : null;
    if (
      filePath === null ||
      filePath === consumerPath ||
      filePath.includes(authboundPackageMarker)
    ) {
      blocking.push(diagnostic);
    } else {
      external.push(diagnostic);
    }
  }

  return { blocking, external };
}

export function summarizeExternalDiagnostics(diagnostics, maximumPackages = 8) {
  const packages = new Map();

  for (const diagnostic of diagnostics) {
    const normalizedPath =
      diagnostic.file?.fileName?.split(sep).join("/") ?? "";
    const packagePath = normalizedPath.slice(
      normalizedPath.lastIndexOf("/node_modules/") + "/node_modules/".length
    );
    const segments = packagePath.split("/");
    const packageName = segments[0]?.startsWith("@")
      ? `${segments[0]}/${segments[1]}`
      : segments[0] || "unknown";
    const summary = packages.get(packageName) ?? { count: 0, codes: new Set() };
    summary.count += 1;
    summary.codes.add(`TS${diagnostic.code}`);
    packages.set(packageName, summary);
  }

  const summaries = [...packages.entries()]
    .sort(
      ([leftName, left], [rightName, right]) =>
        right.count - left.count || leftName.localeCompare(rightName)
    )
    .map(
      ([packageName, summary]) =>
        `${packageName} (${summary.count}; ${[...summary.codes].sort().join(", ")})`
    );
  const omitted = Math.max(0, summaries.length - maximumPackages);
  const visible = summaries.slice(0, maximumPackages);
  if (omitted > 0) {
    visible.push(`+${omitted} more packages`);
  }
  return `${diagnostics.length} nonblocking external diagnostics: ${visible.join(", ")}`;
}

export function collectPackedConsumerTypeDiagnostics(
  typescript,
  fixtureDirectory
) {
  const configPath = join(fixtureDirectory, "tsconfig.json");
  const config = typescript.readConfigFile(configPath, typescript.sys.readFile);
  if (config.error) {
    return partitionPackedConsumerDiagnostics([config.error], fixtureDirectory);
  }

  const parsed = typescript.parseJsonConfigFileContent(
    config.config,
    typescript.sys,
    fixtureDirectory,
    undefined,
    configPath
  );
  const program = typescript.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
  });
  const diagnostics = [
    ...parsed.errors,
    ...typescript.getPreEmitDiagnostics(program),
  ];
  return partitionPackedConsumerDiagnostics(diagnostics, fixtureDirectory);
}
