import { z } from "zod";
import { AuthboundError } from "./errors";

export const ProviderPreferenceSchema = z.enum(["auto", "vcs", "eudi"]);
export type ProviderPreference = z.infer<typeof ProviderPreferenceSchema>;

export const SelectedVerificationProviderSchema = z.enum(["vcs", "eudi"]);
export type SelectedVerificationProvider = z.infer<
  typeof SelectedVerificationProviderSchema
>;

export const VerificationFailureCodeSchema = z.enum([
  "presentation_invalid",
  "credential_expired",
  "credential_revoked",
  "issuer_untrusted",
  "policy_not_satisfied",
  "processing_timeout",
  "provider_error",
  "user_declined",
  "wallet_error",
]);
export type VerificationFailureCode = z.infer<
  typeof VerificationFailureCodeSchema
>;

export const VerificationProgressStatusSchema = z.enum([
  "created",
  "awaiting_user",
  "awaiting_provider",
  "pending",
  "processing",
  "verified",
  "failed",
  "canceled",
  "expired",
]);
export type VerificationProgressStatus = z.infer<
  typeof VerificationProgressStatusSchema
>;

export const VerificationUiStatusSchema = z.enum([
  "idle",
  "pending",
  "processing",
  "verified",
  "failed",
  "canceled",
  "expired",
  "timeout",
  "error",
]);
export type VerificationUiStatus = z.infer<typeof VerificationUiStatusSchema>;

export const TERMINAL_VERIFICATION_PROGRESS_STATUSES = [
  "verified",
  "failed",
  "canceled",
  "expired",
] as const satisfies readonly VerificationProgressStatus[];

export const TERMINAL_VERIFICATION_UI_STATUSES = [
  "verified",
  "failed",
  "canceled",
  "expired",
  "timeout",
  "error",
] as const satisfies readonly VerificationUiStatus[];

export function parseProviderPreference(value: unknown): ProviderPreference {
  const parsed = ProviderPreferenceSchema.safeParse(value);
  if (!parsed.success) {
    throw new AuthboundError(
      "policy_invalid",
      'provider must be one of "auto", "vcs", or "eudi"'
    );
  }
  return parsed.data;
}

export function parseVerificationProgressStatus(
  value: unknown
): VerificationProgressStatus {
  const parsed = VerificationProgressStatusSchema.safeParse(value);
  if (!parsed.success) {
    throw new AuthboundError(
      "verification_invalid_state",
      `Unknown verification status from gateway: ${String(value)}`
    );
  }
  return parsed.data;
}

export function projectVerificationStatusForUi(
  status: VerificationProgressStatus | string
): VerificationUiStatus {
  switch (status) {
    case "created":
    case "awaiting_user":
    case "awaiting_provider":
    case "pending":
      return "pending";
    case "processing":
      return "processing";
    case "verified":
    case "failed":
    case "canceled":
    case "expired":
      return status;
    default:
      throw new AuthboundError(
        "verification_invalid_state",
        `Unknown verification status from gateway: ${status}`
      );
  }
}

export function isTerminalVerificationProgressStatus(
  status: VerificationProgressStatus
): boolean {
  return TERMINAL_VERIFICATION_PROGRESS_STATUSES.some(
    (terminalStatus) => terminalStatus === status
  );
}

export function isTerminalVerificationUiStatus(
  status: VerificationUiStatus
): boolean {
  return TERMINAL_VERIFICATION_UI_STATUSES.some(
    (terminalStatus) => terminalStatus === status
  );
}

export const VerificationClientActionSchema = z
  .object({
    kind: z.enum(["qr", "link", "request_blob"]),
    data: z.string(),
    expires_at: z.string(),
  })
  .strict();
export type VerificationClientActionWire = z.infer<
  typeof VerificationClientActionSchema
>;

export const PublicVerificationSchema = z
  .object({
    object: z.literal("verification"),
    id: z.string(),
    status: VerificationProgressStatusSchema,
    policy_id: z.string(),
    policy_hash: z.string().nullish(),
    provider: SelectedVerificationProviderSchema.nullish(),
    env_mode: z.enum(["test", "live"]),
    created_at: z.string(),
    expires_at: z.string(),
    terminal_at: z.string().nullish(),
    failure_code: VerificationFailureCodeSchema.nullish(),
    client_action: VerificationClientActionSchema.nullish(),
    verification_url: z.string().nullish(),
    customer_user_ref: z.string().nullish(),
    metadata: z.record(z.string(), z.unknown()).nullish(),
  })
  .strict();
export const PublicCreateVerificationResponseSchema =
  PublicVerificationSchema.extend({
    client_token: z.string(),
  }).strict();

export const PublicVerificationListSchema = z
  .object({
    object: z.literal("list"),
    data: z.array(PublicVerificationSchema),
    has_more: z.boolean().optional().default(false),
    next_cursor: z.string().nullable().optional(),
  })
  .strict();

export const PublicVerificationStatusSnapshotSchema = z
  .object({
    object: z.literal("verification_status"),
    id: z.string(),
    status: VerificationProgressStatusSchema,
    failure_code: VerificationFailureCodeSchema.nullish(),
    client_action: VerificationClientActionSchema.nullish(),
  })
  .strict();

export const SignedVerificationResultSchema = z
  .object({
    verification_id: z.string(),
    status: z.enum(["verified", "failed"]),
    result_token: z.string(),
    assertions: z.record(z.string(), z.unknown()).optional(),
    failure_code: VerificationFailureCodeSchema.nullish(),
  })
  .strict();
