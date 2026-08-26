import type {
  BrowserVerificationFlowClient,
  BrowserVerificationFlowOptions,
} from "@authbound/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  client: null as unknown,
  config: {
    policyId: "pol_authbound_pension_v1",
    sessionMode: "sdk" as "sdk" | "manual",
  },
}));

vi.mock("nuxt/app", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("vue", async (importOriginal) => {
  const actual = await importOriginal<typeof import("vue")>();
  return { ...actual, onUnmounted: vi.fn() };
});

vi.mock("../runtime/composables/useAuthbound", () => ({
  useAuthbound: () => ({ client: null, config: harness.config }),
}));

vi.mock("@authbound/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@authbound/core")>();
  return {
    ...actual,
    createBrowserVerificationFlow: (
      options: BrowserVerificationFlowOptions
    ) => {
      harness.client = options.client;
      return {
        dispose: vi.fn(),
        getState: () => ({ status: "idle" as const }),
        reset: vi.fn(),
        start: async (
          startOptions: Parameters<typeof options.client.startVerification>[0]
        ) => {
          await options.client.startVerification(startOptions);
        },
      };
    },
  };
});

import { useVerification } from "../runtime/composables/useVerification";

function fallbackClient(): BrowserVerificationFlowClient {
  return harness.client as BrowserVerificationFlowClient;
}

function createResponse() {
  return {
    authorizationRequestUrl: "openid4vp://authorize?request_uri=123",
    clientToken: "client_token_123",
    expiresAt: "2026-08-26T12:00:00.000Z",
    verificationId: "vrf_test123",
  };
}

describe("Nuxt verification fallback client", () => {
  beforeEach(() => {
    harness.client = null;
    harness.config = {
      policyId: "pol_authbound_pension_v1",
      sessionMode: "sdk",
    };
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the same browser lock for SDK create and finalize", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createResponse())
      .mockResolvedValueOnce({ status: "verified" });
    const request = vi.fn((_name: string, operation: () => Promise<unknown>) =>
      operation()
    );
    vi.stubGlobal("$fetch", fetchMock);
    vi.stubGlobal("location", new URL("https://demo.authbound.test/verify"));
    vi.stubGlobal("navigator", { locks: { request } });

    const verification = useVerification();
    await verification.startVerification();
    await fallbackClient().finalizeVerification(
      "vrf_test123" as never,
      "client_token_123" as never
    );

    expect(request).toHaveBeenCalledTimes(2);
    expect(
      request.mock.calls.every(
        ([name]) =>
          name === "authbound:browser-session:https://demo.authbound.test"
      )
    ).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fails SDK create and finalize before fetch without Web Locks", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("$fetch", fetchMock);
    vi.stubGlobal("location", new URL("https://demo.authbound.test/verify"));
    vi.stubGlobal("navigator", {});

    const verification = useVerification();
    await expect(verification.startVerification()).rejects.toMatchObject({
      code: "session_coordination_unsupported",
    });
    await expect(
      fallbackClient().finalizeVerification(
        "vrf_test123" as never,
        "client_token_123" as never
      )
    ).rejects.toMatchObject({ code: "session_coordination_unsupported" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps manual fallback sessions operational without Web Locks", async () => {
    harness.config.sessionMode = "manual";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createResponse())
      .mockResolvedValueOnce({ status: "verified" });
    vi.stubGlobal("$fetch", fetchMock);
    vi.stubGlobal("location", new URL("https://demo.authbound.test/verify"));
    vi.stubGlobal("navigator", {});

    const verification = useVerification();
    await verification.startVerification();
    await fallbackClient().finalizeVerification(
      "vrf_test123" as never,
      "client_token_123" as never
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
