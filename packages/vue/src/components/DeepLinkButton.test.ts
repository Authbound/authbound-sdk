// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { createApp, nextTick } from "vue";
import { DeepLinkButton } from "./DeepLinkButton";

describe("DeepLinkButton", () => {
  it("does not render a synthesized deep-link action for request_blob QR payloads", async () => {
    const host = document.createElement("div");
    const app = createApp(DeepLinkButton, {
      authorizationRequestUrl: "eyJ0eXAiOiJvcGVuaWQ0dnAifQ",
      showOnDesktop: true,
      walletHandoffKind: "request_blob",
    });

    app.mount(host);
    await nextTick();
    await nextTick();

    expect(host.querySelector("button")).toBeNull();
    app.unmount();
  });
});
