import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const clientModule = fileURLToPath(new URL("./client.ts", import.meta.url));

// Consumers with exactOptionalPropertyTypes pass `page.nextCursor`, which is
// `string | undefined`, straight back into the next list call.
const consumer = `
import type { AuthboundClient } from ${JSON.stringify(clientModule.replace(/\.ts$/, ""))};

export async function pageThroughEverything(client: AuthboundClient) {
  const verifications = await client.verifications.list({ limit: 10 });
  await client.verifications.list({ startingAfter: verifications.nextCursor });

  const stations = await client.stations.list();
  await client.stations.list({ cursor: stations.nextCursor });

  const stationVerifications = await client.stations.listVerifications("st_1");
  await client.stations.listVerifications("st_1", {
    after: stationVerifications.nextCursor,
  });

  const events = await client.stations.listEvents("st_1");
  await client.stations.listEvents("st_1", { after: events.nextCursor });

  const definitions = await client.issuer.credentialDefinitions.list();
  await client.issuer.credentialDefinitions.list({
    cursor: definitions.nextCursor,
  });

  const issuances = await client.openId4Vc.issuance.list();
  await client.openId4Vc.issuance.list({ cursor: issuances.nextCursor });
}
`;

describe("list pagination types", () => {
  it("accept the previous page's nextCursor under exactOptionalPropertyTypes", () => {
    const directory = mkdtempSync(join(tmpdir(), "authbound-pagination-"));
    try {
      const consumerPath = join(directory, "consumer.ts");
      writeFileSync(consumerPath, consumer);
      const program = ts.createProgram([consumerPath], {
        strict: true,
        exactOptionalPropertyTypes: true,
        noEmit: true,
        skipLibCheck: true,
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        types: ["node"],
      });
      const source = program.getSourceFile(consumerPath);
      const messages = ts
        .getPreEmitDiagnostics(program, source)
        .map((diagnostic) =>
          ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
        );
      expect(messages).toEqual([]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 60_000);
});
