/**
 * @authbound/vue
 *
 * Vue 3 SDK for Authbound EUDI wallet verification.
 *
 * @example
 * ```ts
 * // main.ts
 * import { createApp } from 'vue';
 * import { AuthboundPlugin } from '@authbound/vue';
 * import App from './App.vue';
 *
 * const app = createApp(App);
 *
 * app.use(AuthboundPlugin, {
 *   publishableKey: import.meta.env.VITE_AUTHBOUND_PK,
 *   policyId: 'age-gate-18@1.0.0',
 * });
 *
 * app.mount('#app');
 * ```
 *
 * @example
 * ```vue
 * <script setup>
 * import { useVerification, VerificationWall } from '@authbound/vue';
 *
 * const { status, startVerification, authorizationRequestUrl } = useVerification();
 * </script>
 *
 * <template>
 *   <VerificationWall>
 *     <ProtectedContent />
 *   </VerificationWall>
 * </template>
 * ```
 */

// ============================================================================
// Plugin
// ============================================================================

export {
  AuthboundPlugin,
  AuthboundKey,
  type AuthboundPluginOptions,
  type AuthboundContext,
  type VerificationSession,
} from "./plugin";

// ============================================================================
// Composables
// ============================================================================

export { useAuthbound, useAuthboundOptional } from "./composables/useAuthbound";

export {
  useVerification,
  type UseVerificationOptions,
  type UseVerificationReturn,
} from "./composables/useVerification";

// ============================================================================
// Components
// ============================================================================

export {
  QRCode,
  QRCodeWithLoading,
  type QRCodeProps,
  type QRCodeWithLoadingProps,
} from "./components/QRCode";

export {
  VerificationStatus,
  StatusBadge,
  type VerificationStatusProps,
  type StatusBadgeProps,
} from "./components/VerificationStatus";

export {
  VerificationWall,
  type VerificationWallProps,
} from "./components/VerificationWall";

export {
  DeepLinkButton,
  type DeepLinkButtonProps,
} from "./components/DeepLinkButton";

// ============================================================================
// Appearance Types
// ============================================================================

export {
  type AuthboundAppearance,
  type AuthboundVariables,
  type AuthboundElements,
  type AuthboundLayout,
  DEFAULT_VARIABLES,
  DARK_THEME_VARIABLES,
  variablesToCSSProperties,
  mergeAppearance,
} from "./types/appearance";

// ============================================================================
// Re-exports from @authbound/core
// ============================================================================

export {
  // Types
  type PolicyId,
  type SessionId,
  type PublishableKey,
  type EudiVerificationStatus,
  type VerificationResult,
  type VerificationClaims,
  type StatusEvent,
  // Error handling
  AuthboundError,
  type AuthboundErrorCode,
  isAuthboundError,
  // Policy presets
  PolicyPresets,
  // Utilities
  isTerminalStatus,
} from "@authbound/core";
