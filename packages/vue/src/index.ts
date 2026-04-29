/**
 * @authbound/vue
 *
 * Vue 3 SDK for Authbound EUDI wallet verification.
 *
 * @example
 * ```ts
 * // main.ts
 * import { createApp } from 'vue';
 * import { asPolicyId, AuthboundPlugin } from '@authbound/vue';
 * import App from './App.vue';
 *
 * const policyId = asPolicyId(import.meta.env.VITE_AUTHBOUND_POLICY_ID);
 * const app = createApp(App);
 *
 * app.use(AuthboundPlugin, {
 *   publishableKey: import.meta.env.VITE_AUTHBOUND_PK,
 *   policyId,
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
  type AuthboundContext,
  AuthboundKey,
  AuthboundPlugin,
  type AuthboundPluginOptions,
  type VerificationState,
} from "./plugin";

// ============================================================================
// Composables
// ============================================================================

export { useAuthbound, useAuthboundOptional } from "./composables/useAuthbound";

export {
  type UseVerificationOptions,
  type UseVerificationReturn,
  useVerification,
} from "./composables/useVerification";

// ============================================================================
// Components
// ============================================================================

export {
  DeepLinkButton,
  type DeepLinkButtonProps,
} from "./components/DeepLinkButton";
export {
  QRCode,
  type QRCodeProps,
  QRCodeWithLoading,
  type QRCodeWithLoadingProps,
} from "./components/QRCode";
export {
  StatusBadge,
  type StatusBadgeProps,
  VerificationStatus,
  type VerificationStatusProps,
} from "./components/VerificationStatus";
export {
  VerificationWall,
  type VerificationWallProps,
} from "./components/VerificationWall";

// ============================================================================
// Appearance Types
// ============================================================================

export {
  type AuthboundAppearance,
  type AuthboundElements,
  type AuthboundLayout,
  type AuthboundVariables,
  DARK_THEME_VARIABLES,
  DEFAULT_VARIABLES,
  mergeAppearance,
  variablesToCSSProperties,
} from "./types/appearance";

// ============================================================================
// Re-exports from @authbound/core
// ============================================================================

export {
  // Error handling
  AuthboundError,
  type AuthboundErrorCode,
  asPolicyId,
  type EudiVerificationStatus,
  isAuthboundError,
  // Utilities
  isTerminalStatus,
  // Types
  type PolicyId,
  // Policy presets
  PolicyPresets,
  type PublishableKey,
  type StatusEvent,
  type VerificationClaims,
  type VerificationId,
  type VerificationResult,
} from "@authbound/core";
