import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthboundClient } from "../client/factory";
import { AuthboundError } from "../types/errors";
import type {
  CreateVerificationResponse,
  FinalizeVerificationResponse,
} from "../types/verification";
import { createBrowserVerificationFlow } from "./browser-flow";

function createClientStub() {
  let statusHandler:
    | Parameters<AuthboundClient["subscribeToStatus"]>[2]
    | null = null;
  let statusErrorHandler: NonNullable<
    NonNullable<Parameters<AuthboundClient["subscribeToStatus"]>[3]>["onError"]
  > | null = null;
  const cleanup = vi.fn();

  const client = {
    startVerification: vi.fn().mockResolvedValue({
      verificationId: "vrf_test123",
      authorizationRequestUrl:
        "openid4vp://authorize?request_uri=https%3A%2F%2Fgateway.example.com",
      clientToken: "client_token_123",
      expiresAt: "2026-05-15T12:01:00.000Z",
    }),
    subscribeToStatus: vi.fn((_, __, handler, options) => {
      statusHandler = handler;
      statusErrorHandler = options?.onError ?? null;
      return cleanup;
    }),
    finalizeVerification: vi.fn().mockResolvedValue({
      isVerified: true,
      verificationId: "vrf_test123",
      status: "verified",
    }),
    getDeepLink: vi.fn(
      (authorizationRequestUrl: string) => `deeplink:${authorizationRequestUrl}`
    ),
    getUniversalLink: vi.fn(),
    log: vi.fn(),
  } as unknown as AuthboundClient;

  return {
    client,
    cleanup,
    emitStatus: (event: Parameters<NonNullable<typeof statusHandler>>[0]) => {
      if (!statusHandler) {
        throw new Error("No status handler registered");
      }
      statusHandler(event);
    },
    emitStatusError: (error: AuthboundError) => {
      if (!statusErrorHandler) {
        throw new Error("No status error handler registered");
      }
      statusErrorHandler(error);
    },
  };
}

