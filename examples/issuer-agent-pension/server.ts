import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import type { AuthboundClient as AuthboundClientInstance } from "@authbound/server";
import express, {
  type ErrorRequestHandler,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import QRCode from "qrcode";
import {
  createPensionCredentialOffer,
  createPensionVerificationRequest,
  getPensionVerificationResult,
  getPensionVerificationStatus,
} from "./pension-flow.ts";
import { escapeHtml, parsePensionCredential, scriptJson } from "./utils.ts";

interface PensionCredentialOption {
  slug: string;
  title: string;
  description: string;
  fileName: string;
}

interface VerificationSession {
  clientToken: string;
  expiresAt: number;
  status: string;
}

type VerificationSessionStore = Map<string, VerificationSession>;
type CreateClient = () =>
  | AuthboundClientInstance
  | Promise<AuthboundClientInstance>;

export interface CreateAppOptions {
  createClient?: CreateClient;
  verificationSessions?: VerificationSessionStore;
}

class DemoRequestError extends Error {
  constructor(
    message: string,
    readonly statusCode = 400
  ) {
    super(message);
  }
}

const pensionCredentialDefinitionId = "pension-credential";
const pensionVerificationPolicyId = "pol_authbound_pension_v1";
const verificationSessionTtlMs = 15 * 60 * 1000;
const terminalVerificationStatuses = new Set([
  "failed",
  "expired",
  "canceled",
  "timeout",
]);

export const PENSION_CREDENTIALS: PensionCredentialOption[] = [
  {
    slug: "kael",
    title: "Totti Aalto (KAEL)",
    description: "Kansaneläke credential.",
    fileName: "pensioncredential.json",
  },
  {
    slug: "tkel-provisional",
    title: "Edwin Kelimtes (väliaikainen TKEL)",
    description: "Provisional disability pension credential.",
    fileName: "pensioncredential-provisional.json",
  },
  {
    slug: "tkel-disability",
    title: "Joni Kai Hiltunen (TKEL)",
    description: "Permanent disability pension credential.",
    fileName: "pensioncredential-disability.json",
  },
  {
    slug: "kuki",
    title: "Jonne Aapeli Setälä (KUKI)",
    description: "Active rehabilitation subsidy credential.",
    fileName: "pensioncredential-rehabilitation.json",
  },
  {
    slug: "kuki-expired",
    title: "Annina von Forsellestes (päättynyt KUKI)",
    description: "Ended rehabilitation subsidy credential.",
    fileName: "pensioncredential-rehabilitation-expired.json",
  },
];

function findCredentialOption(slug: string | null) {
  if (!slug) {
    return PENSION_CREDENTIALS[0];
  }

  const option = PENSION_CREDENTIALS.find(
    (credential) => credential.slug === slug
  );
  if (!option) {
    throw new DemoRequestError(`Unknown pension credential: ${slug}`, 404);
  }
  return option;
}

export async function loadCredential(option: PensionCredentialOption) {
  const file = new URL(`./credentials/${option.fileName}`, import.meta.url);
  const credential = parsePensionCredential(
    JSON.parse(await readFile(file, "utf8"))
  );
  return { ...option, credential };
}

export async function listCredentials() {
  return Promise.all(PENSION_CREDENTIALS.map(loadCredential));
}

async function selectedCredential(slug: string | null) {
  return loadCredential(findCredentialOption(slug));
}

async function createDefaultClient(): Promise<AuthboundClientInstance> {
  const apiKey = process.env.AUTHBOUND_SECRET_KEY;
  if (!apiKey) {
    throw new Error("AUTHBOUND_SECRET_KEY is required");
  }

  const { AuthboundClient } = (await import(
    "@authbound/server"
  )) as unknown as {
    AuthboundClient: new (options: {
      apiKey: string;
      apiUrl?: string;
      debug?: boolean;
    }) => AuthboundClientInstance;
  };
  return new AuthboundClient({
    apiKey,
    apiUrl: process.env.AUTHBOUND_API_URL,
    debug: process.env.AUTHBOUND_DEBUG === "true",
  });
}

function getPublishableKey() {
  const publishableKey = process.env.AUTHBOUND_PUBLISHABLE_KEY;
  if (!publishableKey) {
    throw new Error("AUTHBOUND_PUBLISHABLE_KEY is required");
  }

  return publishableKey;
}

async function createOffer(slug: string | null, createClient: CreateClient) {
  const selected = await selectedCredential(slug);
  const authboundClient = await createClient();
  const offer = await createPensionCredentialOffer(authboundClient, {
    credentialDefinitionId: pensionCredentialDefinitionId,
    credential: selected.credential,
  });

  return {
    credential: selected,
    offer,
    qrSvg: await QRCode.toString(offer.offerUri, {
      type: "svg",
      margin: 1,
      width: 288,
      color: { dark: "#111827", light: "#ffffff" },
    }),
  };
}

function sessionExpiresAt(expiresAt: string | undefined) {
  const timestamp = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  return Number.isFinite(timestamp)
    ? timestamp
    : Date.now() + verificationSessionTtlMs;
}

function findVerificationSession(
  sessions: VerificationSessionStore,
  verificationId: string | null
) {
  if (!verificationId) {
    throw new DemoRequestError("Missing verification id", 400);
  }

  const session = sessions.get(verificationId);
  if (!session || session.expiresAt <= Date.now()) {
    sessions.delete(verificationId);
    throw new DemoRequestError("Unknown verification id", 404);
  }

  return { verificationId, session };
}

async function createVerification(
  sessions: VerificationSessionStore,
  createClient: CreateClient
) {
  const authboundClient = await createClient();
  const verification = await createPensionVerificationRequest(authboundClient, {
    policyId: pensionVerificationPolicyId,
  });
  const handoff =
    verification.clientAction?.data ?? verification.verificationUrl ?? "";
  const clientToken = verification.clientToken;
  if (!clientToken) {
    throw new Error("Verification response did not include a client token");
  }
  sessions.set(verification.id, {
    clientToken,
    expiresAt: sessionExpiresAt(verification.expiresAt),
    status: verification.status,
  });
  const { clientToken: _clientToken, ...publicVerification } = verification;

  return {
    verification: publicVerification,
    qrSvg: handoff
      ? await QRCode.toString(handoff, {
          type: "svg",
          margin: 1,
          width: 288,
          color: { dark: "#111827", light: "#ffffff" },
        })
      : null,
  };
}

async function getVerificationStatus(
  sessions: VerificationSessionStore,
  requestedVerificationId: string | null,
  createClient: CreateClient
) {
  const { verificationId, session } = findVerificationSession(
    sessions,
    requestedVerificationId
  );
  const authboundClient = await createClient();
  const status = await getPensionVerificationStatus(authboundClient, {
    verificationId,
    clientToken: session.clientToken,
    publishableKey: getPublishableKey(),
  });
  session.status = status.status;
  if (terminalVerificationStatuses.has(status.status)) {
    sessions.delete(verificationId);
  }
  return status;
}

async function getVerificationResult(
  sessions: VerificationSessionStore,
  requestedVerificationId: string | null,
  createClient: CreateClient
) {
  const { verificationId, session } = findVerificationSession(
    sessions,
    requestedVerificationId
  );
  if (session.status !== "verified") {
    throw new DemoRequestError("Verification result is not ready", 409);
  }
  const result = await getPensionVerificationResult(await createClient(), {
    verificationId,
  });
  sessions.delete(verificationId);
  return result;
}

async function renderHome() {
  const credentials = await listCredentials();
  const options = credentials
    .map(
      ({ slug, title }) =>
        `<option value="${escapeHtml(slug)}">${escapeHtml(title)}</option>`
    )
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Pension credential example</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 0; background: #f6f8fb; color: #101828; }
      main { width: min(960px, 100%); margin: 0 auto; padding: 32px; display: grid; gap: 24px; }
      section { background: white; border: 1px solid #d0d5dd; border-radius: 8px; padding: 24px; }
      label, button { font: inherit; }
      select, button { width: 100%; padding: 10px 12px; margin-top: 8px; }
      button { border: 0; border-radius: 6px; background: #003580; color: white; font-weight: 700; cursor: pointer; }
      button:disabled { opacity: 0.5; cursor: not-allowed; }
      .qr { margin-top: 16px; }
      .qr svg { max-width: 288px; height: auto; }
      pre { overflow: auto; padding: 12px; background: #101828; color: white; border-radius: 6px; }
      a { color: #003580; word-break: break-all; }
      .status { min-height: 24px; color: #475467; }
    </style>
  </head>
  <body>
    <main>
      <header>
        <h1>Pension credential</h1>
        <p>Issue and verify KAEL, TKEL, and KUKI pension credential fixtures.</p>
      </header>
      <section>
        <h2>Issue credential</h2>
        <label>
          Credential
          <select id="credential">${options}</select>
        </label>
        <button id="issue" type="button">Create wallet offer</button>
        <p class="status" id="issue-status"></p>
        <div class="qr" id="issue-qr"></div>
        <p id="issue-link"></p>
      </section>
      <section>
        <h2>Verify credential</h2>
        <button id="verify" type="button">Create verification request</button>
        <p class="status" id="verify-status"></p>
        <div class="qr" id="verify-qr"></div>
        <p id="verify-link"></p>
        <pre id="result" hidden></pre>
      </section>
    </main>
    <script>
      const credentials = ${scriptJson(credentials)};
      const credentialSelect = document.querySelector("#credential");
      const issueButton = document.querySelector("#issue");
      const verifyButton = document.querySelector("#verify");
      const issueStatus = document.querySelector("#issue-status");
      const verifyStatus = document.querySelector("#verify-status");
      const issueQr = document.querySelector("#issue-qr");
      const verifyQr = document.querySelector("#verify-qr");
      const issueLink = document.querySelector("#issue-link");
      const verifyLink = document.querySelector("#verify-link");
      const result = document.querySelector("#result");
      let verificationPoll;

      function setLink(container, href, label) {
        container.textContent = "";
        const anchor = document.createElement("a");
        anchor.href = href;
        anchor.target = "_blank";
        anchor.rel = "noopener";
        anchor.textContent = label;
        container.append(anchor);
      }

      issueButton.addEventListener("click", async () => {
        issueButton.disabled = true;
        issueStatus.textContent = "Creating offer...";
        issueQr.textContent = "";
        issueLink.textContent = "";
        try {
          const response = await fetch("/offer", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ slug: credentialSelect.value }),
          });
          const body = await response.json();
          if (!response.ok) throw new Error(body.error ?? "Offer creation failed");
          issueQr.innerHTML = body.qrSvg;
          setLink(issueLink, body.offer.offerUri, body.offer.offerUri);
          issueStatus.textContent = "Offer ready";
        } catch (error) {
          issueStatus.textContent = error instanceof Error ? error.message : "Offer creation failed";
        } finally {
          issueButton.disabled = false;
        }
      });

      verifyButton.addEventListener("click", async () => {
        clearInterval(verificationPoll);
        verifyButton.disabled = true;
        verifyStatus.textContent = "Creating verification...";
        verifyQr.textContent = "";
        verifyLink.textContent = "";
        result.hidden = true;
        result.textContent = "";
        try {
          const response = await fetch("/verify", { method: "POST" });
          const body = await response.json();
          if (!response.ok) throw new Error(body.error ?? "Verification creation failed");
          const handoff = body.verification.clientAction?.data ?? body.verification.verificationUrl ?? "";
          verifyQr.innerHTML = body.qrSvg ?? "";
          if (handoff) setLink(verifyLink, handoff, handoff);
          verifyStatus.textContent = "Verification ready";
          pollVerification(body.verification.id);
        } catch (error) {
          verifyStatus.textContent = error instanceof Error ? error.message : "Verification creation failed";
        } finally {
          verifyButton.disabled = false;
        }
      });

      async function pollVerification(id) {
        const terminal = new Set(["verified", "failed", "expired", "canceled", "timeout"]);
        async function refresh() {
          try {
            const response = await fetch("/status?id=" + encodeURIComponent(id));
            const body = await response.json();
            if (!response.ok) throw new Error(body.error ?? "Status check failed");
            verifyStatus.textContent = body.status;
            if (body.status === "verified") await loadVerificationResult(id);
            if (terminal.has(body.status)) clearInterval(verificationPoll);
          } catch (error) {
            clearInterval(verificationPoll);
            verifyStatus.textContent = error instanceof Error ? error.message : "Status check failed";
          }
        }
        await refresh();
        verificationPoll = setInterval(refresh, 3000);
      }

      async function loadVerificationResult(id) {
        const response = await fetch("/result?id=" + encodeURIComponent(id));
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Result fetch failed");
        result.hidden = false;
        result.textContent = JSON.stringify(body, null, 2);
      }
    </script>
  </body>
</html>`;
}

function errorBody(error: unknown) {
  if (typeof error === "object" && error !== null && "code" in error) {
    return {
      error: error instanceof Error ? error.message : "Unexpected error",
      code: (error as { code?: unknown }).code,
    };
  }

  return { error: error instanceof Error ? error.message : "Unexpected error" };
}

function asyncRoute(
  handler: (request: Request, response: Response) => Promise<void>
): RequestHandler {
  return (request, response, next) => {
    handler(request, response).catch(next);
  };
}

function methodNotAllowed(
  allowedMethod: string,
  routePath: string
): RequestHandler {
  return (_request, response) => {
    response
      .status(405)
      .set("Allow", allowedMethod)
      .json({
        error: `Method not allowed. Use ${allowedMethod} ${routePath}.`,
      });
  };
}

function queryString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function errorField(error: unknown, key: string) {
  if (typeof error !== "object" || error === null || !(key in error)) {
    return;
  }
  return (error as Record<string, unknown>)[key];
}

const errorHandler: ErrorRequestHandler = (
  error,
  _request,
  response,
  _next
) => {
  if (errorField(error, "type") === "entity.too.large") {
    response.status(413).json({ error: "Request body is too large" });
    return;
  }

  if (errorField(error, "type") === "entity.parse.failed") {
    response.status(400).json({ error: "Request body must be valid JSON" });
    return;
  }

  if (error instanceof DemoRequestError) {
    response.status(error.statusCode).json(errorBody(error));
    return;
  }

  console.error(error);
  response.status(500).json(errorBody(error));
};

export function createApp(options: CreateAppOptions = {}) {
  const app = express();
  const verificationSessions = options.verificationSessions ?? new Map();
  const createClient = options.createClient ?? createDefaultClient;

  app.use(express.json({ limit: "64kb" }));

  app.get("/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.get(
    "/credentials",
    asyncRoute(async (_request, response) => {
      response.json(await listCredentials());
    })
  );

  app
    .route("/offer")
    .post(
      asyncRoute(async (request, response) => {
        const body = request.body as Record<string, unknown> | undefined;
        const slug = typeof body?.slug === "string" ? body.slug : null;
        response.json(await createOffer(slug, createClient));
      })
    )
    .all(methodNotAllowed("POST", "/offer"));

  app
    .route("/verify")
    .post(
      asyncRoute(async (_request, response) => {
        response.json(
          await createVerification(verificationSessions, createClient)
        );
      })
    )
    .all(methodNotAllowed("POST", "/verify"));

  app
    .route("/status")
    .get(
      asyncRoute(async (request, response) => {
        response.json(
          await getVerificationStatus(
            verificationSessions,
            queryString(request.query.id),
            createClient
          )
        );
      })
    )
    .all(methodNotAllowed("GET", "/status"));

  app
    .route("/result")
    .get(
      asyncRoute(async (request, response) => {
        response.json(
          await getVerificationResult(
            verificationSessions,
            queryString(request.query.id),
            createClient
          )
        );
      })
    )
    .all(methodNotAllowed("GET", "/result"));

  app.get(
    "/",
    asyncRoute(async (_request, response) => {
      response.type("html").send(await renderHome());
    })
  );

  app.use(errorHandler);

  return app;
}

const isMain = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isMain) {
  const port = Number(process.env.PORT ?? 3333);
  const host = process.env.HOST ?? "0.0.0.0";
  const app = createApp();
  app.listen(port, host, () => {
    console.log(`Issuer demo listening on http://${host}:${port}`);
  });
}
