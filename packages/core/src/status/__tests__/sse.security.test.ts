/**
 * Security tests for SSE buffer overflow protection.
 *
 * Target: createStatusSubscription() in sse.ts:167-173
 * Purpose: Prevent memory exhaustion from malicious servers sending
 *          unbounded data without proper SSE event delimiters (\n\n)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedConfig } from "../../client/config";
import { asClientToken, asSessionId } from "../../types/branded";
import { AuthboundError } from "../../types/errors";
import type { StatusEvent } from "../../types/verification";
import { createStatusSubscription, MAX_BUFFER_SIZE } from "../sse";

// Test fixtures
const TEST_CONFIG: ResolvedConfig = {
  gatewayUrl: "https://gateway.authbound.test",
  publishableKey: "pk_test_123" as any,
  debug: false,
};

const TEST_SESSION_ID = asSessionId("ses_test123");
const TEST_CLIENT_TOKEN = asClientToken("token_test123");

/**
 * Create a mock ReadableStream that emits specified chunks.
 */
function createMockStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;

  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]));
        index++;
      } else {
        controller.close();
      }
    },
  });
}

describe("createStatusSubscription - Buffer Overflow Protection", () => {
  let cleanup: (() => void) | null;
  let errors: AuthboundError[];
  let events: StatusEvent[];

  beforeEach(() => {
    cleanup = null;
    errors = [];
    events = [];
  });

  afterEach(() => {
    if (cleanup) cleanup();
    vi.restoreAllMocks();
  });

  describe("Overflow Prevention", () => {
    it("throws when single chunk exceeds 64KB without delimiters", async () => {
      // Create a chunk larger than MAX_BUFFER_SIZE without any \n\n delimiter
      const hugeChunk = "data: " + "a".repeat(MAX_BUFFER_SIZE + 1000);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: createMockStream([hugeChunk]),
      });

      cleanup = createStatusSubscription(
        TEST_CONFIG,
        TEST_SESSION_ID,
        TEST_CLIENT_TOKEN,
        (event) => events.push(event),
        {
          onError: (error) => errors.push(error),
          autoReconnect: false, // Don't retry on error
        }
      );

      // Wait for stream processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toContain("buffer overflow");
    });

    it("throws when cumulative chunks exceed 64KB without delimiters", async () => {
      // Send many small chunks that accumulate to exceed buffer
      const chunkSize = 10 * 1024; // 10KB each
      const numChunks = 8; // Total 80KB > 64KB
      const chunks = Array(numChunks).fill("data: " + "a".repeat(chunkSize));

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: createMockStream(chunks),
      });

      cleanup = createStatusSubscription(
        TEST_CONFIG,
        TEST_SESSION_ID,
        TEST_CLIENT_TOKEN,
        (event) => events.push(event),
        {
          onError: (error) => errors.push(error),
          autoReconnect: false,
        }
      );

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toContain("buffer overflow");
    });

    it("throws at exact boundary (64KB + 1 byte)", async () => {
      // Exactly at the limit + 1
      const chunk = "data: " + "a".repeat(MAX_BUFFER_SIZE - 5); // -5 for "data: "

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: createMockStream([chunk]),
      });

      cleanup = createStatusSubscription(
        TEST_CONFIG,
        TEST_SESSION_ID,
        TEST_CLIENT_TOKEN,
        (event) => events.push(event),
        {
          onError: (error) => errors.push(error),
          autoReconnect: false,
        }
      );

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].code).toBe("network_error");
    });
  });

  describe("Normal Operation", () => {
    it("processes large data with proper delimiters (buffer clears)", async () => {
      // Large chunks but with proper \n\n delimiters that clear the buffer
      const chunk1 = 'event: status\ndata: {"status":"pending"}\n\n';
      const chunk2 = 'event: status\ndata: {"status":"processing"}\n\n';

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: createMockStream([chunk1, chunk2]),
      });

      cleanup = createStatusSubscription(
        TEST_CONFIG,
        TEST_SESSION_ID,
        TEST_CLIENT_TOKEN,
        (event) => events.push(event),
        {
          onError: (error) => errors.push(error),
          autoReconnect: false,
        }
      );

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should not error - delimiters clear the buffer
      expect(errors.length).toBe(0);
      expect(events.length).toBeGreaterThan(0);
    });

    it("handles data under the limit without errors", async () => {
      // Just under the limit
      const safeSize = MAX_BUFFER_SIZE - 1000;
      const chunk =
        'data: {"status":"pending","payload":"' +
        "a".repeat(safeSize) +
        '"}\n\n';

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: createMockStream([chunk]),
      });

      cleanup = createStatusSubscription(
        TEST_CONFIG,
        TEST_SESSION_ID,
        TEST_CLIENT_TOKEN,
        (event) => events.push(event),
        {
          onError: (error) => errors.push(error),
          autoReconnect: false,
        }
      );

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should not error
      expect(errors.filter((e) => e.message.includes("overflow")).length).toBe(
        0
      );
    });

    it("clears buffer when complete events are received", async () => {
      // Send multiple events - buffer should clear after each \n\n
      const events_data: string[] = [];
      for (let i = 0; i < 20; i++) {
        events_data.push(
          `event: status\ndata: {"status":"pending","i":${i}}\n\n`
        );
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: createMockStream(events_data),
      });

      cleanup = createStatusSubscription(
        TEST_CONFIG,
        TEST_SESSION_ID,
        TEST_CLIENT_TOKEN,
        (event) => events.push(event),
        {
          onError: (error) => errors.push(error),
          autoReconnect: false,
        }
      );

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should process many events without overflow (buffer clears)
      expect(errors.filter((e) => e.message.includes("overflow")).length).toBe(
        0
      );
      expect(events.length).toBeGreaterThan(0);
    });
  });

  describe("Error Details", () => {
    it("returns AuthboundError with network_error code", async () => {
      const hugeChunk = "a".repeat(MAX_BUFFER_SIZE + 100);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: createMockStream([hugeChunk]),
      });

      cleanup = createStatusSubscription(
        TEST_CONFIG,
        TEST_SESSION_ID,
        TEST_CLIENT_TOKEN,
        () => {},
        {
          onError: (error) => errors.push(error),
          autoReconnect: false,
        }
      );

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(errors[0]).toBeInstanceOf(AuthboundError);
      expect(errors[0].code).toBe("network_error");
    });
  });
});
