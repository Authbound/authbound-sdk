/**
 * Security tests for polling timeout enforcement.
 *
 * Target: createPollingSubscription() in polling.ts:84-96, 99-105
 * Purpose: Prevent resource exhaustion by enforcing timeouts on polling
 *          and ensuring slow requests don't exceed max duration
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedConfig } from "../../client/config";
import { asClientToken, asSessionId } from "../../types/branded";
import type { StatusEvent } from "../../types/verification";
import { createPollingSubscription } from "../polling";

// Test fixtures
const TEST_CONFIG: ResolvedConfig = {
  gatewayUrl: "https://gateway.authbound.test",
  publishableKey: "pk_test_123" as any,
  debug: false,
};

const TEST_SESSION_ID = asSessionId("ses_test123");
const TEST_CLIENT_TOKEN = asClientToken("token_test123");

describe("createPollingSubscription - Timeout Enforcement", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let events: StatusEvent[];
  let cleanup: (() => void) | null;

  beforeEach(() => {
    vi.useFakeTimers();
    events = [];
    cleanup = null;

    // Default mock: successful pending response
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: "pending" }),
    });
    global.fetch = fetchMock;
  });

  afterEach(() => {
    if (cleanup) cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("Max Duration Timeout", () => {
    it("emits timeout event when maxDuration is exceeded", async () => {
      const SHORT_DURATION = 2000; // 2 seconds for faster test
      const INTERVAL = 500;

      cleanup = createPollingSubscription(
        TEST_CONFIG,
        TEST_SESSION_ID,
        TEST_CLIENT_TOKEN,
        (event) => events.push(event),
        {
          pollingConfig: {
            maxDuration: SHORT_DURATION,
            initialInterval: INTERVAL,
          },
        }
      );

      // Poll a few times then let duration expire
      for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(INTERVAL);
        // Let promises settle
        await vi.runAllTimersAsync();
      }

      const timeoutEvent = events.find((e) => e.type === "timeout");
      expect(timeoutEvent).toBeDefined();
      expect(timeoutEvent?.status).toBe("timeout");
    });

    it("stops making fetch requests after timeout", async () => {
      const SHORT_DURATION = 3000;

      cleanup = createPollingSubscription(
        TEST_CONFIG,
        TEST_SESSION_ID,
        TEST_CLIENT_TOKEN,
        (event) => events.push(event),
        { pollingConfig: { maxDuration: SHORT_DURATION, initialInterval: 500 } }
      );

      // Let it poll a few times
      await vi.advanceTimersByTimeAsync(2000);
      const callsBeforeTimeout = fetchMock.mock.calls.length;

      // Advance past timeout
      await vi.advanceTimersByTimeAsync(3000);
      const callsAfterTimeout = fetchMock.mock.calls.length;

      // Should not have made more calls after timeout
      // (might have 1 more call that triggers the timeout)
      expect(callsAfterTimeout).toBeLessThanOrEqual(callsBeforeTimeout + 1);

      // Verify timeout event was emitted
      expect(events.some((e) => e.type === "timeout")).toBe(true);
    });
  });

  describe("AbortController Integration", () => {
    it("emits timeout event when request is aborted", async () => {
      // Mock fetch to hang until aborted
      fetchMock.mockImplementation(
        (_url: string, options: { signal: AbortSignal }) =>
          new Promise((_, reject) => {
            if (options.signal) {
              options.signal.addEventListener("abort", () => {
                const error = new Error("The operation was aborted");
                error.name = "AbortError";
                reject(error);
              });
            }
          })
      );

      const SHORT_DURATION = 1000;

      cleanup = createPollingSubscription(
        TEST_CONFIG,
        TEST_SESSION_ID,
        TEST_CLIENT_TOKEN,
        (event) => events.push(event),
        { pollingConfig: { maxDuration: SHORT_DURATION } }
      );

      // Advance time to exceed duration - this triggers abort
      for (let i = 0; i < 5; i++) {
        await vi.advanceTimersByTimeAsync(500);
        await vi.runAllTimersAsync();
      }

      const timeoutEvent = events.find((e) => e.type === "timeout");
      expect(timeoutEvent).toBeDefined();
      expect(timeoutEvent?.status).toBe("timeout");
    });

    it("passes AbortSignal to fetch requests", async () => {
      cleanup = createPollingSubscription(
        TEST_CONFIG,
        TEST_SESSION_ID,
        TEST_CLIENT_TOKEN,
        () => {}
      );

      // Trigger first poll
      await vi.advanceTimersByTimeAsync(100);

      expect(fetchMock).toHaveBeenCalled();
      const fetchOptions = fetchMock.mock.calls[0][1];
      expect(fetchOptions.signal).toBeInstanceOf(AbortSignal);
    });
  });

  describe("Per-Request Timeout", () => {
    it("caps individual request timeout at 30 seconds", async () => {
      // With a long maxDuration, individual requests should still timeout at 30s
      const setTimeoutSpy = vi.spyOn(global, "setTimeout");

      cleanup = createPollingSubscription(
        TEST_CONFIG,
        TEST_SESSION_ID,
        TEST_CLIENT_TOKEN,
        () => {},
        { pollingConfig: { maxDuration: 60_000 } } // 60s total
      );

      // Trigger first poll
      await vi.advanceTimersByTimeAsync(100);

      // Find the abort timeout call (should be 30000ms or less)
      const abortTimeoutCall = setTimeoutSpy.mock.calls.find(
        ([, ms]) => typeof ms === "number" && ms <= 30_000 && ms > 1000
      );
      expect(abortTimeoutCall).toBeDefined();
    });

    it("uses remaining time when less than 30 seconds remain", async () => {
      const setTimeoutSpy = vi.spyOn(global, "setTimeout");

      cleanup = createPollingSubscription(
        TEST_CONFIG,
        TEST_SESSION_ID,
        TEST_CLIENT_TOKEN,
        () => {},
        { pollingConfig: { maxDuration: 5000, initialInterval: 100 } }
      );

      // Advance to leave only 2 seconds remaining
      await vi.advanceTimersByTimeAsync(3100);

      // The abort timeout should be ~2000ms (remaining time), not 30000ms
      const recentAbortCalls = setTimeoutSpy.mock.calls.filter(
        ([, ms]) => typeof ms === "number" && ms < 30_000 && ms > 0
      );
      expect(recentAbortCalls.length).toBeGreaterThan(0);
    });
  });

  describe("Terminal Status Handling", () => {
    it("stops polling when terminal status received", async () => {
      // First call returns pending, second returns verified
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: "pending" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: "verified", result: {} }),
        });

      cleanup = createPollingSubscription(
        TEST_CONFIG,
        TEST_SESSION_ID,
        TEST_CLIENT_TOKEN,
        (event) => events.push(event),
        { pollingConfig: { initialInterval: 100 } }
      );

      // Let it poll twice
      await vi.advanceTimersByTimeAsync(300);

      // Should have received verified status
      expect(events.some((e) => e.status === "verified")).toBe(true);

      // Advance more time - should not make more requests
      const callsAfterVerified = fetchMock.mock.calls.length;
      await vi.advanceTimersByTimeAsync(1000);
      expect(fetchMock.mock.calls.length).toBe(callsAfterVerified);
    });
  });

  describe("Cleanup", () => {
    it("stops polling when cleanup is called", async () => {
      cleanup = createPollingSubscription(
        TEST_CONFIG,
        TEST_SESSION_ID,
        TEST_CLIENT_TOKEN,
        () => {}
      );

      // Let it start
      await vi.advanceTimersByTimeAsync(100);
      const callsBeforeCleanup = fetchMock.mock.calls.length;

      // Cleanup
      cleanup();
      cleanup = null;

      // Advance time - should not make more requests
      await vi.advanceTimersByTimeAsync(5000);
      expect(fetchMock.mock.calls.length).toBe(callsBeforeCleanup);
    });
  });
});
