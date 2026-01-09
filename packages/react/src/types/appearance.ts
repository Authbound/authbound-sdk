/**
 * Appearance customization types for Clerk-style theming.
 */

import type { CSSProperties } from "react";

/**
 * CSS variable overrides using --ab-* prefix.
 */
export interface AuthboundVariables {
  /** Primary brand color (buttons, links) */
  colorPrimary?: string;
  /** Success color (verified state) */
  colorSuccess?: string;
  /** Error color (failed state) */
  colorError?: string;
  /** Warning color (timeout approaching) */
  colorWarning?: string;
  /** Background color */
  colorBackground?: string;
  /** Foreground/text color */
  colorForeground?: string;
  /** Muted text color */
  colorMuted?: string;
  /** Border color */
  colorBorder?: string;

  /** Font family */
  fontFamily?: string;
  /** Base font size */
  fontSizeBase?: string;
  /** Small font size */
  fontSizeSmall?: string;
  /** Large font size */
  fontSizeLarge?: string;

  /** Base spacing unit */
  spaceUnit?: string;
  /** Border radius for cards */
  radiusCard?: string;
  /** Border radius for buttons */
  radiusButton?: string;
  /** Border radius for inputs */
  radiusInput?: string;

  /** QR code size */
  qrSize?: string;
  /** Card padding */
  cardPadding?: string;
  /** Card shadow */
  cardShadow?: string;
}

/**
 * Element-specific style overrides.
 */
export interface AuthboundElements {
  /** Root container */
  root?: string | CSSProperties;
  /** Card container */
  card?: string | CSSProperties;
  /** Card header */
  cardHeader?: string | CSSProperties;
  /** Card body */
  cardBody?: string | CSSProperties;
  /** Card footer */
  cardFooter?: string | CSSProperties;
  /** Primary button */
  primaryButton?: string | CSSProperties;
  /** Secondary button */
  secondaryButton?: string | CSSProperties;
  /** Text button/link */
  textButton?: string | CSSProperties;
  /** QR code container */
  qrCodeContainer?: string | CSSProperties;
  /** QR code image */
  qrCodeImage?: string | CSSProperties;
  /** Status indicator */
  statusIndicator?: string | CSSProperties;
  /** Status text */
  statusText?: string | CSSProperties;
  /** Error message */
  errorMessage?: string | CSSProperties;
  /** Timer/countdown */
  timer?: string | CSSProperties;
  /** Deep link button */
  deepLinkButton?: string | CSSProperties;
  /** Loading spinner */
  spinner?: string | CSSProperties;
}

/**
 * Layout customization options.
 */
export interface AuthboundLayout {
  /** Custom logo image URL */
  logoImageUrl?: string;
  /** Logo alt text */
  logoAlt?: string;
  /** Show "Powered by Authbound" branding */
  showAuthboundBranding?: boolean;
  /** Show help link */
  showHelpLink?: boolean;
  /** Help link URL */
  helpLinkUrl?: string;
  /** Animation style */
  animations?: "none" | "subtle" | "full";
}

/**
 * Complete appearance configuration.
 *
 * @example
 * ```tsx
 * <AuthboundProvider
 *   appearance={{
 *     baseTheme: 'dark',
 *     variables: {
 *       colorPrimary: '#6366f1',
 *       radiusCard: '1rem',
 *     },
 *     elements: {
 *       card: 'shadow-xl',
 *       primaryButton: { fontWeight: 600 },
 *     },
 *   }}
 * >
 * ```
 */
export interface AuthboundAppearance {
  /** Base theme preset */
  baseTheme?: "light" | "dark" | "auto";
  /** CSS variable overrides */
  variables?: AuthboundVariables;
  /** Element-specific overrides */
  elements?: AuthboundElements;
  /** Layout options */
  layout?: AuthboundLayout;
}

/**
 * Default CSS variables.
 */
export const DEFAULT_VARIABLES: Required<AuthboundVariables> = {
  colorPrimary: "#0058cc",
  colorSuccess: "#16794f",
  colorError: "#b3261e",
  colorWarning: "#f59e0b",
  colorBackground: "#ffffff",
  colorForeground: "#1a1a1a",
  colorMuted: "#6b7280",
  colorBorder: "#e5e7eb",

  fontFamily: "system-ui, -apple-system, sans-serif",
  fontSizeBase: "1rem",
  fontSizeSmall: "0.875rem",
  fontSizeLarge: "1.125rem",

  spaceUnit: "0.25rem",
  radiusCard: "0.75rem",
  radiusButton: "0.5rem",
  radiusInput: "0.375rem",

  qrSize: "256px",
  cardPadding: "1.5rem",
  cardShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
};

/**
 * Dark theme variable overrides.
 */
export const DARK_THEME_VARIABLES: Partial<AuthboundVariables> = {
  colorBackground: "#0a0a0a",
  colorForeground: "#fafafa",
  colorMuted: "#a1a1aa",
  colorBorder: "#27272a",
  cardShadow: "0 4px 6px -1px rgb(0 0 0 / 0.3), 0 2px 4px -2px rgb(0 0 0 / 0.2)",
};

/**
 * Convert variables to CSS custom properties object.
 */
export function variablesToCSSProperties(
  variables: AuthboundVariables
): Record<string, string> {
  const properties: Record<string, string> = {};

  if (variables.colorPrimary) properties["--ab-color-primary"] = variables.colorPrimary;
  if (variables.colorSuccess) properties["--ab-color-success"] = variables.colorSuccess;
  if (variables.colorError) properties["--ab-color-error"] = variables.colorError;
  if (variables.colorWarning) properties["--ab-color-warning"] = variables.colorWarning;
  if (variables.colorBackground) properties["--ab-color-background"] = variables.colorBackground;
  if (variables.colorForeground) properties["--ab-color-foreground"] = variables.colorForeground;
  if (variables.colorMuted) properties["--ab-color-muted"] = variables.colorMuted;
  if (variables.colorBorder) properties["--ab-color-border"] = variables.colorBorder;

  if (variables.fontFamily) properties["--ab-font-family"] = variables.fontFamily;
  if (variables.fontSizeBase) properties["--ab-font-size-base"] = variables.fontSizeBase;
  if (variables.fontSizeSmall) properties["--ab-font-size-small"] = variables.fontSizeSmall;
  if (variables.fontSizeLarge) properties["--ab-font-size-large"] = variables.fontSizeLarge;

  if (variables.spaceUnit) properties["--ab-space-unit"] = variables.spaceUnit;
  if (variables.radiusCard) properties["--ab-radius-card"] = variables.radiusCard;
  if (variables.radiusButton) properties["--ab-radius-button"] = variables.radiusButton;
  if (variables.radiusInput) properties["--ab-radius-input"] = variables.radiusInput;

  if (variables.qrSize) properties["--ab-qr-size"] = variables.qrSize;
  if (variables.cardPadding) properties["--ab-card-padding"] = variables.cardPadding;
  if (variables.cardShadow) properties["--ab-card-shadow"] = variables.cardShadow;

  return properties;
}

/**
 * Merge appearance configurations.
 */
export function mergeAppearance(
  base: AuthboundAppearance | undefined,
  override: AuthboundAppearance | undefined
): AuthboundAppearance {
  if (!base) return override ?? {};
  if (!override) return base;

  return {
    baseTheme: override.baseTheme ?? base.baseTheme,
    variables: { ...base.variables, ...override.variables },
    elements: { ...base.elements, ...override.elements },
    layout: { ...base.layout, ...override.layout },
  };
}
