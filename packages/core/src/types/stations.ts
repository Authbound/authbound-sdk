import { z } from "zod";
import {
  VerificationFailureCodeSchema,
  VerificationProgressStatusSchema,
} from "./verification-contract";

export const StationDisclosureProfileSchema = z.enum(["physical_id"]);
export type StationDisclosureProfile = z.infer<
  typeof StationDisclosureProfileSchema
>;

export const StationSafeAssertionsSchema = z
  .object({
    age_over_18: z.boolean().optional(),
    ticket_valid: z.boolean().optional(),
    event_id: z.string().optional(),
    event_name: z.string().optional(),
    valid_from: z.string().optional(),
    valid_until: z.string().optional(),
  })
  .strict();
export type StationSafeAssertions = z.infer<typeof StationSafeAssertionsSchema>;

const StationStatusSchema = z.enum([
  "created",
  "active",
  "paused",
  "closed",
  "expired",
]);

const StationEntryPayloadSchema = z
  .object({
    entry_url: z.string(),
    qr_payload: z.string(),
    nfc_payload: z.string(),
    token_expires_at: z.string(),
  })
  .strict();

const StationTicketSchema = z
  .object({
    event_id: z.string(),
    event_name: z.string().nullable(),
    valid_from: z.string().nullable(),
    valid_until: z.string().nullable(),
  })
  .strict();

export const StationSchema = z
  .object({
    object: z.literal("station"),
    id: z.string(),
    project_id: z.string(),
    env_mode: z.enum(["test", "live"]),
    status: StationStatusSchema,
    policy_ref: z.string(),
    policy_hash: z.string().nullable(),
    label: z.string().nullable(),
    created_at: z.string(),
    expires_at: z.string().nullable(),
    closed_at: z.string().nullable(),
    entry: StationEntryPayloadSchema,
    display: z
      .object({
        entry_display_url: z.string().nullable(),
        operator_console_url: z.string().nullable(),
        token_rotated_at: z.string(),
      })
      .strict(),
    ticket: StationTicketSchema.nullable(),
    dashboard_url: z.string(),
    settings: z
      .object({
        allow_concurrent: z.boolean(),
        ttl_seconds: z.number().int().positive().nullable(),
      })
      .strict(),
  })
  .strict();
export type Station = z.infer<typeof StationSchema>;

export const StationDisplayStationSchema = z
  .object({
    object: z.literal("station"),
    id: z.string(),
    status: StationStatusSchema,
    label: z.string().nullable(),
    entry: StationEntryPayloadSchema,
    ticket: StationTicketSchema.nullable(),
  })
  .strict();
export type StationDisplayStation = z.infer<typeof StationDisplayStationSchema>;

export const StationListSchema = z
  .object({
    object: z.literal("list"),
    data: z.array(StationSchema),
    has_more: z.boolean().optional().default(false),
    next_cursor: z.string().nullable().optional(),
  })
  .strict();
export type StationList = z.infer<typeof StationListSchema>;

export const StationVerificationSchema = z
  .object({
    object: z.literal("station_verification"),
    station_id: z.string(),
    verification_id: z.string(),
    env_mode: z.enum(["test", "live"]).optional(),
    status: VerificationProgressStatusSchema,
    created_at: z.string(),
    terminal_at: z.string().nullable(),
    transport: z.enum(["qr", "nfc", "link"]),
    client_ref: z.string().nullable().optional(),
    failure_code: VerificationFailureCodeSchema.nullish(),
    outcome_reason: z.string().nullable().optional(),
    assertions: StationSafeAssertionsSchema.optional(),
  })
  .strict();
export type StationVerification = z.infer<typeof StationVerificationSchema>;

export const StationVerificationListSchema = z
  .object({
    object: z.literal("list"),
    data: z.array(StationVerificationSchema),
    has_more: z.boolean().optional().default(false),
    next_cursor: z.string().nullable().optional(),
  })
  .strict();
export type StationVerificationList = z.infer<
  typeof StationVerificationListSchema
>;

export const StationDisplaySchema = z
  .object({
    object: z.literal("station_display"),
    station: StationDisplayStationSchema,
    verifications: z.array(StationVerificationSchema),
  })
  .strict();
export type StationDisplay = z.infer<typeof StationDisplaySchema>;

export const StationSpawnSchema = z
  .object({
    object: z.literal("station_spawn"),
    station_id: z.string(),
    verification_id: z.string(),
    client_action: z
      .object({
        kind: z.enum(["qr", "link", "request_blob"]),
        data: z.string(),
        expires_at: z.string().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type StationSpawn = z.infer<typeof StationSpawnSchema>;

export const StationEventSchema = z
  .object({
    id: z.string(),
    type: z.string(),
    cursor: z.number(),
    created_at: z.string(),
    data: z.record(z.string(), z.unknown()),
  })
  .strict();
export type StationEvent = z.infer<typeof StationEventSchema>;

export const StationEventListSchema = z
  .object({
    object: z.literal("list"),
    data: z.array(StationEventSchema),
    has_more: z.boolean().optional().default(false),
    next_cursor: z.number().nullable().optional(),
  })
  .strict();
export type StationEventList = z.infer<typeof StationEventListSchema>;

export const OperatorDeviceGrantSchema = z
  .object({
    object: z.literal("station_operator_grant"),
    id: z.string(),
    station_id: z.string(),
    profile: StationDisclosureProfileSchema,
    token: z.string().optional(),
    expires_at: z.string(),
    created_at: z.string(),
    revoked_at: z.string().nullable(),
  })
  .strict();
export type OperatorDeviceGrant = z.infer<typeof OperatorDeviceGrantSchema>;

export const StationVerificationDisclosureSchema = z
  .object({
    object: z.literal("station_verification_disclosure"),
    station_id: z.string(),
    verification_id: z.string(),
    profile: StationDisclosureProfileSchema,
    fields: z
      .object({
        portrait: z.string().optional(),
        given_name: z.string().optional(),
        family_name: z.string().optional(),
        birth_date: z.string().optional(),
        age_over_18: z.boolean().optional(),
        ticket_valid: z.boolean().optional(),
      })
      .strict(),
    granted_at: z.string(),
    expires_at: z.string(),
  })
  .strict();
export type StationVerificationDisclosure = z.infer<
  typeof StationVerificationDisclosureSchema
>;
