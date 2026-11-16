export const SANDBOX_API_URL = "https://sandbox.authbound.io";
export const LIVE_API_URL = "https://edge.authbound.io";

/**
 * The Authbound API host that serves a key: test keys (`sk_test_`, `pk_test_`)
 * go to the sandbox, live keys to production.
 */
export function defaultApiUrl(key: string): string {
  return key.startsWith("sk_test_") || key.startsWith("pk_test_")
    ? SANDBOX_API_URL
    : LIVE_API_URL;
}