describe("createBrowserVerificationFlow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-15T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("starts, subscribes, finalizes SDK sessions, and emits verified state", async () => {
    const { client, cleanup, emitStatus } = createClientStub();
    const states: string[] = [];
    const flow = createBrowserVerificationFlow({
      client,
      sessionMode: "sdk",
      onStateChange: (state) => states.push(state.status),
    });

    await flow.start({ policyId: "pol_age_over_18_authbound_v1" as never });

    expect(client.startVerification).toHaveBeenCalledWith({
      policyId: "pol_age_over_18_authbound_v1",
    });
    expect(client.subscribeToStatus).toHaveBeenCalledTimes(1);
    expect(flow.getState()).toMatchObject({
      verificationId: "vrf_test123",
      status: "pending",
      deepLink:
        "deeplink:openid4vp://authorize?request_uri=https%3A%2F%2Fgateway.example.com",
    });

    emitStatus({
      type: "status",
      status: "verified",
      timestamp: "2026-05-15T12:00:05.000Z",
    });
    await vi.runAllTimersAsync();

    expect(client.finalizeVerification).toHaveBeenCalledTimes(1);
    expect(client.finalizeVerification).toHaveBeenCalledWith(
      "vrf_test123",
      "client_token_123"
    );
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(flow.getState()).toMatchObject({ status: "verified" });
    expect(states).toContain("verified");
  });

  it("does not finalize in manual session mode", async () => {
    const { client, emitStatus } = createClientStub();
    const flow = createBrowserVerificationFlow({
      client,
      sessionMode: "manual",
    });

    await flow.start({ policyId: "pol_age_over_18_authbound_v1" as never });
    emitStatus({
      type: "status",
      status: "verified",
      timestamp: "2026-05-15T12:00:05.000Z",
    });
    await vi.runAllTimersAsync();

    expect(client.finalizeVerification).not.toHaveBeenCalled();
    expect(flow.getState()).toMatchObject({ status: "verified" });
  });

  it("turns expiry into a browser timeout state", async () => {
    const { client, cleanup } = createClientStub();
    const flow = createBrowserVerificationFlow({
      client,
      sessionMode: "manual",
    });

    await flow.start({ policyId: "pol_age_over_18_authbound_v1" as never });
    await vi.advanceTimersByTimeAsync(61_000);

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(flow.getState()).toMatchObject({
      status: "timeout",
      error: expect.objectContaining({
        code: "wallet_timeout",
      }) as AuthboundError,
    });
  });

  it("cleans up subscriptions and returns to idle on reset", async () => {
    const { client, cleanup } = createClientStub();
    const flow = createBrowserVerificationFlow({
      client,
      sessionMode: "sdk",
    });

    await flow.start({ policyId: "pol_age_over_18_authbound_v1" as never });
    flow.reset();

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(flow.getState()).toEqual({ status: "idle" });
  });

  it.each([
    "dispose",
    "reset",
  ] as const)("does not subscribe after %s while start is in flight", async (action) => {
    const { client } = createClientStub();
    let resolveStart: (response: CreateVerificationResponse) => void = () => {};
    client.startVerification = vi.fn(
      () =>
        new Promise<CreateVerificationResponse>((resolve) => {
          resolveStart = resolve;
        })
    );
    const flow = createBrowserVerificationFlow({
      client,
      sessionMode: "manual",
    });

    const startPromise = flow.start();
    flow[action]();
    resolveStart({
      verificationId: "vrf_test123" as never,
      authorizationRequestUrl: "openid4vp://authorize",
      clientToken: "client_token_123" as never,
      expiresAt: "2026-05-15T12:01:00.000Z",
    });
    await startPromise;

    expect(client.subscribeToStatus).not.toHaveBeenCalled();
    expect(flow.getState()).toEqual({ status: "idle" });
  });

  it("does not start after disposal", async () => {
    const { client } = createClientStub();
    const flow = createBrowserVerificationFlow({ client });

    flow.dispose();
    await flow.start();

    expect(client.startVerification).not.toHaveBeenCalled();
  });

  it("keeps the latest verification when starts overlap", async () => {
    const { client } = createClientStub();
    const resolvers: Array<(response: CreateVerificationResponse) => void> = [];
    client.startVerification = vi.fn(
      () =>
        new Promise<CreateVerificationResponse>((resolve) => {
          resolvers.push(resolve);
        })
    );
    const flow = createBrowserVerificationFlow({
      client,
      sessionMode: "manual",
    });

    const firstStart = flow.start();
    const secondStart = flow.start();
    resolvers[1]?.({
      verificationId: "vrf_second" as never,
      authorizationRequestUrl: "openid4vp://second",
      clientToken: "client_token_second" as never,
      expiresAt: "2026-05-15T12:01:00.000Z",
    });
    await secondStart;
    resolvers[0]?.({
      verificationId: "vrf_first" as never,
      authorizationRequestUrl: "openid4vp://first",
      clientToken: "client_token_first" as never,
      expiresAt: "2026-05-15T12:01:00.000Z",
    });
    await firstStart;

    expect(flow.getState()).toMatchObject({
      verificationId: "vrf_second",
      status: "pending",
    });
    expect(client.subscribeToStatus).toHaveBeenCalledTimes(1);
    expect(client.subscribeToStatus).toHaveBeenCalledWith(
      "vrf_second",
      "client_token_second",
      expect.any(Function),
      expect.any(Object)
    );
  });

  it("does not let stale finalization mutate a restarted flow", async () => {
    const { client, cleanup, emitStatus } = createClientStub();
    let resolveFinalization: (response: FinalizeVerificationResponse) => void =
      () => {};
    client.finalizeVerification = vi.fn(
      () =>
        new Promise<FinalizeVerificationResponse>((resolve) => {
          resolveFinalization = resolve;
        })
    );
    client.startVerification = vi
      .fn()
      .mockResolvedValueOnce({
        verificationId: "vrf_first",
        authorizationRequestUrl: "openid4vp://first",
        clientToken: "client_token_first",
        expiresAt: "2026-05-15T12:01:00.000Z",
      })
      .mockResolvedValueOnce({
        verificationId: "vrf_second",
        authorizationRequestUrl: "openid4vp://second",
        clientToken: "client_token_second",
        expiresAt: "2026-05-15T12:01:00.000Z",
      });
    const flow = createBrowserVerificationFlow({ client });

    await flow.start();
    emitStatus({
      type: "status",
      status: "verified",
      timestamp: "2026-05-15T12:00:05.000Z",
    });
    await vi.advanceTimersByTimeAsync(0);
    flow.reset();
    const restart = flow.start();

    expect(client.startVerification).toHaveBeenCalledTimes(2);

    resolveFinalization({
      isVerified: true,
      verificationId: "vrf_first" as never,
      status: "verified",
    });
    await restart;

    expect(flow.getState()).toMatchObject({
      verificationId: "vrf_second",
      status: "pending",
    });
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("ignores subscription errors after disposal", async () => {
    const { client, cleanup, emitStatusError } = createClientStub();
    const states: string[] = [];
    const flow = createBrowserVerificationFlow({
      client,
      sessionMode: "manual",
      onStateChange: (state) => states.push(state.status),
    });

    await flow.start({ policyId: "pol_age_over_18_authbound_v1" as never });
    flow.dispose();
    const statesBeforeError = [...states];
    emitStatusError(new AuthboundError("network_error", "disconnected"));

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(flow.getState()).toMatchObject({ status: "pending" });
    expect(states).toEqual(statesBeforeError);
  });

  it("does not synthesize deep links for request_blob QR payloads", async () => {
    const { client } = createClientStub();
    client.startVerification = vi.fn().mockResolvedValue({
      verificationId: "vrf_test123",
      authorizationRequestUrl: "https://wallet.example/request.jwt",
      clientToken: "client_token_123",
      expiresAt: "2026-05-15T12:01:00.000Z",
      walletHandoffKind: "request_blob",
    });
    const flow = createBrowserVerificationFlow({
      client,
      sessionMode: "manual",
    });

    await flow.start({ policyId: "pol_age_over_18_authbound_v1" as never });

    expect(client.getDeepLink).not.toHaveBeenCalled();
    expect(flow.getState()).toMatchObject({
      authorizationRequestUrl: "https://wallet.example/request.jwt",
      walletHandoffKind: "request_blob",
    });
    expect(flow.getState().deepLink).toBeUndefined();
  });

  it("does not synthesize deep links for dc api browser handoff payloads", async () => {
    const { client } = createClientStub();
    client.startVerification = vi.fn().mockResolvedValue({
      verificationId: "vrf_test123",
      authorizationRequestUrl: JSON.stringify({
        protocol: "openid4vp-v1-unsigned",
        request_uri: "https://verifier.example/request.jwt",
      }),
      clientToken: "client_token_123",
      expiresAt: "2026-05-15T12:01:00.000Z",
      walletHandoffKind: "dc_api",
    });
    const flow = createBrowserVerificationFlow({
      client,
      sessionMode: "manual",
    });

    await flow.start({ policyId: "pol_age_over_18_authbound_v1" as never });

    expect(client.getDeepLink).not.toHaveBeenCalled();
    expect(flow.getState()).toMatchObject({
      walletHandoffKind: "dc_api",
    });
    expect(flow.getState().deepLink).toBeUndefined();
  });

  it("synthesizes deep links for plain HTTPS request URLs", async () => {
    const { client } = createClientStub();
    client.startVerification = vi.fn().mockResolvedValue({
      verificationId: "vrf_test123",
      authorizationRequestUrl: "https://gateway.example/request.jwt",
      clientToken: "client_token_123",
      expiresAt: "2026-05-15T12:01:00.000Z",
    });
    const flow = createBrowserVerificationFlow({
      client,
      sessionMode: "manual",
    });

    await flow.start({ policyId: "pol_age_over_18_authbound_v1" as never });

    expect(client.getDeepLink).toHaveBeenCalledWith(
      "https://gateway.example/request.jwt"
    );
    expect(flow.getState()).toMatchObject({
      authorizationRequestUrl: "https://gateway.example/request.jwt",
      deepLink: "deeplink:https://gateway.example/request.jwt",
    });
  });

  it("does not synthesize deep links for Authbound hosted verification fallback URLs", async () => {
    const { client } = createClientStub();
    client.startVerification = vi.fn().mockResolvedValue({
      verificationId: "vrf_test123",
      authorizationRequestUrl:
        "https://ab-demo.authbound.io/v/3639989b-baf7-413b-b769-4189ea705340",
      clientToken: "client_token_123",
      expiresAt: "2026-05-15T12:01:00.000Z",
    });
    const flow = createBrowserVerificationFlow({
      client,
      sessionMode: "manual",
    });

    await flow.start({ policyId: "pol_age_over_18_authbound_v1" as never });

    expect(client.getDeepLink).not.toHaveBeenCalled();
    expect(flow.getState()).toMatchObject({
      authorizationRequestUrl:
        "https://ab-demo.authbound.io/v/3639989b-baf7-413b-b769-4189ea705340",
    });
    expect(flow.getState().deepLink).toBeUndefined();
  });
});
