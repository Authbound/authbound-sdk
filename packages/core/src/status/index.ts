/**
 * Status subscription exports.
 */

export {
  createStatusSubscription,
  isSSESupported,
  MAX_BUFFER_SIZE,
  type SSESubscriptionOptions,
} from "./sse";

export {
  createPollingSubscription,
  pollOnce,
  DEFAULT_POLLING_CONFIG,
  type PollingConfig,
  type PollingSubscriptionOptions,
} from "./polling";
