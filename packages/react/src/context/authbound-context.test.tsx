// @vitest-environment happy-dom

import { render, screen, waitFor } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeepLinkButton } from "../components/deep-link-button";
import {
  type UseVerificationOptions,
  useVerification,
} from "../hooks/useVerification";
import { AuthboundProvider, useAuthbound } from "./authbound-context";

function createSseStream(payload: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let sent = false;

  return new ReadableStream({
    pull(controller) {
      if (sent) {
        controller.close();
        return;
      }
      sent = true;
      controller.enqueue(encoder.encode(payload));
    },
  });
}

function AutoStartVerification({ onVerified }: { onVerified?: () => void }) {
  const { startVerification, verification } = useAuthbound();

  useEffect(() => {
    startVerification();
  }, [startVerification]);

  useEffect(() => {
    if (verification?.status === "verified") {
      onVerified?.();
    }
  }, [onVerified, verification?.status]);

  return null;
}

function AutoStartVerificationHook({
  onVerified,
}: {
  onVerified?: UseVerificationOptions["onVerified"];
}) {
  const { startVerification } = useVerification({ onVerified });
  const didStartRef = useRef(false);

  useEffect(() => {
    if (didStartRef.current) {
      return;
    }
    didStartRef.current = true;
    startVerification();
  }, [startVerification]);

  return null;
}

function AutoStartEudiVerificationHook() {
  const { startVerification } = useVerification({
    provider: "eudi",
  });
  const didStartRef = useRef(false);

  useEffect(() => {
    if (didStartRef.current) {
      return;
    }
    didStartRef.current = true;
    startVerification();
  }, [startVerification]);

  return null;
}

function AutoStartRequestBlobDeepLink() {
  const verification = useVerification();
  const didStartRef = useRef(false);

  useEffect(() => {
    if (didStartRef.current) {
      return;
    }
    didStartRef.current = true;
    verification.startVerification();
  }, [verification]);

  const walletHandoffKind = verification.walletHandoffKind;

  return (
    <div>
      <span data-testid="wallet-handoff-kind">
        {walletHandoffKind ?? "missing"}
      </span>
      {verification.authorizationRequestUrl ? (
        <DeepLinkButton
          authorizationRequestUrl={verification.authorizationRequestUrl}
          deepLink={verification.deepLink ?? undefined}
          showOnDesktop
          walletHandoffKind={walletHandoffKind ?? undefined}
        >
          Open in Wallet
        </DeepLinkButton>
      ) : null}
    </div>
  );
}

