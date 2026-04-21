import { createServer } from "node:http";
import { AuthboundClient, AuthboundClientError } from "@authbound-sdk/server";

const apiKey = process.env.AUTHBOUND_API_KEY;
if (!apiKey) {
  throw new Error("AUTHBOUND_API_KEY is required");
}

const authbound = new AuthboundClient({
  apiKey,
  apiUrl: process.env.AUTHBOUND_API_URL || undefined,
});

const credentialDefinitionId =
  process.env.AUTHBOUND_CREDENTIAL_DEFINITION_ID || "employee_badge_v1";

const employee = {
  id: "employee_123",
  givenName: "Sergio",
  familyName: "Jack",
  employeeNumber: "E-1001",
  department: "Customer Success",
};

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
    vct: "urn:vc:authbound:employee-badge:1.0",
    format: "dc+sd-jwt",
    title: "Employee Badge",
    aliases: ["employee_badge"],
    claims: [
      { path: ["Employee", "given_name"], mandatory: true },
      { path: ["Employee", "family_name"], mandatory: true },
      { path: ["Employee", "employee_number"], mandatory: true },
      { path: ["Employee", "department"], mandatory: true },
    ],
    metadata: {
      example: "issuer-agent-basic",
    },
  });
}

function employeeClaims(record) {
  return {
    Employee: {
      given_name: record.givenName,
      family_name: record.familyName,
      employee_number: record.employeeNumber,
      department: record.department,
    },
  };
}

async function createWalletOffer() {
  const definition = await ensureCredentialDefinition();
  return authbound.openId4Vc.issuance.createOffer({
    credentialDefinitionId: definition.credentialDefinitionId,
    claims: employeeClaims(employee),
    issuanceMode: "InTime",
    metadata: {
      employeeId: employee.id,
    },
  });
}

function html() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Authbound Issuer Agent</title>
    <style>
      body { font-family: system-ui, sans-serif; max-width: 720px; margin: 48px auto; padding: 0 20px; }
      button { font: inherit; padding: 10px 14px; cursor: pointer; }
      pre { white-space: pre-wrap; overflow-wrap: anywhere; background: #f6f8fa; padding: 16px; }
      a { display: inline-block; margin-top: 12px; }
    </style>
  </head>
  <body>
    <main>
      <h1>Issue an employee badge</h1>
      <button id="create">Create wallet offer</button>
      <p><a id="wallet-link" hidden>Open wallet offer</a></p>
      <pre id="output"></pre>
    </main>
    <script>
      const button = document.querySelector("#create");
      const output = document.querySelector("#output");
      const walletLink = document.querySelector("#wallet-link");

      button.addEventListener("click", async () => {
        button.disabled = true;
        output.textContent = "Creating offer...";
        walletLink.hidden = true;

        const response = await fetch("/offer", { method: "POST" });
        const body = await response.json();
        if (!response.ok) {
          output.textContent = JSON.stringify(body, null, 2);
          button.disabled = false;
          return;
        }

        walletLink.href = body.offerUri;
        walletLink.hidden = false;
        output.textContent = body.offerUri;
        button.disabled = false;
      });
    </script>
  </body>
</html>`;
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", "http://localhost");
    if (request.method === "POST" && url.pathname === "/offer") {
      const offer = await createWalletOffer();
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(offer, null, 2));
      return;
    }

    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(html());
  } catch (error) {
    const message =
      error instanceof AuthboundClientError
        ? { code: error.code, message: error.message, details: error.details }
        : { code: "example_error", message: "Failed to create wallet offer" };

    console.error(error);
    response.writeHead(500, { "Content-Type": "application/json" });
    response.end(JSON.stringify(message, null, 2));
  }
});

server.listen(3000, () => {
  console.log("Issuer example running at http://localhost:3000");
});
