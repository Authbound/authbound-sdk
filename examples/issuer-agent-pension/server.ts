import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { AuthboundClient, AuthboundClientError } from "@authbound/server";
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
  // Keep the polling token on the server so the browser only sees verification IDs.
  clientToken: string;
  expiresAt: number;
}

type VerificationSessionStore = Map<string, VerificationSession>;

class DemoRequestError extends Error {
  constructor(
    message: string,
    readonly statusCode = 400
  ) {
    super(message);
  }
}

const port = 3333;
const host = "0.0.0.0";

// Hardcoded IDs keep the example focused on the three SDK calls below.
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
    slug: "national-pension",
    title: "National pension",
    description: "Active national pension credential.",
    fileName: "pensioncredential.json",
  },
  {
    slug: "provisional-disability-pension",
    title: "Provisional disability pension",
    description: "Active disability pension with provisional status.",
    fileName: "pensioncredential-provisional.json",
  },
  {
    slug: "disability-pension",
    title: "Disability pension",
    description: "Active disability pension credential.",
    fileName: "pensioncredential-disability.json",
  },
  {
    slug: "rehabilitation-subsidy",
    title: "Rehabilitation subsidy",
    description: "Time-limited rehabilitation subsidy credential.",
    fileName: "pensioncredential-rehabilitation.json",
  },
  {
    slug: "expired-rehabilitation-subsidy",
    title: "Expired rehabilitation subsidy",
    description: "Expired rehabilitation subsidy credential.",
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

function createClient() {
  const apiKey = process.env.AUTHBOUND_SECRET_KEY;
  if (!apiKey) {
    throw new Error("AUTHBOUND_SECRET_KEY is required");
  }

  // Secret-key SDK calls stay in this server file.
  return new AuthboundClient({
    apiKey,
  });
}

function getPublishableKey() {
  const publishableKey = process.env.AUTHBOUND_PUBLISHABLE_KEY;
  if (!publishableKey) {
    throw new Error("AUTHBOUND_PUBLISHABLE_KEY is required");
  }

  return publishableKey;
}

async function createOffer(slug: string | null) {
  const selected = await selectedCredential(slug);
  const authbound = createClient();
  const offer = await createPensionCredentialOffer(authbound, {
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

async function createVerification(sessions: VerificationSessionStore) {
  const authbound = createClient();
  const verification = await createPensionVerificationRequest(authbound, {
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
  });
  // Do not send clientToken to the browser; /status uses it from memory.
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
  requestedVerificationId: string | null
) {
  const { verificationId, session } = findVerificationSession(
    sessions,
    requestedVerificationId
  );
  const authbound = createClient();
  // The public status endpoint needs the publishable key plus the client token.
  const status = await getPensionVerificationStatus(authbound, {
    verificationId,
    clientToken: session.clientToken,
    publishableKey: getPublishableKey(),
  });
  if (terminalVerificationStatuses.has(status.status)) {
    sessions.delete(verificationId);
  }
  return status;
}

async function getVerificationResult(
  sessions: VerificationSessionStore,
  requestedVerificationId: string | null
) {
  const { verificationId } = findVerificationSession(
    sessions,
    requestedVerificationId
  );
  // Results use the server secret key, so the browser calls this local route.
  const result = await getPensionVerificationResult(createClient(), {
    verificationId,
  });
  sessions.delete(verificationId);
  return result;
}

function renderCredentialCards(
  credentials: Awaited<ReturnType<typeof listCredentials>>
) {
  return credentials
    .map(({ slug, title, description, credential }) => {
      const { Person, Pension } = credential.credentialSubject;
      return `<button class="credential-card" type="button" data-slug="${escapeHtml(slug)}">
        <span class="card-title">${escapeHtml(title)}</span>
        <span class="card-description">${escapeHtml(description)}</span>
        <span class="card-meta">${escapeHtml(Person.given_name)} ${escapeHtml(Person.family_name)}</span>
        <span class="card-meta">${escapeHtml(Pension.typeName)} · ${escapeHtml(Pension.startDate)}${Pension.endDate ? ` - ${escapeHtml(Pension.endDate)}` : ""}</span>
      </button>`;
    })
    .join("");
}

async function renderHome() {
  const credentials = await listCredentials();
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Authbound Pension Credential</title>
    <style>
      :root {
        color-scheme: light;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #182230;
        background: #f5f7f9;
        --border: #d8e0e8;
        --muted: #526071;
        --surface: #ffffff;
        --surface-soft: #f7fafc;
        --ink: #182230;
        --accent: #174ea6;
        --accent-strong: #123f7a;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background:
          linear-gradient(180deg, rgba(255,255,255,0.82), rgba(245,247,249,0.96)),
          radial-gradient(circle at top left, rgba(23,78,166,0.09), transparent 34rem);
        -webkit-font-smoothing: antialiased;
      }
      main {
        display: grid;
        grid-template-columns: minmax(296px, 400px) minmax(280px, 1fr);
        min-height: 100vh;
      }
      aside {
        border-right: 1px solid var(--border);
        background: rgba(255,255,255,0.92);
        padding: 30px;
        position: relative;
      }
      aside::before {
        background: linear-gradient(90deg, var(--accent), #2563eb);
        content: "";
        height: 4px;
        left: 0;
        position: absolute;
        right: 0;
        top: 0;
      }
      section {
        padding: 30px;
      }
      .eyebrow,
      .panel-kicker {
        color: var(--accent-strong);
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0;
        line-height: 1.2;
        margin: 0 0 8px;
        text-transform: uppercase;
      }
      h1 {
        font-size: 26px;
        line-height: 1.2;
        margin: 0 0 8px;
      }
      p {
        color: var(--muted);
        line-height: 1.55;
        margin: 0 0 20px;
      }
      .credential-list {
        display: grid;
        gap: 10px;
      }
      .credential-card {
        display: grid;
        gap: 6px;
        width: 100%;
        padding: 15px;
        border: 1px solid var(--border);
        border-radius: 8px;
        background: var(--surface);
        color: inherit;
        text-align: left;
        cursor: pointer;
        transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease, background 160ms ease;
      }
      .credential-card:hover {
        border-color: #9fb3c7;
        transform: translateY(-1px);
      }
      .credential-card[aria-pressed="true"] {
        background: #f2f6fd;
        border-color: var(--accent);
        box-shadow: 0 0 0 3px rgba(23, 78, 166, 0.13);
      }
      .card-title {
        font-weight: 700;
      }
      .card-description,
      .card-meta {
        color: #586779;
        font-size: 13px;
        line-height: 1.4;
      }
      .workspace {
        display: grid;
        gap: 24px;
        max-width: 940px;
      }
      .flow-strip {
        background: rgba(255,255,255,0.78);
        border: 1px solid var(--border);
        border-radius: 8px;
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        overflow: hidden;
      }
      .flow-step {
        border-right: 1px solid var(--border);
        color: var(--muted);
        display: grid;
        gap: 3px;
        min-width: 0;
        padding: 12px 14px;
      }
      .flow-step:last-child {
        border-right: 0;
      }
      .flow-step strong {
        color: var(--ink);
        font-size: 13px;
      }
      .flow-step span {
        font-size: 12px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .panel {
        display: grid;
        gap: 16px;
        border-top: 1px solid var(--border);
        padding-top: 24px;
      }
      .panel:last-child {
        border-bottom: 1px solid var(--border);
        padding-bottom: 24px;
      }
      .panel-header {
        align-items: end;
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        justify-content: space-between;
      }
      h2 {
        font-size: 18px;
        line-height: 1.25;
        margin: 0;
      }
      .toolbar {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
      }
      button.primary {
        border: 0;
        border-radius: 8px;
        background: var(--ink);
        color: #ffffff;
        cursor: pointer;
        font-weight: 700;
        min-height: 42px;
        padding: 0 16px;
        transition: background 160ms ease, transform 160ms ease, box-shadow 160ms ease;
      }
      button.primary:hover {
        background: #123f7a;
        box-shadow: 0 8px 18px rgba(18, 63, 122, 0.17);
        transform: translateY(-1px);
      }
      button.primary:disabled {
        cursor: wait;
        opacity: 0.65;
        transform: none;
        box-shadow: none;
      }
      .result {
        display: grid;
        gap: 16px;
      }
      .qr-panel {
        display: none;
        align-items: start;
        gap: 18px;
        border: 1px solid var(--border);
        border-radius: 8px;
        background: var(--surface);
        padding: 18px;
      }
      .qr-panel[data-visible="true"] {
        display: grid;
        grid-template-columns: 288px minmax(0, 1fr);
      }
      .qr-box {
        background: #ffffff;
        border: 1px solid #eef2f6;
        border-radius: 8px;
        padding: 10px;
      }
      .qr-box svg {
        display: block;
        width: 100%;
        height: auto;
      }
      pre {
        margin: 0;
        overflow: auto;
        border: 1px solid #1f2937;
        border-radius: 8px;
        background: #101828;
        color: #e5edf7;
        padding: 16px;
        font-size: 13px;
        line-height: 1.45;
        max-height: 430px;
      }
      pre[hidden] {
        display: none;
      }
      .offer-link {
        overflow-wrap: anywhere;
        color: #1b5fd8;
      }
      .status {
        color: var(--muted);
        min-height: 22px;
      }
      .status[data-state="verified"] {
        color: #174ea6;
        font-weight: 700;
      }
      .qr-panel[data-status="verified"] {
        border-color: #2563eb;
        box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.14);
      }
      @media (max-width: 760px) {
        main { grid-template-columns: 1fr; }
        aside { border-right: 0; border-bottom: 1px solid var(--border); }
        section { padding: 22px; }
        .flow-strip { grid-template-columns: 1fr; }
        .flow-step { border-right: 0; border-bottom: 1px solid var(--border); }
        .flow-step:last-child { border-bottom: 0; }
        .qr-panel[data-visible="true"] { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <main>
      <aside>
        <p class="eyebrow">Pension example</p>
        <h1>Pension credential</h1>
        <p>Issue JSON-LD pension credentials and create a verifier request for the same Authbound pension policy.</p>
        <div class="credential-list">${renderCredentialCards(credentials)}</div>
      </aside>
      <section>
        <div class="workspace">
          <div class="flow-strip" aria-label="Pension credential SDK flow">
            <div class="flow-step"><strong>1. Definition</strong><span>Register pension claims</span></div>
            <div class="flow-step"><strong>2. Offer</strong><span>Create wallet issuance</span></div>
            <div class="flow-step"><strong>3. Verify</strong><span>Poll and read result</span></div>
          </div>
          <div class="panel">
            <div class="panel-header">
              <div>
                <p class="panel-kicker">Issuer</p>
                <h2>Issue credential</h2>
              </div>
            </div>
            <div class="toolbar">
              <button class="primary" id="create-offer" type="button">Create wallet offer</button>
              <span class="status" id="status"></span>
            </div>
            <div class="qr-panel" id="qr-panel">
              <div class="qr-box" id="qr"></div>
              <div>
                <h2 id="issued-title">Wallet offer</h2>
                <p><a class="offer-link" id="offer-link" href="#"></a></p>
              </div>
            </div>
            <pre id="preview">${escapeHtml(JSON.stringify(credentials[0].credential, null, 2))}</pre>
          </div>
          <div class="panel">
            <div class="panel-header">
              <div>
                <p class="panel-kicker">Verifier</p>
                <h2>Verify credential</h2>
              </div>
            </div>
            <div class="toolbar">
              <button class="primary" id="create-verification" type="button">Create verification</button>
              <span class="status" id="verification-status"></span>
            </div>
            <div class="qr-panel" id="verification-panel">
              <div class="qr-box" id="verification-qr"></div>
              <div>
                <h2 id="verification-title">Verification request</h2>
                <p><a class="offer-link" id="verification-link" href="#"></a></p>
              </div>
            </div>
            <pre id="verification-result" hidden></pre>
          </div>
        </div>
      </section>
    </main>
    <script type="module">
      const credentials = ${scriptJson(credentials)};
      let selectedSlug = credentials[0].slug;
      const cards = Array.from(document.querySelectorAll(".credential-card"));
      const preview = document.querySelector("#preview");
      const status = document.querySelector("#status");
      const createOffer = document.querySelector("#create-offer");
      const qrPanel = document.querySelector("#qr-panel");
      const qr = document.querySelector("#qr");
      const offerLink = document.querySelector("#offer-link");
      const issuedTitle = document.querySelector("#issued-title");
      const createVerification = document.querySelector("#create-verification");
      const verificationStatus = document.querySelector("#verification-status");
      const verificationPanel = document.querySelector("#verification-panel");
      const verificationQr = document.querySelector("#verification-qr");
      const verificationLink = document.querySelector("#verification-link");
      const verificationTitle = document.querySelector("#verification-title");
      const verificationResult = document.querySelector("#verification-result");
      let verificationPoll;

      function selectCredential(slug) {
        selectedSlug = slug;
        const selected = credentials.find((credential) => credential.slug === slug);
        preview.textContent = JSON.stringify(selected.credential, null, 2);
        cards.forEach((card) => {
          card.setAttribute("aria-pressed", String(card.dataset.slug === slug));
        });
        qrPanel.removeAttribute("data-visible");
        status.textContent = "";
      }

      cards.forEach((card) => {
        card.addEventListener("click", () => selectCredential(card.dataset.slug));
      });

      createOffer.addEventListener("click", async () => {
        createOffer.disabled = true;
        status.textContent = "Creating offer...";
        qrPanel.removeAttribute("data-visible");
        try {
          const response = await fetch("/offer", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ slug: selectedSlug }),
          });
          const body = await response.json();
          if (!response.ok) {
            throw new Error(body.error ?? "Offer creation failed");
          }

          qr.innerHTML = body.qrSvg;
          offerLink.href = body.offer.offerUri;
          offerLink.textContent = body.offer.offerUri;
          issuedTitle.textContent = body.credential.title;
          status.textContent = "Offer ready";
          qrPanel.setAttribute("data-visible", "true");
        } catch (error) {
          status.textContent = error instanceof Error ? error.message : "Offer creation failed";
        } finally {
          createOffer.disabled = false;
        }
      });

      createVerification.addEventListener("click", async () => {
        createVerification.disabled = true;
        verificationStatus.textContent = "Creating verification...";
        verificationStatus.removeAttribute("data-state");
        verificationPanel.removeAttribute("data-visible");
        verificationPanel.removeAttribute("data-status");
        verificationResult.hidden = true;
        verificationResult.textContent = "";
        clearInterval(verificationPoll);
        try {
          const response = await fetch("/verify", {
            method: "POST",
          });
          const body = await response.json();
          if (!response.ok) {
            throw new Error(body.error ?? "Verification creation failed");
          }

          const handoff = body.verification.clientAction?.data ?? body.verification.verificationUrl ?? "";
          verificationQr.innerHTML = body.qrSvg ?? "";
          verificationLink.href = handoff || "#";
          verificationLink.textContent = handoff || body.verification.id;
          verificationTitle.textContent = body.verification.id;
          verificationStatus.textContent = "Verification ready";
          verificationPanel.setAttribute("data-visible", "true");
          pollVerification(body.verification.id);
        } catch (error) {
          verificationStatus.textContent = error instanceof Error ? error.message : "Verification creation failed";
        } finally {
          createVerification.disabled = false;
        }
      });

      async function pollVerification(id) {
        const terminal = new Set(["verified", "failed", "expired", "canceled", "timeout"]);
        async function refresh() {
          try {
            const response = await fetch("/status?id=" + encodeURIComponent(id));
            const body = await response.json();
            if (!response.ok) {
              throw new Error(body.error ?? "Status check failed");
            }

            verificationStatus.textContent = body.status;
            verificationStatus.dataset.state = body.status;
            verificationPanel.dataset.status = body.status;
            if (body.status === "verified") {
              await loadVerificationResult(id);
            }
            if (terminal.has(body.status)) {
              clearInterval(verificationPoll);
            }
          } catch (error) {
            clearInterval(verificationPoll);
            verificationStatus.textContent = error instanceof Error ? error.message : "Status check failed";
          }
        }

        await refresh();
        verificationPoll = setInterval(refresh, 3000);
      }

      async function loadVerificationResult(id) {
        const response = await fetch("/result?id=" + encodeURIComponent(id));
        const body = await response.json();
        if (!response.ok) {
          throw new Error(body.error ?? "Result fetch failed");
        }

        verificationStatus.textContent = "Credential verified";
        verificationResult.hidden = false;
        verificationResult.textContent = JSON.stringify(body, null, 2);
      }

      selectCredential(selectedSlug);
    </script>
  </body>
</html>`;
}

function errorBody(error: unknown) {
  if (error instanceof AuthboundClientError) {
    return { error: error.message, code: error.code };
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

export function createApp() {
  const app = express();
  const verificationSessions: VerificationSessionStore = new Map();

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

        response.json(await createOffer(slug));
      })
    )
    .all(methodNotAllowed("POST", "/offer"));

  app
    .route("/verify")
    .post(
      asyncRoute(async (_request, response) => {
        response.json(await createVerification(verificationSessions));
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
            queryString(request.query.id)
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
            queryString(request.query.id)
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
  const server = createApp();
  server.listen(port, host, () => {
    console.log(`Issuer demo listening on http://${host}:${port}`);
  });
}
