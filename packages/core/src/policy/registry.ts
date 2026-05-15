/**
 * Preset Registry
 *
 * Fetches policy presets from the API at runtime and caches them.
 *
 * Cache strategy:
 * - Memory cache: 1 minute TTL (for SSR/edge)
 * - LocalStorage cache: 5 minutes TTL (for browser)
 */

import { isPolicyId, type PolicyId } from "../types/branded";
import { PolicyPresets, PRESET_POLICIES } from "../types/policy";

// ============================================================================
// Types
// ============================================================================

/**
 * Policy preset from the API registry.
 */
export interface PresetFromRegistry {
  /** Preset identifier (e.g., "age_over_18") */
  id: string;
  /** Object type marker */
  object: "policy_preset";
  /** Human-readable name */
  name: string;
  /** Full description */
  description: string;
  /** Short tagline for cards */
  tagline: string | null;
  /** Category for grouping */
  category: string;
  /** Icon name */
  icon: string;
  /** Claims that will be requested (preview) */
  claims_preview: string[];
  /** Required fields */
  required_fields: string[];
  /** Optional fields that can be toggled */
  optional_fields: string[];
  /** Default purpose string */
  default_purpose: string;
  /** Use case tags */
  use_cases: string[];
  /** Whether this is a featured preset */
  is_featured: boolean;
  /** Reference to the underlying policy */
  policy_id: string;
}

/**
 * Response from the preset registry API.
 */
export interface PresetRegistry {
  /** Object type marker */
  object: "preset_registry";
  /** Registry version for cache invalidation */
  version: string;
  /** When the registry was generated */
  generated_at: string;
  /** Available presets */
  presets: PresetFromRegistry[];
}

// ============================================================================
// Cache Configuration
// ============================================================================

const CACHE_KEY = "authbound:preset_registry";
const MEMORY_CACHE_TTL_MS = 60 * 1000; // 1 minute
const STORAGE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** In-memory cache for SSR/edge runtime */
let memoryCache: {
  data: PresetRegistry;
  expiresAt: number;
} | null = null;

// ============================================================================
// Registry Fetching
// ============================================================================

/**
 * Fetch presets from the API with caching.
 *
 * @param gatewayUrl - Base URL of the gateway (e.g., "https://api.authbound.io")
 * @param options - Fetch options
 * @returns The preset registry
 */
export async function fetchPresetRegistry(
  gatewayUrl: string,
  options: {
    /** Force refresh, bypassing cache */
    forceRefresh?: boolean;
    /** Category filter */
    category?: string;
    /** Custom fetch implementation */
    fetch?: typeof globalThis.fetch;
  } = {}
): Promise<PresetRegistry> {
  const { forceRefresh = false, category } = options;
  const fetchFn = options.fetch ?? globalThis.fetch;

  // Check memory cache first (for SSR)
  if (!forceRefresh && memoryCache && memoryCache.expiresAt > Date.now()) {
    return memoryCache.data;
  }

  // Check localStorage cache (browser only)
  if (
    !forceRefresh &&
    typeof localStorage !== "undefined" &&
    typeof document !== "undefined"
  ) {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const { data, expiresAt } = JSON.parse(cached) as {
          data: PresetRegistry;
          expiresAt: number;
        };
        if (expiresAt > Date.now()) {
          // Update memory cache from localStorage
          memoryCache = { data, expiresAt: Date.now() + MEMORY_CACHE_TTL_MS };
          return data;
        }
      }
    } catch {
      // Invalid cache, continue to fetch
      try {
        localStorage.removeItem(CACHE_KEY);
      } catch {
        // Ignore localStorage errors
      }
    }
  }

  // Build URL with optional category filter
  const url = new URL(`${gatewayUrl}/v1/presets`);
  if (category) {
    url.searchParams.set("category", category);
  }

  const response = await fetchFn(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const registry: PresetRegistry = await response.json();

  // Update caches
  const expiresAt = Date.now() + STORAGE_CACHE_TTL_MS;
  memoryCache = {
    data: registry,
    expiresAt: Date.now() + MEMORY_CACHE_TTL_MS,
  };

  // Persist to localStorage (browser only)
  if (typeof localStorage !== "undefined" && typeof document !== "undefined") {
    try {
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ data: registry, expiresAt })
      );
    } catch {
      // localStorage full or unavailable, continue without caching
    }
  }

  return registry;
}

