import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { AuthboundClient, AuthboundClientError } from "@authbound-sdk/server";

interface PensionRecord {
  person: {
    givenName: string;
    familyName: string;
    birthDate: string;
    personalAdministrativeNumber: string;
  };
  pension: {
    typeCode: string;
    typeName: string;
    startDate: string;
    endDate?: string;
    provisional?: boolean;
  };
}

const apiKey = process.env.AUTHBOUND_API_KEY;
if (!apiKey) {
  throw new Error("AUTHBOUND_API_KEY is required");
}

const authbound = new AuthboundClient({
  apiKey,
  apiUrl: process.env.AUTHBOUND_API_URL,
});

const credentialDefinitionId =
  process.env.AUTHBOUND_CREDENTIAL_DEFINITION_ID ?? "pension_credential_v1";

async function ensureCredentialDefinition() {
  try {
    return await authbound.issuer.credentialDefinitions.get(
      credentialDefinitionId
    );
  } catch (error) {
    if (
      !(error instanceof AuthboundClientError) ||
      error.code !== "credential_definition_not_found"
    ) {
      throw error;
    }
  }

  return authbound.issuer.credentialDefinitions.create({
    credentialDefinitionId,
    vct: "urn:vc:authbound:pension:1.0",
    format: "dc+sd-jwt",
    title: "Pension Credential",
    aliases: ["pension"],
    claims: [
      {
        path: ["Person", "given_name"],
        mandatory: true,
        displayName: "Given Name",
      },
      {
        path: ["Person", "family_name"],
        mandatory: true,
        displayName: "Family Name",
      },
      {
        path: ["Person", "birth_date"],
        mandatory: true,
        displayName: "Birth Date",
      },
      {
        path: ["Person", "personal_administrative_number"],
        mandatory: true,
        displayName: "Person Identifier",
      },
      {
        path: ["Pension", "typeCode"],
        mandatory: true,
        displayName: "Type Code",
      },
      { path: ["Pension", "typeName"], mandatory: true, displayName: "Type" },
      {
        path: ["Pension", "startDate"],
        mandatory: true,
        displayName: "Start Date",
      },
      { path: ["Pension", "endDate"], displayName: "End Date" },
      { path: ["Pension", "provisional"], displayName: "Provisional" },
    ],
    metadata: {
      demo: "issuer-agent-pension",
    },
  });
}

function toClaims(record: PensionRecord): Record<string, unknown> {
  return {
    Person: {
      given_name: record.person.givenName,
      family_name: record.person.familyName,
      birth_date: record.person.birthDate,
      personal_administrative_number:
        record.person.personalAdministrativeNumber,
    },
    Pension: {
      typeCode: record.pension.typeCode,
      typeName: record.pension.typeName,
      startDate: record.pension.startDate,
      ...(record.pension.endDate ? { endDate: record.pension.endDate } : {}),
      ...(record.pension.provisional !== undefined
        ? { provisional: record.pension.provisional }
        : {}),
    },
  };
}

async function loadRecord(): Promise<PensionRecord> {
  const file = new URL("./pension-record.json", import.meta.url);
  return JSON.parse(await readFile(file, "utf8")) as PensionRecord;
}

async function createOffer(): Promise<string> {
  const definition = await ensureCredentialDefinition();
  const record = await loadRecord();
  const offer = await authbound.openId4Vc.issuance.createOffer({
    credentialDefinitionId: definition.credentialDefinitionId,
    claims: toClaims(record),
    issuanceMode: "InTime",
    metadata: {
      demo: "issuer-agent-pension",
      recordRef: "pension-record",
    },
    idempotencyKey: `pension-record:${definition.credentialDefinitionId}`,
  });

  return offer.offerUri;
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname === "/offer") {
      const offerUri = await createOffer();
      response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(offerUri);
      return;
    }

    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Authbound Pension Credential</title>
  </head>
  <body>
    <main>
      <h1>Pension credential</h1>
      <p><a href="/offer">Create wallet offer</a></p>
    </main>
  </body>
</html>`);
  } catch (error) {
    console.error(error);
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Failed to create issuer offer");
  }
});

server.listen(3000, () => {
  console.log("Issuer demo listening on http://localhost:3000");
});
