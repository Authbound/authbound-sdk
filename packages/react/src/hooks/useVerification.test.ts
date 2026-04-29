// @vitest-environment jsdom

import { render, waitFor } from "@testing-library/react";
import type { AuthboundClient } from "@authbound-sdk/core";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { AuthboundContext } from "../context/authbound-context";
import { isVerificationFailureStatus } from "./useVerification";
import { useVerification } from "./useVerification";

describe("useVerification status classification", () => {
  it("treats canceled and expired as terminal failure states", () => {
    expect(isVerificationFailureStatus("failed")).toBe(true);
    expect(isVerificationFailureStatus("error")).toBe(true);
    expect(isVerificationFailureStatus("canceled")).toBe(true);
    expect(isVerificationFailureStatus("expired")).toBe(true);
    expect(isVerificationFailureStatus("timeout")).toBe(true);
    expect(isVerificationFailureStatus("verified")).toBe(false);
    expect(isVerificationFailureStatus("pending")).toBe(false);
  });

  it("calls onVerified when status becomes verified without browser result data", async () => {
    const onVerified = vi.fn();

    function Probe() {
      useVerification({ onVerified });
      return null;
    }

    render(
      React.createElement(
        AuthboundContext.Provider,
        {
          value: {
            client: {
              getDeepLink: () => "authbound://wallet",
              log: () => undefined,
            } as unknown as AuthboundClient,
            isReady: true,
            appearance: {},
            verification: {
              verificationId: "vrf_test123" as never,
              status: "verified",
              authorizationRequestUrl: "https://gateway.authbound.test/request",
              clientToken: "client_token_123",
              expiresAt: new Date(Date.now() + 60_000),
            },
            startVerification: vi.fn(),
            resetVerification: vi.fn(),
            updateVerification: vi.fn(),
          },
        },
        React.createElement(Probe)
      )
    );

    await waitFor(() => {
      expect(onVerified).toHaveBeenCalledWith({
        verificationId: "vrf_test123",
        status: "verified",
      });
    });
  });
});