/**
 * Get a single preset by slug.
 *
 * @param gatewayUrl - Base URL of the gateway
 * @param slug - Preset slug (e.g., "age_over_18")
 * @returns The preset or null if not found
 */
export async function getPresetBySlug(
  gatewayUrl: string,
  slug: string,
  options: { fetch?: typeof globalThis.fetch } = {}
): Promise<PresetFromRegistry | null> {
  const registry = await fetchPresetRegistry(gatewayUrl, options);
  return registry.presets.find((p) => p.id === slug) ?? null;
}

/**
 * Convert bundled PolicyPresets to registry format.
 * Used only for static preset-key-to-policy-ID mapping.
 */
function getBundledRegistry(): PresetRegistry {
  const presets: PresetFromRegistry[] = Object.entries(PRESET_POLICIES).map(
    ([key, policy]) => {
      const slug = getSlugFromKey(key);
      const policyId = PolicyPresets[key as keyof typeof PolicyPresets];

      return {
        id: slug,
        object: "policy_preset" as const,
        name: policy.name,
        description: policy.description ?? "",
        tagline: null,
        category: getCategoryFromKey(key),
        icon: getIconFromKey(key),
        claims_preview: policy.credentials.flatMap((c) => c.claims),
        required_fields: policy.credentials.flatMap((c) => c.claims),
        optional_fields: policy.credentials.flatMap(
          (c) => c.optionalClaims ?? []
        ),
        default_purpose:
          policy.credentials[0]?.purpose ?? "Verify your credentials",
        use_cases: [],
        is_featured: key === "IDENTITY_BASIC",
        policy_id: policyId,
      };
    }
  );

  return {
    object: "preset_registry",
    version: "bundled-1.0.0",
    generated_at: new Date().toISOString(),
    presets,
  };
}

function getSlugFromKey(key: string): string {
  switch (key) {
    case "AGE_GATE_18":
      return "age_over_18";
    case "AGE_GATE_18_EUDI":
      return "age_over_18_eudi";
    case "IDENTITY_BASIC":
      return "identity_basic";
    case "IDENTITY_BASIC_EUDI":
      return "identity_basic_eudi";
    case "KYC_BASIC":
      return "kyc_basic";
    case "KYC_BASIC_EUDI":
      return "kyc_basic_eudi";
    case "PENSION":
      return "authbound_pension";
    default:
      return key.toLowerCase();
  }
}

/**
 * Infer category from preset key.
 */
function getCategoryFromKey(key: string): string {
  if (key.startsWith("AGE_")) return "age_verification";
  if (key.startsWith("IDENTITY_")) return "identity";
  if (key.startsWith("KYC_")) return "identity";
  if (key === "PENSION") return "financial";
  return "custom";
}

/**
 * Infer icon from preset key.
 */
function getIconFromKey(key: string): string {
  if (key.startsWith("AGE_")) return "shield-check";
  if (key.startsWith("IDENTITY_")) return "user-check";
  if (key.startsWith("KYC_")) return "user-check";
  if (key === "PENSION") return "wallet-cards";
  return "shield";
}

/**
 * Clear all preset caches.
 * Useful for testing or forcing a refresh.
 */
export function clearPresetCache(): void {
  memoryCache = null;
  if (typeof localStorage !== "undefined" && typeof document !== "undefined") {
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch {
      // Ignore localStorage errors
    }
  }
}

/**
 * Get the PolicyId for a preset.
 *
 * This maps bundled preset keys to concrete Authbound policy IDs.
 * Works with both bundled presets (via PolicyPresets) and API-fetched presets.
 *
 * @example
 * ```ts
 * // Using bundled preset key
 * const policyId = getPresetPolicyId('AGE_GATE_18');
 * // Returns: 'pol_age_over_18_authbound_v1'
 * ```
 */
export function getPresetPolicyId(
  presetKeyOrSlug: keyof typeof PolicyPresets | string
): PolicyId {
  // Check if it's a bundled preset key
  if (presetKeyOrSlug in PolicyPresets) {
    return PolicyPresets[presetKeyOrSlug as keyof typeof PolicyPresets];
  }

  const bundled = getBundledRegistry().presets.find(
    (preset) =>
      preset.id === presetKeyOrSlug || preset.policy_id === presetKeyOrSlug
  );
  if (bundled) return bundled.policy_id as PolicyId;

  if (isPolicyId(presetKeyOrSlug)) {
    return presetKeyOrSlug;
  }

  throw new TypeError(
    `Unknown policy preset or invalid policy ID: ${presetKeyOrSlug}`
  );
}
