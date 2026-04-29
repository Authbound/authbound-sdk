import { describe, expect, it, vi } from "vitest";

const runtimeConfig = vi.hoisted(() => ({
  current: {
    authbound: {},
    public: { authbound: {} },
  },
}));

vi.mock("nuxt/app", () => ({
  useRuntimeConfig: () => runtimeConfig.current,
}));

vi.mock("@authbound/server", () => ({
  verifyToken: vi.fn(),
}));

import middleware from "../runtime/server/middleware";

function createEvent(path: string, cookie?: string) {
  const headers: Record<string, string> = {
    host: "example.test",
  };
  if (cookie) {
    headers.cookie = cookie;
  }

  const responseHeaders = new Map<string, string>();

  return {
    context: {},
    handled: false,
    method: "GET",
    path,
    node: {
      req: {
        connection: {},
        headers,
        method: "GET",
        originalUrl: path,
        url: path,
      },
      res: {
        body: undefined as string | undefined,
        statusCode: 200,
        getHeader(name: string) {
          return responseHeaders.get(name.toLowerCase());
        },
        setHeader(name: string, value: string) {
          responseHeaders.set(name.toLowerCase(), value);
        },
        end(body: string) {
          this.body = body;
        },
      },
    },
  };
}

describe("authbound Nuxt middleware", () => {
  it("does not allow a protected route when a cookie is present but no session secret is configured", async () => {
    runtimeConfig.current = {
      authbound: {
        cookieName: "authbound_session",
        middleware: true,
        protectedRoutes: ["/dashboard"],
        publicRoutes: [],
      },
      public: {
        authbound: {
          debug: false,
          verifyPath: "/verify",
        },
      },
    };

    const event = createEvent("/dashboard", "authbound_session=forged");

    await middleware(event as never);

    expect(event.node.res.statusCode).toBe(302);
    expect(event.node.res.getHeader("location")).toBe(
      "http://example.test/verify?returnTo=%2Fdashboard"
    );
  });
});
