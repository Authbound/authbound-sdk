import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AUTHBOUND_API_VERSION,
  AUTHBOUND_CONTRACT_REVISION,
} from "../generated/api-contract";
import { AuthboundClient } from "./client";

const apiKey = `sk_test_${"x".repeat(32)}`;
const apiUrl = "https://api.example.com";

describe("AuthboundClient contract version headers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the generated API version and contract revision on Gateway requests", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        object: "list",
        data: [],
        has_more: false,
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await new AuthboundClient({ apiKey, apiUrl }).verifications.list();

    const [, request] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(request.headers).toMatchObject({
      "Authbound-Api-Version": AUTHBOUND_API_VERSION,
      "Authbound-Contract-Revision": AUTHBOUND_CONTRACT_REVISION,
    });
  });
});
