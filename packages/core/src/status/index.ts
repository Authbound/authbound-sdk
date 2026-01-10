/**
 * Status subscription exports.
 */

export {
  createPollingSubscription,
  DEFAULT_POLLING_CONFIG,
  type PollingConfig,
  type PollingSubscriptionOptions,
  pollOnce,
} from "./polling";
export {
  createStatusSubscription,
  isSSESupported,
  MAX_BUFFER_SIZE,
  type SSESubscriptionOptions,
} from "./sse";
