// @vitest-environment happy-dom

import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DeepLinkButton } from "./deep-link-button";

describe("DeepLinkButton", () => {
  it("does not render a synthesized deep-link action for request_blob QR payloads", async () => {
    render(
      <DeepLinkButton
        authorizationRequestUrl="eyJ0eXAiOiJvcGVuaWQ0dnAifQ"
        showOnDesktop
        walletHandoffKind="request_blob"
      >
        Open in Wallet
      </DeepLinkButton>
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.queryByRole("button", { name: "Open in Wallet" })).toBeNull();
  });
});
