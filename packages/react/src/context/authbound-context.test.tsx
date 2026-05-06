// @vitest-environment happy-dom

import { render, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
          createSseStream(
            'event: status\ndata: {"status":"verified","result":{"verified":true}}\n\n'
          ),
          { status: 200, headers: { "Content-Type": "text/event-stream" } }
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
          createSseStream(
            'event: status\ndata: {"status":"verified","result":{"verified":true}}\n\n'
          ),
          { status: 200, headers: { "Content-Type": "text/event-stream" } }
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
        <AutoStartVerification onVerified={onVerified} />
      </AuthboundProvider>
    );

    await waitFor(() => {
      expect(onVerified).toHaveBeenCalledTimes(1);
    });
    expect(
      fetchMock.mock.calls.filter(
        ([input]) => String(input) === "/api/authbound/session"
      )
    ).toHaveLength(0);
  });
});
