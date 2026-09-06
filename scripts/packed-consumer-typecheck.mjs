import { join, resolve, sep } from "node:path";

function diagnosticMessageHead(messageText) {
  return typeof messageText === "string"
    ? messageText
    : (messageText?.messageText ?? "");
}

function externalDiagnosticKey(diagnostic) {
  const normalizedPath = diagnostic.file?.fileName?.split(sep).join("/") ?? "";
  const nodeModulesMarker = "/node_modules/";
  const packagePath = normalizedPath.slice(
    normalizedPath.lastIndexOf(nodeModulesMarker) + nodeModulesMarker.length
  );
  const normalizedMessage = diagnosticMessageHead(diagnostic.messageText)
    .split(sep)
    .join("/")
    .replace(/'[^']*\/node_modules\//g, "'")
    .split(/\r?\n/, 1)[0];
  return `${packagePath}|TS${diagnostic.code}|${normalizedMessage}`;
}

export function partitionPackedConsumerDiagnostics(
  diagnostics,
  fixtureDirectory,
  reviewedExternalBaseline = []
) {
  const consumerPath = resolve(fixtureDirectory, "consumer.ts");
  const authboundPackageMarker = `${sep}node_modules${sep}@authbound${sep}`;
  const remainingBaseline = new Map();
  for (const key of reviewedExternalBaseline) {
    remainingBaseline.set(key, (remainingBaseline.get(key) ?? 0) + 1);
  }

  const blocking = [];
  const external = [];
  for (const diagnostic of diagnostics) {
    const filePath = diagnostic.file?.fileName
      ? resolve(diagnostic.file.fileName)
      : null;
    const key = externalDiagnosticKey(diagnostic);
    const remaining = remainingBaseline.get(key) ?? 0;
    if (
      filePath !== null &&
      filePath !== consumerPath &&
      !filePath.includes(authboundPackageMarker) &&
      remaining > 0
    ) {
      external.push(diagnostic);
      remainingBaseline.set(key, remaining - 1);
    } else {
      blocking.push(diagnostic);
    }
  }

  const missingBaseline = [...remainingBaseline.entries()].flatMap(
    ([key, count]) => Array.from({ length: count }, () => key)
  );
  if (missingBaseline.length > 0) {
    throw new Error(
      `The reviewed external diagnostic baseline was not observed:\n${missingBaseline.join("\n")}`
    );
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
  fixtureDirectory,
  reviewedExternalBaseline = []
) {
  const configPath = join(fixtureDirectory, "tsconfig.json");
  const config = typescript.readConfigFile(configPath, typescript.sys.readFile);
  if (config.error) {
    return partitionPackedConsumerDiagnostics(
      [config.error],
      fixtureDirectory,
      reviewedExternalBaseline
    );
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
  return partitionPackedConsumerDiagnostics(
    diagnostics,
    fixtureDirectory,
    reviewedExternalBaseline
  );
}