describe("AuthboundProvider session finalization", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("finalizes the SDK session once when verification is verified", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/authbound/verification") {
        return new Response(
          JSON.stringify({
            verificationId: "vrf_test123",
            authorizationRequestUrl:
              "openid4vp://authorize?request_uri=https%3A%2F%2Fapi.authbound.test%2Frequest%2F123",
            clientToken: "client_token_123",
            expiresAt: "2026-04-21T10:10:00.000Z",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (
        url ===
        "https://api.authbound.test/v1/verifications/vrf_test123/events/sse"
      ) {
        return new Response(
          createSseStream('event: status\ndata: {"status":"verified"}\n\n'),
          { status: 200, headers: { "Content-Type": "text/event-stream" } }
        );
      }
      if (
        url === "https://api.authbound.test/v1/verifications/vrf_test123/status"
      ) {
        return new Response(
          JSON.stringify({
            object: "verification_status",
            id: "vrf_test123",
            status: "verified",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url === "/api/authbound/session") {
        return new Response(
          JSON.stringify({
            isVerified: true,
            verificationId: "vrf_test123",
            status: "verified",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AuthboundProvider
        gatewayUrl="https://api.authbound.test"
        policyId={"pol_authbound_pension_v1" as never}
        publishableKey="pk_test_public123"
      >
        <AutoStartVerification />
      </AuthboundProvider>
    );

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(
          ([input]) => String(input) === "/api/authbound/session"
        )
      ).toHaveLength(1);
    });
  });

  it("does not finalize an SDK session in manual session mode", async () => {
    const onVerified = vi.fn();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/authbound/verification") {
        return new Response(
          JSON.stringify({
            verificationId: "vrf_manual123",
            authorizationRequestUrl:
              "openid4vp://authorize?request_uri=https%3A%2F%2Fapi.authbound.test%2Frequest%2F123",
            clientToken: "client_token_123",
            expiresAt: "2026-04-21T10:10:00.000Z",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (
        url ===
        "https://api.authbound.test/v1/verifications/vrf_manual123/events/sse"
      ) {
        return new Response(
          createSseStream('event: status\ndata: {"status":"verified"}\n\n'),
          { status: 200, headers: { "Content-Type": "text/event-stream" } }
        );
      }
      if (
        url ===
        "https://api.authbound.test/v1/verifications/vrf_manual123/status"
      ) {
        return new Response(
          JSON.stringify({
            object: "verification_status",
            id: "vrf_manual123",
            status: "verified",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AuthboundProvider
        gatewayUrl="https://api.authbound.test"
        policyId={"pol_authbound_pension_v1" as never}
        publishableKey="pk_test_public123"
        sessionMode="manual"
      >
        <AutoStartVerificationHook onVerified={onVerified} />
      </AuthboundProvider>
    );

    await waitFor(() => {
      expect(onVerified).toHaveBeenCalledWith({
        verificationId: "vrf_manual123",
        status: "verified",
      });
    });
    expect(
      fetchMock.mock.calls.filter(
        ([input]) => String(input) === "/api/authbound/session"
      )
    ).toHaveLength(0);
  });

  it("preserves request_blob handoff kind for custom deep-link UI", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/authbound/verification") {
        return new Response(
          JSON.stringify({
            verificationId: "vrf_request_blob123",
            authorizationRequestUrl: "eyJ0eXAiOiJvcGVuaWQ0dnAifQ",
            clientToken: "client_token_123",
            expiresAt: "2026-04-21T10:10:00.000Z",
            walletHandoffKind: "request_blob",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (
        url ===
        "https://api.authbound.test/v1/verifications/vrf_request_blob123/events/sse"
      ) {
        return new Response(createSseStream(""), {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AuthboundProvider
        gatewayUrl="https://api.authbound.test"
        policyId={"pol_authbound_pension_v1" as never}
        publishableKey="pk_test_public123"
        sessionMode="manual"
      >
        <AutoStartRequestBlobDeepLink />
      </AuthboundProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("wallet-handoff-kind").textContent).toBe(
        "request_blob"
      );
    });
    expect(screen.queryByRole("button", { name: "Open in Wallet" })).toBeNull();
  });

  it("does not forward browser provider options from the hook to the verification endpoint", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, _init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/authbound/verification") {
          return new Response(
            JSON.stringify({
              verificationId: "vrf_eudi_options123",
              authorizationRequestUrl:
                "openid4vp://authorize?request_uri=https%3A%2F%2Fapi.authbound.test%2Frequest%2F123",
              clientToken: "client_token_123",
              expiresAt: "2026-04-21T10:10:00.000Z",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        if (
          url ===
          "https://api.authbound.test/v1/verifications/vrf_eudi_options123/events/sse"
        ) {
          return new Response(createSseStream(""), {
            status: 200,
            headers: { "Content-Type": "text/event-stream" },
          });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AuthboundProvider
        gatewayUrl="https://api.authbound.test"
        policyId={"pol_authbound_pension_v1" as never}
        publishableKey="pk_test_public123"
        sessionMode="manual"
      >
        <AutoStartEudiVerificationHook />
      </AuthboundProvider>
    );

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input]) => String(input) === "/api/authbound/verification"
        )
      ).toBe(true);
    });
    const verificationCall = fetchMock.mock.calls.find(
      ([input]) => String(input) === "/api/authbound/verification"
    );
    const body = JSON.parse(String(verificationCall?.[1]?.body));

    expect(body).toMatchObject({
      provider: "eudi",
    });
    expect(body).not.toHaveProperty("providerOptions");
  });
});
