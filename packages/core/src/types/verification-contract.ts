import { z } from "zod";
import { AuthboundError } from "./errors";

export const ProviderPreferenceSchema = z.enum(["auto", "vcs", "eudi", "eudiplo"]);
export type ProviderPreference = z.infer<typeof ProviderPreferenceSchema>;

export const SelectedVerificationProviderSchema = z.enum(["vcs", "eudi", "eudiplo"]);
export type SelectedVerificationProvider = z.infer<
  typeof SelectedVerificationProviderSchema
>;

export const VerificationFailureCodeSchema = z.enum([
  "presentation_invalid",
  "credential_expired",
  "credential_revoked",
  "issuer_untrusted",
  "missing_requested_assertions",
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
      'provider must be one of "auto", "vcs", "eudi", or "eudiplo"'
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
      `Unknown verification status from API: ${String(value)}`
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
        `Unknown verification status from API: ${status}`
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

function isTerminalVerificationProgressStatusValue(
  status: VerificationProgressStatus
): boolean {
  return isTerminalVerificationProgressStatus(status);
}

function validateFailureCodeSemantics(
  value: {
    status: VerificationProgressStatus;
    failure_code?: VerificationFailureCode | null;
  },
  context: z.RefinementCtx
): void {
  if (value.status === "failed" && !value.failure_code) {
    context.addIssue({
      code: "custom",
      message: "failed verifications must include failure_code",
      path: ["failure_code"],
    });
    return;
  }

  if (value.status !== "failed" && value.failure_code) {
    context.addIssue({
      code: "custom",
      message: "failure_code is only valid for failed verifications",
      path: ["failure_code"],
    });
  }
}

function validateNoTerminalClientAction(
  value: {
    status: VerificationProgressStatus;
    client_action?: VerificationClientActionWire | null;
  },
  context: z.RefinementCtx
): void {
  if (
    isTerminalVerificationProgressStatusValue(value.status) &&
    value.client_action
  ) {
    context.addIssue({
      code: "custom",
      message: "terminal verifications must not include client_action",
      path: ["client_action"],
    });
  }
}

const UNSAFE_PUBLIC_METADATA_KEYS = [
  "client_token",
  "result_token",
  "assertions",
  "result",
  "verification_url",
  "client_action",
  "clientAction",
  "gateway",
  "nonce",
] as const;

function validatePublicMetadata(
  value: { metadata?: Record<string, unknown> | null },
  context: z.RefinementCtx
): void {
  if (!value.metadata) {
    return;
  }

  for (const unsafeKey of UNSAFE_PUBLIC_METADATA_KEYS) {
    if (Object.hasOwn(value.metadata, unsafeKey)) {
      context.addIssue({
        code: "custom",
        message: `metadata must not include ${unsafeKey}`,
        path: ["metadata", unsafeKey],
      });
    }
  }
}

export const VerificationClientActionSchema = z
  .object({
    kind: z.enum(["qr", "link", "request_blob"]),
    data: z.string().min(1),
    expires_at: z.string().min(1),
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
  .strict()
  .superRefine((value, context) => {
    validateFailureCodeSemantics(value, context);
    validateNoTerminalClientAction(value, context);
    validatePublicMetadata(value, context);
  });
export const PublicCreateVerificationResponseSchema =
  PublicVerificationSchema.safeExtend({
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
  .strict()
  .superRefine((value, context) => {
    validateFailureCodeSemantics(value, context);
    validateNoTerminalClientAction(value, context);
  });

export const SignedVerificationResultSchema = z
  .object({
    verification_id: z.string(),
    status: z.enum(["verified", "failed"]),
    result_token: z.string(),
    assertions: z.record(z.string(), z.unknown()).optional(),
    failure_code: VerificationFailureCodeSchema.nullish(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.status === "failed" && !value.failure_code) {
      context.addIssue({
        code: "custom",
        message: "failed verification results must include failure_code",
        path: ["failure_code"],
      });
      return;
    }

    if (value.status === "failed" && value.assertions !== undefined) {
      context.addIssue({
        code: "custom",
        message: "failed verification results must not include assertions",
        path: ["assertions"],
      });
    }

    if (value.status === "verified" && value.failure_code) {
      context.addIssue({
        code: "custom",
        message: "verified verification results must not include failure_code",
        path: ["failure_code"],
      });
    }
  });
