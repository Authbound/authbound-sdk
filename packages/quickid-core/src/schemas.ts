import { z } from "zod";

export const VerificationStatusSchema = z.enum([
  "VERIFIED",
  "REJECTED",
  "MANUAL_REVIEW_NEEDED",
  "PENDING",
]);

export const AssuranceLevelSchema = z.enum([
  "NONE",
  "LOW",
  "SUBSTANTIAL",
  "HIGH",
]);

export const MrzSexSchema = z.enum(["M", "F", "X"]);

export const DocumentDataSchema = z.object({
  document_number: z.string().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  date_of_birth: z.string().optional(),
  date_of_expiry: z.string().optional(),
  issuing_country: z.string().optional(),
  personal_id: z.string().optional(),
  sex: MrzSexSchema.optional(),
});

export const BiometricDataSchema = z.object({
  face_match_confidence: z.number().optional(),
  liveness_verified: z.boolean().optional(),
  liveness_confidence: z.number().optional(),
});

export const ErrorDetailSchema = z.object({
  code: z.string(),
  reason: z.string(),
});

export const VerificationResultSchema = z.object({
  session_id: z.string(),
  status: VerificationStatusSchema,
  assurance_level: AssuranceLevelSchema,
  risk_score: z.number().optional(),
  document_data: DocumentDataSchema.optional(),
  biometrics: BiometricDataSchema.optional(),
  errors: z.array(ErrorDetailSchema).optional(),
});

export const ApiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});
