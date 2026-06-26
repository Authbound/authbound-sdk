// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, onMounted, ref } from "vue";
import { DeepLinkButton } from "../components/DeepLinkButton";
import { AuthboundPlugin } from "../plugin";
import { useVerification } from "./useVerification";

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

async function waitForExpectation(assertion: () => void): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await nextTick();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  throw lastError;
}

const RequestBlobDeepLink = defineComponent({
  name: "RequestBlobDeepLink",

  setup() {
    const verification = useVerification();
    const didStart = ref(false);

    onMounted(() => {
      if (didStart.value) {
        return;
      }
      didStart.value = true;
      verification.startVerification();
    });

    return () => {
      const walletHandoffKind = verification.walletHandoffKind.value;

      return h("div", [
        h(
          "span",
          { "data-testid": "wallet-handoff-kind" },
          walletHandoffKind ?? "missing"
        ),
        verification.authorizationRequestUrl.value
          ? h(
              DeepLinkButton,
              {
                authorizationRequestUrl:
                  verification.authorizationRequestUrl.value,
                deepLink: verification.deepLink.value ?? undefined,
                showOnDesktop: true,
                walletHandoffKind: walletHandoffKind ?? undefined,
              },
              { default: () => "Open in Wallet" }
            )
          : null,
      ]);
    };
  },
});

const EudiProviderOptionsVerification = defineComponent({
  name: "EudiProviderOptionsVerification",

  setup() {
    const verification = useVerification({
      provider: "eudi",
    });
    const didStart = ref(false);

    onMounted(() => {
      if (didStart.value) {
        return;
      }
      didStart.value = true;
      verification.startVerification();
    });

    return () => h("div");
  },
});

describe("useVerification", () => {
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

    const host = document.createElement("div");
    const app = createApp(RequestBlobDeepLink);
    app.use(AuthboundPlugin, {
      gatewayUrl: "https://api.authbound.test",
      policyId: "pol_authbound_pension_v1" as never,
      publishableKey: "pk_test_public123",
      sessionMode: "manual",
    });
    app.mount(host);

    await waitForExpectation(() => {
      expect(
        host.querySelector('[data-testid="wallet-handoff-kind"]')?.textContent
      ).toBe("request_blob");
    });
    expect(host.querySelector("button")).toBeNull();

    app.unmount();
    vi.unstubAllGlobals();
  });

  it("does not forward browser provider options to the verification endpoint", async () => {
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

    const host = document.createElement("div");
    const app = createApp(EudiProviderOptionsVerification);
    app.use(AuthboundPlugin, {
      gatewayUrl: "https://api.authbound.test",
      policyId: "pol_authbound_pension_v1" as never,
      publishableKey: "pk_test_public123",
      sessionMode: "manual",
    });
    app.mount(host);

    await waitForExpectation(() => {
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

    app.unmount();
    vi.unstubAllGlobals();
  });
});
