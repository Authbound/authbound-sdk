import { describe, expect, it, vi } from "vitest";

vi.mock("@nuxt/kit", () => ({
  addComponent: vi.fn(),
  addImports: vi.fn(),
  addPlugin: vi.fn(),
  addServerHandler: vi.fn(),
  createResolver: () => ({ resolve: (path: string) => path }),
  defineNuxtModule: (definition: unknown) => definition,
}));

import authboundModule from "../module";

type ModuleSetup = (
  options: Record<string, unknown>,
  nuxt: {
    options: {
      build: { transpile: string[] };
      runtimeConfig: {
        authbound?: Record<string, unknown>;
        public: { authbound?: Record<string, unknown> };
      };
      vite: { optimizeDeps?: { include?: string[] } };
    };
  }
) => void;

const setup = (authboundModule as unknown as { setup: ModuleSetup }).setup;

function createNuxt(include: string[] = []) {
  return {
    options: {
      build: { transpile: [] as string[] },
      runtimeConfig: {
        authbound: {},
        public: { authbound: {} },
      },
      vite: { optimizeDeps: { include } },
    },
  };
}

describe("Authbound Nuxt module", () => {
  it("pre-bundles qrcode while preserving consumer optimize dependencies", () => {
    const nuxt = createNuxt(["consumer-dependency"]);

    setup({}, nuxt);

    expect(nuxt.options.vite.optimizeDeps.include).toEqual([
      "consumer-dependency",
      "@authbound/vue > qrcode",
    ]);
  });

  it("does not duplicate an existing qrcode optimizer entry", () => {
    const nuxt = createNuxt(["@authbound/vue > qrcode"]);

    setup({}, nuxt);

    expect(nuxt.options.vite.optimizeDeps.include).toEqual([
      "@authbound/vue > qrcode",
    ]);
  });

  it("omits an unset provider from serialized runtime config", () => {
    const nuxt = createNuxt();

    setup({}, nuxt);

    expect(nuxt.options.runtimeConfig.authbound).not.toHaveProperty("provider");
  });
});
