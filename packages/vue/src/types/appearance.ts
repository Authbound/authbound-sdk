/**
 * Authbound Vue Appearance Types.
 *
 * Mirrors React appearance API for consistent DX.
 */

import type { CSSProperties } from "vue";

// ============================================================================
// Theme Variables
// ============================================================================

/**
 * CSS variable configuration.
 */
export interface AuthboundVariables {
  // Colors
  colorPrimary?: string;
  colorPrimaryHover?: string;
  colorSuccess?: string;
  colorError?: string;
  colorWarning?: string;
  colorBackground?: string;
  colorForeground?: string;
  colorMuted?: string;
  colorMutedForeground?: string;
  colorBorder?: string;

  // Typography
  fontFamily?: string;
  fontSizeBase?: string;
  fontSizeSm?: string;
  fontSizeLg?: string;
  fontWeightNormal?: string;
  fontWeightMedium?: string;
  fontWeightBold?: string;

  // Spacing
  space1?: string;
  space2?: string;
  space3?: string;
  space4?: string;
  space6?: string;
  space8?: string;

  // Border radius
  radiusSm?: string;
  radiusMd?: string;
  radiusLg?: string;
  radiusFull?: string;

  // Component-specific
  qrSize?: string;
  cardPadding?: string;
  buttonHeight?: string;
}

// ============================================================================
// Element Styling
// ============================================================================

/**
 * Element-specific styling.
 */
export interface AuthboundElements {
  // Container elements
  root?: string | CSSProperties;
  card?: string | CSSProperties;
  header?: string | CSSProperties;
  footer?: string | CSSProperties;

  // QR code
  qrCodeContainer?: string | CSSProperties;
  qrCode?: string | CSSProperties;

  // Buttons
  primaryButton?: string | CSSProperties;
  secondaryButton?: string | CSSProperties;
  linkButton?: string | CSSProperties;

  // Status
  statusBadge?: string | CSSProperties;
  statusIcon?: string | CSSProperties;
  statusText?: string | CSSProperties;

  // Typography
  title?: string | CSSProperties;
  subtitle?: string | CSSProperties;
  description?: string | CSSProperties;

  // Utility
  divider?: string | CSSProperties;
  spinner?: string | CSSProperties;
}

// ============================================================================
// Layout Options
// ============================================================================

/**
 * Layout configuration.
 */
export interface AuthboundLayout {
  /** Logo image URL */
  logoImageUrl?: string;
  /** Logo alt text */
  logoAlt?: string;
  /** Logo link URL */
  logoLinkUrl?: string;
  /** Whether to show "Powered by Authbound" branding */
  showAuthboundBranding?: boolean;
  /** Social proof text (e.g., "Trusted by 1M+ users") */
  socialProof?: string;
  /** Terms of service URL */
  termsUrl?: string;
  /** Privacy policy URL */
  privacyUrl?: string;
  /** Help/support URL */
  helpUrl?: string;
}

// ============================================================================
// Main Appearance Type
// ============================================================================

/**
 * Full appearance configuration.
 */
export interface AuthboundAppearance {
  /** Base theme */
  baseTheme?: "light" | "dark" | "auto";
  /** CSS variable overrides */
  variables?: AuthboundVariables;
  /** Element-specific styling */
  elements?: AuthboundElements;
  /** Layout options */
  layout?: AuthboundLayout;
}

// ============================================================================
// Default Values
// ============================================================================

export const DEFAULT_VARIABLES: Required<AuthboundVariables> = {
  // Colors (light theme)
  colorPrimary: "#0058cc",
  colorPrimaryHover: "#0047a8",
  colorSuccess: "#16794f",
  colorError: "#b3261e",
  colorWarning: "#f59e0b",
  colorBackground: "#ffffff",
  colorForeground: "#1a1a1a",
  colorMuted: "#f5f5f5",
  colorMutedForeground: "#737373",
  colorBorder: "#e5e5e5",

  // Typography
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  fontSizeBase: "1rem",
  fontSizeSm: "0.875rem",
  fontSizeLg: "1.125rem",
  fontWeightNormal: "400",
  fontWeightMedium: "500",
  fontWeightBold: "600",

  // Spacing
  space1: "0.25rem",
  space2: "0.5rem",
  space3: "0.75rem",
  space4: "1rem",
  space6: "1.5rem",
  space8: "2rem",

  // Border radius
  radiusSm: "0.25rem",
  radiusMd: "0.5rem",
  radiusLg: "0.75rem",
  radiusFull: "9999px",

  // Component-specific
  qrSize: "256px",
  cardPadding: "1.5rem",
  buttonHeight: "2.5rem",
};

export const DARK_THEME_VARIABLES: Partial<AuthboundVariables> = {
  colorBackground: "#0a0a0a",
  colorForeground: "#fafafa",
  colorMuted: "#262626",
  colorMutedForeground: "#a3a3a3",
  colorBorder: "#404040",
  colorPrimary: "#3b82f6",
  colorPrimaryHover: "#60a5fa",
};

// ============================================================================
// Utilities
// ============================================================================

/**
 * Convert variables to CSS custom properties.
 */
export function variablesToCSSProperties(
  vars: Partial<AuthboundVariables>
): Record<string, string> {
  const cssVars: Record<string, string> = {};

  const mapping: Record<keyof AuthboundVariables, string> = {
    colorPrimary: "--ab-color-primary",
    colorPrimaryHover: "--ab-color-primary-hover",
    colorSuccess: "--ab-color-success",
    colorError: "--ab-color-error",
    colorWarning: "--ab-color-warning",
    colorBackground: "--ab-color-background",
    colorForeground: "--ab-color-foreground",
    colorMuted: "--ab-color-muted",
    colorMutedForeground: "--ab-color-muted-foreground",
    colorBorder: "--ab-color-border",
    fontFamily: "--ab-font-family",
    fontSizeBase: "--ab-font-size-base",
    fontSizeSm: "--ab-font-size-sm",
    fontSizeLg: "--ab-font-size-lg",
    fontWeightNormal: "--ab-font-weight-normal",
    fontWeightMedium: "--ab-font-weight-medium",
    fontWeightBold: "--ab-font-weight-bold",
    space1: "--ab-space-1",
    space2: "--ab-space-2",
    space3: "--ab-space-3",
    space4: "--ab-space-4",
    space6: "--ab-space-6",
    space8: "--ab-space-8",
    radiusSm: "--ab-radius-sm",
    radiusMd: "--ab-radius-md",
    radiusLg: "--ab-radius-lg",
    radiusFull: "--ab-radius-full",
    qrSize: "--ab-qr-size",
    cardPadding: "--ab-card-padding",
    buttonHeight: "--ab-button-height",
  };

  for (const [key, value] of Object.entries(vars)) {
    if (value !== undefined && key in mapping) {
      cssVars[mapping[key as keyof AuthboundVariables]] = value;
    }
  }

  return cssVars;
}

/**
 * Merge appearance configs.
 */
export function mergeAppearance(
  base: AuthboundAppearance,
  override: AuthboundAppearance
): AuthboundAppearance {
  return {
    baseTheme: override.baseTheme ?? base.baseTheme,
    variables: { ...base.variables, ...override.variables },
    elements: { ...base.elements, ...override.elements },
    layout: { ...base.layout, ...override.layout },
  };
}
