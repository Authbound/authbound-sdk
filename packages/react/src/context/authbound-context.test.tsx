// @vitest-environment happy-dom

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  StrictMode,
  Suspense,
  startTransition,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
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

function LayoutStartVerification() {
  const { startVerification } = useAuthbound();
  const didStartRef = useRef(false);

  useLayoutEffect(() => {
    if (didStartRef.current) {
      return;
    }
    didStartRef.current = true;
    startVerification();
  }, [startVerification]);

  return null;
}

function CaptureStartVerification({
  capture,
}: {
  capture: (
    startVerification: ReturnType<typeof useAuthbound>["startVerification"]
  ) => void;
}) {
  capture(useAuthbound().startVerification);
  return null;
}

const interruptedRender = new Promise<never>(() => {});

function SuspendDuringRender({ suspend }: { suspend: boolean }) {
  if (suspend) {
    throw interruptedRender;
  }
  return null;
}

function StartVerificationButton({
  autoStart = false,
}: {
  autoStart?: boolean;
}) {
  const { startVerification, status } = useVerification({ autoStart });

  return (
    <>
      <button onClick={startVerification} type="button">
        Start verification
      </button>
      <span data-testid="verification-status">{status}</span>
    </>
  );
}

function createPendingVerificationResponse() {
  return new Response(
    JSON.stringify({
      verificationId: "vrf_strictmode123",
      authorizationRequestUrl: "openid4vp://authorize",
      clientToken: "client_token_123",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

function createPendingVerificationFetchMock() {
  return vi
    .fn()
    .mockResolvedValueOnce(createPendingVerificationResponse())
    .mockResolvedValueOnce(
      new Response(createSseStream(""), {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      })
    );
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

  it("starts verification after StrictMode replays provider effects", async () => {
    const fetchMock = createPendingVerificationFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    const { unmount } = render(
      <StrictMode>
        <AuthboundProvider
          gatewayUrl="https://api.authbound.test"
          policyId={"pol_authbound_pension_v1" as never}
          publishableKey="pk_test_public123"
          sessionMode="manual"
        >
          <StartVerificationButton />
        </AuthboundProvider>
      </StrictMode>
    );

    fireEvent.click(screen.getByRole("button", { name: "Start verification" }));

    await waitFor(() => {
      expect(screen.getByTestId("verification-status").textContent).toBe(
        "pending"
      );
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.authbound.test/v1/verifications/vrf_strictmode123/events/sse",
        expect.objectContaining({ method: "GET" })
      );
    });
    unmount();
  });

  it("auto-starts verification after StrictMode replays provider effects", async () => {
    let resolveFirstStart: (response: Response) => void = () => {};
    let isFirstStart = true;
    const fetchMock = vi.fn(
      (_input: string | URL | Request, init?: RequestInit) => {
        if (init?.method === "POST") {
          if (!isFirstStart) {
            return Promise.resolve(createPendingVerificationResponse());
          }
          isFirstStart = false;
          return new Promise<Response>((resolve) => {
            resolveFirstStart = resolve;
          });
        }
        return Promise.resolve(
          new Response(createSseStream(""), {
            status: 200,
            headers: { "Content-Type": "text/event-stream" },
          })
        );
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    const { unmount } = render(
      <StrictMode>
        <AuthboundProvider
          gatewayUrl="https://api.authbound.test"
          policyId={"pol_authbound_pension_v1" as never}
          publishableKey="pk_test_public123"
          sessionMode="manual"
        >
          <StartVerificationButton autoStart />
        </AuthboundProvider>
      </StrictMode>
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")
    ).toHaveLength(1);

    resolveFirstStart(createPendingVerificationResponse());

    await waitFor(() => {
      expect(screen.getByTestId("verification-status").textContent).toBe(
        "pending"
      );
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    unmount();
  });

  it("deduplicates concurrent starts from multiple provider consumers", async () => {
    let resolveStart: (response: Response) => void = () => {};
    const fetchMock = vi.fn(
      (_input: string | URL | Request, init?: RequestInit) => {
        if (init?.method === "POST") {
          return new Promise<Response>((resolve) => {
            resolveStart = resolve;
          });
        }
        return Promise.resolve(
          new Response(createSseStream(""), {
            status: 200,
            headers: { "Content-Type": "text/event-stream" },
          })
        );
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    const { unmount } = render(
      <StrictMode>
        <AuthboundProvider
          gatewayUrl="https://api.authbound.test"
          policyId={"pol_authbound_pension_v1" as never}
          publishableKey="pk_test_public123"
          sessionMode="manual"
        >
          <AutoStartVerification />
          <AutoStartVerification />
        </AuthboundProvider>
      </StrictMode>
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")
    ).toHaveLength(1);

    resolveStart(createPendingVerificationResponse());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    unmount();
  });

  it("preserves one-shot verification starts during StrictMode replay", async () => {
    let resolveStart: (response: Response) => void = () => {};
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveStart = resolve;
          })
      )
      .mockResolvedValueOnce(
        new Response(createSseStream(""), {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const { unmount } = render(
      <StrictMode>
        <AuthboundProvider
          gatewayUrl="https://api.authbound.test"
          policyId={"pol_authbound_pension_v1" as never}
          publishableKey="pk_test_public123"
          sessionMode="manual"
        >
          <AutoStartVerificationHook />
        </AuthboundProvider>
      </StrictMode>
    );

    resolveStart(createPendingVerificationResponse());
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.authbound.test/v1/verifications/vrf_strictmode123/events/sse",
        expect.objectContaining({ method: "GET" })
      );
    });
    unmount();
  });

  it("accepts a descendant layout-effect start on initial mount", async () => {
    const fetchMock = createPendingVerificationFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    render(
      <StrictMode>
        <AuthboundProvider
          gatewayUrl="https://api.authbound.test"
          policyId={"pol_authbound_pension_v1" as never}
          publishableKey="pk_test_public123"
          sessionMode="manual"
        >
          <LayoutStartVerification />
        </AuthboundProvider>
      </StrictMode>
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/authbound/verification",
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  it("rejects captured verification starts after provider unmount", async () => {
    let startVerification: ReturnType<
      typeof useAuthbound
    >["startVerification"] = async () => {};
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createPendingVerificationResponse());
    vi.stubGlobal("fetch", fetchMock);

    const { unmount } = render(
      <AuthboundProvider
        gatewayUrl="https://api.authbound.test"
        policyId={"pol_authbound_pension_v1" as never}
        publishableKey="pk_test_public123"
        sessionMode="manual"
      >
        <CaptureStartVerification
          capture={(start) => {
            startVerification = start;
          }}
        />
      </AuthboundProvider>
    );

    unmount();
    await startVerification();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the committed flow active when a replacement render suspends", async () => {
    let latestStart: ReturnType<typeof useAuthbound>["startVerification"] =
      async () => {};
    const fetchMock = createPendingVerificationFetchMock();
    vi.stubGlobal("fetch", fetchMock);
    const tree = (policyId: string, suspend: boolean) => (
      <Suspense fallback={null}>
        <AuthboundProvider
          gatewayUrl="https://api.authbound.test"
          policyId={policyId as never}
          publishableKey="pk_test_public123"
          sessionMode="manual"
        >
          <CaptureStartVerification
            capture={(start) => {
              latestStart = start;
            }}
          />
          <SuspendDuringRender suspend={suspend} />
        </AuthboundProvider>
      </Suspense>
    );
    const { rerender } = render(tree("pol_authbound_pension_v1", false));
    const committedStart = latestStart;

    act(() => {
      startTransition(() =>
        rerender(tree("pol_age_over_18_authbound_v1", true))
      );
    });
    await committedStart();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/authbound/verification",
      expect.objectContaining({
        body: JSON.stringify({ policyId: "pol_authbound_pension_v1" }),
        method: "POST",
      })
    );
  });

  it("accepts a descendant layout start after a committed flow replacement", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createPendingVerificationResponse())
      .mockResolvedValueOnce(
        new Response(createSseStream(""), {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        })
      )
      .mockResolvedValueOnce(createPendingVerificationResponse())
      .mockResolvedValueOnce(
        new Response(createSseStream(""), {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    const tree = (policyId: string) => (
      <AuthboundProvider
        gatewayUrl="https://api.authbound.test"
        policyId={policyId as never}
        publishableKey="pk_test_public123"
        sessionMode="manual"
      >
        <LayoutStartVerification key={policyId} />
      </AuthboundProvider>
    );
    const { rerender } = render(tree("pol_authbound_pension_v1"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    rerender(tree("pol_age_over_18_authbound_v1"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/authbound/verification",
        expect.objectContaining({
          body: JSON.stringify({
            policyId: "pol_age_over_18_authbound_v1",
          }),
          method: "POST",
        })
      );
    });
  });

  it("finalizes the SDK session once when verification is verified", async () => {
    vi.stubGlobal("navigator", {
      locks: {
        request: (_name: string, operation: () => Promise<unknown>) =>
          operation(),
      },
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/authbound/verification") {
        return new Response(
          JSON.stringify({
            verificationId: "vrf_test123",
            authorizationRequestUrl:
              "openid4vp://authorize?request_uri=https%3A%2F%2Fapi.authbound.test%2Frequest%2F123",
            clientToken: "client_token_123",
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
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
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
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
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
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
              expiresAt: new Date(Date.now() + 60_000).toISOString(),
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
