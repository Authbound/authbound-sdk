/**
 * Client exports.
 */

export {
  type AuthboundClientConfig,
  DEFAULT_CONFIG,
  getConfigFromEnv,
  type ResolvedConfig,
  resolveConfig,
} from "./config";
export {
  type AuthboundClient,
  configure,
  createClient,
  getClient,
  isConfigured,
} from "./factory";

export {
  createHttpClient,
  createVerificationClient,
  type HttpClient,
  type HttpResponse,
  type RequestOptions,
  type VerificationClient,
} from "./http";
