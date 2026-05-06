import { type IncomingHttpHeaders, request, type Server } from "node:http";
import express, { type Request } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthboundConfig } from "../../core/types";
import { generateWebhookSignature } from "../../core/webhooks";
import { createAuthboundRouter } from "../handlers";

const config: AuthboundConfig = {
  apiKey: `sk_test_${"x".repeat(32)}`,
  publishableKey: `pk_test_${"x".repeat(32)}`,
  secret: "session-secret-at-least-32-characters",
  apiUrl: "https://api.authbound.test",
  webhookSecret: "whsec_test_secret",
  routes: {
    protected: [],
    verify: "/verify",
    callback: "/api/authbound/callback",
  },
};

function listen(app: express.Express): Promise<Server> {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

function requestJson(
  url: string,
  options: {
    method: string;
    headers?: Record<string, string>;
    body?: unknown;
  }
): Promise<{
  statusCode: number;
  headers: IncomingHttpHeaders;
  body: unknown;
}> {
  return new Promise((resolve, reject) => {
    const body =
      options.body === undefined ? undefined : JSON.stringify(options.body);
    const req = request(
      url,
      {
        method: options.method,
        headers: {
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...options.headers,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("error", reject);
        res.on("end", () => {
          const rawBody = Buffer.concat(chunks).toString("utf8");
          resolve({
            statusCode: res.statusCode ?? 0,
            headers: res.headers,
            body: rawBody ? JSON.parse(rawBody) : null,
          });
        });
      }
    );
    req.on("error", reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

function getSetCookie(headers: IncomingHttpHeaders): string {
  const value = headers["set-cookie"];
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  return value ?? "";
}

describe("Express Authbound router contract", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("binds session finalization to the pending verification cookie", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            object: "verification",
            id: "vrf_test123",
            status: "pending",
            client_token: "client_token_123",
            client_action: {
              kind: "link",
              data: "openid4vp://authorize?request_uri=https%3A%2F%2Fapi.authbound.test%2Frequest%2F123",
              expires_at: "2026-04-21T10:10:00.000Z",
            },
            expires_at: "2026-04-21T10:10:00.000Z",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            object: "verification_status",
            id: "vrf_test123",
            status: "verified",
            result: { verified: true },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const app = express();
    app.use(express.json());
    app.use("/api/authbound", createAuthboundRouter(config));

    const server = await listen(app);
    const address = server.address();
    if (!(address && typeof address === "object")) {
      throw new Error("Expected Express to listen on an ephemeral port");
    }
    const origin = `http://127.0.0.1:${address.port}`;

    try {
      const createResponse = await requestJson(
        `${origin}/api/authbound/verification`,
        {
          method: "POST",
          body: {
            policyId: "pol_authbound_pension_v1",
            customerUserRef: "user_123",
          },
        }
      );
      const pendingCookie = getSetCookie(createResponse.headers);

      expect(createResponse.statusCode).toBe(200);
      expect(pendingCookie).toContain("__authbound_pending=");

      const sessionResponse = await requestJson(
        `${origin}/api/authbound/session`,
        {
          method: "POST",
          headers: {
            cookie: pendingCookie.split(";")[0] ?? "",
            origin,
            "sec-fetch-site": "same-origin",
          },
          body: {
            verificationId: "vrf_test123",
            clientToken: "client_token_123",
          },
        }
      );

      expect(sessionResponse.statusCode).toBe(200);
      expect(sessionResponse.body).toEqual({
        isVerified: true,
        verificationId: "vrf_test123",
        status: "verified",
      });
      const sessionCookie = getSetCookie(sessionResponse.headers);
      expect(sessionCookie).toContain("__authbound=");
      expect(sessionCookie).toContain("__authbound_pending=;");
      expect(fetchMock.mock.calls[1]?.[1]).toEqual(
        expect.objectContaining({
          headers: expect.objectContaining({
            Origin: origin,
          }),
        })
      );
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  });

  it("accepts signed webhooks with the documented express.json raw-body capture", async () => {
    const onWebhook = vi.fn();
    const app = express();
    app.use(
      express.json({
        verify: (req: Request & { rawBody?: Buffer }, _res, buf) => {
          req.rawBody = Buffer.from(buf);
        },
      })
    );
    app.use("/api/authbound", createAuthboundRouter(config, { onWebhook }));

    const payload = JSON.stringify({
      id: "evt_123",
      object: "event",
      api_version: "2026-04-01",
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      type: "identity.verification_session.verified",
      data: {
        object: {
          id: "vrf_test123",
          object: "identity.verification_session",
          created: Math.floor(Date.now() / 1000),
          livemode: false,
          type: "id_number",
          status: "verified",
          client_reference_id: "user_123",
        },
      },
    });
    const webhookSecret = config.webhookSecret;
    if (!webhookSecret) {
      throw new Error("Expected webhook secret in test config");
    }
    const { signature } = generateWebhookSignature({
      payload,
      secret: webhookSecret,
    });

    const server = await listen(app);
    const address = server.address();
    if (!(address && typeof address === "object")) {
      throw new Error("Expected Express to listen on an ephemeral port");
    }

    try {
      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/authbound/callback`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-authbound-signature": signature,
          },
          body: payload,
        }
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ received: true });
      expect(onWebhook).toHaveBeenCalledTimes(1);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  });
});
