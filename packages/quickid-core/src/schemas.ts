import {
  AssuranceLevelSchema,
  BiometricDataSchema,
  DocumentDataSchema,
  ErrorDetailSchema,
  VerificationStatusSchema,
} from "@authbound-sdk/core";
import { z } from "zod";

// Re-export schemas from core
export {
  VerificationStatusSchema,
  AssuranceLevelSchema,
  DocumentDataSchema,
  BiometricDataSchema,
  ErrorDetailSchema,
};

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
