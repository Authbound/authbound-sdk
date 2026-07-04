import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

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
const clientDirectiveFiles = [
  "packages/react/dist/index.js",
  "packages/react/dist/index.cjs",
  "packages/react/dist/testing.js",
  "packages/react/dist/testing.cjs",
  "packages/nextjs/dist/client.js",
  "packages/nextjs/dist/client.cjs",
];
const edgeRuntimeEntrypoints = [
  "packages/server/dist/edge.js",
  "packages/server/dist/edge.cjs",
  "packages/nextjs/dist/middleware.js",
  "packages/nextjs/dist/middleware.cjs",
  "packages/nuxt/dist/runtime/server/middleware.js",
];
const nextjsMiddlewareHelperNames = [
  "authboundMiddleware",
  "chainMiddleware",
  "createMatcherConfig",
  "withAuthbound",
];
const nextjsMiddlewareImportGuidanceFiles = [
  "examples/next-example/src/middleware.ts",
  "packages/nextjs/README.md",
  "packages/nextjs/src/index.ts",
  "packages/nextjs/src/middleware.ts",
];
const edgeRuntimeForbiddenPatterns = [
  {
    pattern:
      /(?:from\s+["']|require\(["'])@authbound\/server(?:["']|\/(?!edge(?:["']|\/))[^"']*["'])/,
    message:
      "imports Node-oriented @authbound/server instead of @authbound/server/edge",
  },
  {
    pattern:
      /node:crypto|(?:from\s+["']|require\(["']|__require\(["'])crypto["']/,
    message: "references Node crypto",
  },
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

function collectRuntimeExportTargets(exportsField) {
  if (typeof exportsField === "string") {
    return [
      ["import", exportsField],
      ["require", exportsField],
    ];
  }

  if (!exportsField || typeof exportsField !== "object") {
    return [];
  }

  return ["import", "require"]
    .filter((condition) => typeof exportsField[condition] === "string")
    .map((condition) => [condition, exportsField[condition]]);
}

function isJavaScriptTarget(target) {
  return /\.(?:cjs|mjs|js)$/.test(target);
}

function runNodeCheck(label, args, cwd) {
  const result = spawnSync(process.execPath, args, {
    cwd,
    encoding: "utf8",
    env: process.env,
  });

  if (result.status === 0) {
    return;
  }

  hasFailure = true;
  console.error(`${label} failed`);
  if (result.stdout) {
    console.error(result.stdout.trim());
  }
  if (result.stderr) {
    console.error(result.stderr.trim());
  }
}

function smokeImportTarget(packageName, packageDir, condition, target) {
  if (!isJavaScriptTarget(target)) {
    return;
  }

  const specifier = target.startsWith("./") ? target : `./${target}`;
  if (condition === "import") {
    runNodeCheck(
      `${packageName} ESM import ${target}`,
      [
        "--input-type=module",
        "-e",
        `await import(${JSON.stringify(specifier)});`,
      ],
      packageDir
    );
    return;
  }

  if (condition === "require") {
    runNodeCheck(
      `${packageName} CJS require ${target}`,
      ["-e", `require(${JSON.stringify(specifier)});`],
      packageDir
    );
  }
}

function hasDirectiveInPrologue(filePath, directive) {
  const text = readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//")) {
      continue;
    }

    const match = /^["']([^"']+)["'];?$/.exec(trimmed);
    if (!match) {
      return false;
    }
    if (match[1] === directive) {
      return true;
    }
  }

  return false;
}

function collectLocalJavaScriptClosure(entrypoint) {
  const seen = new Set();
  const stack = [entrypoint];

  while (stack.length > 0) {
    const current = normalize(stack.pop());
    if (seen.has(current)) {
      continue;
    }
    seen.add(current);

    const text = readFileSync(current, "utf8");
    const importMatches = text.matchAll(
      /(?:from\s+["']|import\s*\(\s*["']|require\(["'])(\.\/[^"']+\.(?:js|cjs|mjs))["']/g
    );
    for (const match of importMatches) {
      stack.push(join(dirname(current), match[1]));
    }
  }

  return [...seen];
}

function hasRootNextjsMiddlewareImport(text) {
  return new RegExp(
    `import\\s*\\{[^}]*\\b(?:${nextjsMiddlewareHelperNames.join("|")})\\b[^}]*\\}\\s*from\\s*["']@authbound/nextjs["']`,
    "m"
  ).test(text);
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

  for (const exportValue of Object.values(manifest.exports ?? {})) {
    for (const [condition, target] of collectRuntimeExportTargets(
      exportValue
    )) {
      smokeImportTarget(manifest.name, packageDir, condition, target);
    }
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

for (const clientDirectiveFile of clientDirectiveFiles) {
  if (!existsSync(clientDirectiveFile)) {
    hasFailure = true;
    console.error(`${clientDirectiveFile} is missing`);
    continue;
  }
  if (!hasDirectiveInPrologue(clientDirectiveFile, "use client")) {
    hasFailure = true;
    console.error(
      `${clientDirectiveFile} is missing active "use client" directive`
    );
  }
}

for (const entrypoint of edgeRuntimeEntrypoints) {
  if (!existsSync(entrypoint)) {
    hasFailure = true;
    console.error(`${entrypoint} is missing`);
    continue;
  }

  for (const filePath of collectLocalJavaScriptClosure(entrypoint)) {
    const text = readFileSync(filePath, "utf8");
    for (const { pattern, message } of edgeRuntimeForbiddenPatterns) {
      if (pattern.test(text)) {
        hasFailure = true;
        console.error(`${filePath} ${message}`);
      }
    }
  }
}

for (const guidanceFile of nextjsMiddlewareImportGuidanceFiles) {
  if (hasRootNextjsMiddlewareImport(readFileSync(guidanceFile, "utf8"))) {
    hasFailure = true;
    console.error(
      `${guidanceFile} imports middleware helpers from root @authbound/nextjs instead of @authbound/nextjs/middleware`
    );
  }
}

runNodeCheck(
  "@authbound/nextjs root middleware compatibility guard",
  [
    "--input-type=module",
    "-e",
    `const mod = await import("./dist/index.js"); const names = ${JSON.stringify(nextjsMiddlewareHelperNames)}; const missing = names.filter((name) => !(name in mod)); if (missing.length) throw new Error("Root export is missing 0.1.x middleware helpers: " + missing.join(", "));`,
  ],
  "packages/nextjs"
);

const webhookSmoke = `
const payload = JSON.stringify({ ok: true });
const secret = "whsec_test_secret";
const { signature } = generateWebhookSignature({ payload, secret });
if (!verifyWebhookSignature({ payload, secret, signature })) {
  throw new Error("Webhook signature verification failed");
}
`;
runNodeCheck(
  "@authbound/server ESM webhook smoke",
  [
    "--input-type=module",
    "-e",
    `import { generateWebhookSignature, verifyWebhookSignature } from "./dist/index.js";${webhookSmoke}`,
  ],
  "packages/server"
);
runNodeCheck(
  "@authbound/server CJS webhook smoke",
  [
    "-e",
    `const { generateWebhookSignature, verifyWebhookSignature } = require("./dist/index.cjs");${webhookSmoke}`,
  ],
  "packages/server"
);

if (hasFailure) {
  process.exit(1);
}
