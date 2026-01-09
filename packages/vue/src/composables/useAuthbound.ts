/**
 * useAuthbound - Access Authbound context.
 */

import { inject } from "vue";
import { AuthboundKey, type AuthboundContext } from "../plugin";

/**
 * Access Authbound context.
 *
 * @throws Error if used outside AuthboundPlugin
 *
 * @example
 * ```vue
 * <script setup>
 * const { client, session, isReady } = useAuthbound();
 * </script>
 * ```
 */
export function useAuthbound(): AuthboundContext {
  const context = inject(AuthboundKey);

  if (!context) {
    throw new Error(
      "useAuthbound must be used in a component that is a descendant of an app using AuthboundPlugin. " +
        "Make sure to call app.use(AuthboundPlugin, { publishableKey: '...' }) in your main.ts."
    );
  }

  return context;
}

/**
 * Access Authbound context, returning null if not available.
 *
 * Useful for components that should work with or without the plugin.
 */
export function useAuthboundOptional(): AuthboundContext | null {
  return inject(AuthboundKey, null);
}
