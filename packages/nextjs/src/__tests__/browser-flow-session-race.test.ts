import {
  type AuthboundClient,
  createBrowserVerificationFlow,
  createClient,
} from "@authbound/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSessionRoute,
  createVerificationRoute,
  getVerificationFromToken,
} from "../server";

const BROWSER_ORIGIN = "https://demo.authbound.test";
const SESSION_SECRET = "session-secret-at-least-32-characters";

function gatewayVerification(id: string): Response {
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  return Response.json({
    object: "verification",
    id,
    client_token: `client_token_${id}`,
    client_action: {
      kind: "link",
      data: `openid4vp://authorize?request_uri=https%3A%2F%2Fapi.authbound.io%2F${id}`,
      expires_at: expiresAt,
    },
    expires_at: expiresAt,
  });
}

function installBrowserSessionLocks(): ReturnType<typeof vi.fn> {
  let tail = Promise.resolve();
  const request = vi.fn(
    (_name: string, operation: () => Promise<unknown>): Promise<unknown> => {
      const result = tail.then(operation);
      tail = result.then(
        () => undefined,
        () => undefined
      );
      return result;
    }
  );
  vi.stubGlobal("navigator", { locks: { request } });
  return request;
}

describe("browser flow session cookie ordering", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("keeps a new controller's pending cookie when stale finalization returns", async () => {
    const lockRequest = installBrowserSessionLocks();
    const cookies = new Map<string, string>();
    const createHandler = createVerificationRoute({
      policyId: "pol_authbound_pension_v1" as never,
      gatewayUrl: "https://api.authbound.io",
      secret: "sk_test_secret",
      sessionSecret: SESSION_SECRET,
    });
    const sessionHandler = createSessionRoute({
      gatewayUrl: "https://api.authbound.io",
      secret: "sk_test_secret",
      sessionSecret: SESSION_SECRET,
    });
    let createCount = 0;
    let resultRequested = false;
    let resolveFirstResult: (response: Response) => void = () => {};

    function applyResponseCookies(response: Response): void {
      const setCookie = response.headers.get("set-cookie") ?? "";
      for (const name of ["__authbound", "__authbound_pending"]) {
        const value = new RegExp(`(?:^|,\\s*)${name}=([^;]*)`).exec(
          setCookie
        )?.[1];
        if (value === undefined) {
          continue;
        }
        if (value.length === 0) {
          cookies.delete(name);
        } else {
          cookies.set(name, value);
        }
      }
    }

    function browserCookieHeader(): string {
      return [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
    }

    global.fetch = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const rawUrl = input instanceof Request ? input.url : input.toString();
        const url = new URL(rawUrl, BROWSER_ORIGIN);

        if (url.origin === BROWSER_ORIGIN) {
          const headers = new Headers(init?.headers);
          headers.set("cookie", browserCookieHeader());
          headers.set("origin", BROWSER_ORIGIN);
          headers.set("sec-fetch-site", "same-origin");
          const request = new Request(url, { ...init, headers });
          const response = await (url.pathname.endsWith("/session")
            ? sessionHandler(request)
            : createHandler(request));
          applyResponseCookies(response);
          return response;
        }

        if (url.pathname === "/v1/verifications") {
          createCount += 1;
          return gatewayVerification(
            createCount === 1 ? "vrf_first" : "vrf_second"
          );
        }

        if (url.pathname === "/v1/verifications/vrf_first/result") {
          resultRequested = true;
          return new Promise<Response>((resolve) => {
            resolveFirstResult = resolve;
          });
        }

        throw new Error(`Unexpected fetch: ${url}`);
      }
    ) as typeof fetch;
    vi.stubGlobal("location", new URL(BROWSER_ORIGIN));

    const clientConfig = {
      publishableKey: "pk_test_public123",
      policyId: "pol_authbound_pension_v1" as never,
      verificationEndpoint: "/api/authbound/verification",
      sessionEndpoint: "/api/authbound/session",
    };
    const client = createClient(clientConfig);
    let statusHandler: Parameters<AuthboundClient["subscribeToStatus"]>[2] =
      () => {
        throw new Error("Status handler was not registered");
      };
    client.subscribeToStatus = vi.fn((_id, _token, handler) => {
      statusHandler = handler;
      return vi.fn();
    });
    const flow = createBrowserVerificationFlow({ client });

    await flow.start();
    statusHandler({
      type: "status",
      status: "verified",
      timestamp: "2026-08-26T10:00:00.000Z",
    });
    await vi.waitFor(() => expect(resultRequested).toBe(true));

    const replacementClient = createClient(clientConfig);
    replacementClient.subscribeToStatus = vi.fn(() => vi.fn());
    const replacementFlow = createBrowserVerificationFlow({
      client: replacementClient,
    });
    const restart = replacementFlow.start();
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        resolveFirstResult(
          Response.json({
            verification_id: "vrf_first",
            status: "verified",
            result_token: "signed_result_token",
            assertions: { age_over_18: true },
          })
        );
        resolve();
      }, 0);
    });
    await restart;
    await vi.waitFor(() => expect(cookies.has("__authbound")).toBe(true));

    const pendingToken = cookies.get("__authbound_pending");
    expect(pendingToken).toBeDefined();
    await expect(
      getVerificationFromToken(pendingToken ?? "", SESSION_SECRET)
    ).resolves.toMatchObject({
      status: "PENDING",
      verificationId: "vrf_second",
    });
    expect(lockRequest).toHaveBeenCalledTimes(3);
    expect(
      lockRequest.mock.calls.every(
        ([name]) => name === `authbound:browser-session:${BROWSER_ORIGIN}`
      )
    ).toBe(true);
  });

  it("serializes verification creation across browser clients", async () => {
    const cookies = new Map<string, string>();
    const createHandler = createVerificationRoute({
      policyId: "pol_authbound_pension_v1" as never,
      gatewayUrl: "https://api.authbound.io",
      secret: "sk_test_secret",
      sessionSecret: SESSION_SECRET,
    });
    let createCount = 0;
    let resolveFirstCreate: (response: Response) => void = () => {};

    global.fetch = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const rawUrl = input instanceof Request ? input.url : input.toString();
        const url = new URL(rawUrl, BROWSER_ORIGIN);

        if (url.origin === BROWSER_ORIGIN) {
          const headers = new Headers(init?.headers);
          headers.set(
            "cookie",
            [...cookies].map(([name, value]) => `${name}=${value}`).join("; ")
          );
          headers.set("origin", BROWSER_ORIGIN);
          headers.set("sec-fetch-site", "same-origin");
          const response = await createHandler(
            new Request(url, { ...init, headers })
          );
          const setCookie = response.headers.get("set-cookie") ?? "";
          const pendingCookie = /(?:^|,\s*)__authbound_pending=([^;]*)/.exec(
            setCookie
          )?.[1];
          if (pendingCookie) {
            cookies.set("__authbound_pending", pendingCookie);
          }
          return response;
        }

        if (url.pathname === "/v1/verifications") {
          createCount += 1;
          if (createCount === 1) {
            return new Promise<Response>((resolve) => {
              resolveFirstCreate = resolve;
            });
          }
          return gatewayVerification("vrf_second");
        }

        throw new Error(`Unexpected fetch: ${url}`);
      }
    ) as typeof fetch;
    vi.stubGlobal("location", new URL(BROWSER_ORIGIN));

    const clientConfig = {
      publishableKey: "pk_test_public123",
      policyId: "pol_authbound_pension_v1" as never,
      verificationEndpoint: "/api/authbound/verification",
      sessionEndpoint: "/api/authbound/session",
    };
    const firstStart = createClient(clientConfig).startVerification();
    const secondStart = createClient(clientConfig).startVerification();

    await vi.waitFor(() => expect(createCount).toBe(1));
    resolveFirstCreate(gatewayVerification("vrf_first"));
    await Promise.all([firstStart, secondStart]);

    expect(createCount).toBe(2);
    const pendingToken = cookies.get("__authbound_pending");
    expect(pendingToken).toBeDefined();
    await expect(
      getVerificationFromToken(pendingToken ?? "", SESSION_SECRET)
    ).resolves.toMatchObject({
      status: "PENDING",
      verificationId: "vrf_second",
    });
  });
});
