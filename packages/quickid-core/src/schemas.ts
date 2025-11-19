import { z } from "zod";

export const QuickIdLevelSchema = z.enum(["basic", "standard", "enhanced"]);

export const QuickIdStatusSchema = z.enum([
  "created",
  "document_uploaded",
  "selfie_uploaded",
  "processing",
  "verified",
  "failed",
]);

export const QuickIdResultSchema = z.object({
  verified: z.boolean(),
  score: z.number(),
  documentCountry: z.string().optional(),
  documentType: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  dateOfBirth: z.string().optional(),
});

export const QuickIdSessionSchema = z.object({
  id: z.string(),
  userHint: z.string().optional(),
  status: QuickIdStatusSchema,
  level: QuickIdLevelSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  result: QuickIdResultSchema.optional(),
  errorCode: z.string().optional(),
  vendorData: z.record(z.string(), z.unknown()).optional(),
});

export const CreateSessionInputSchema = z.object({
  level: QuickIdLevelSchema.optional(),
  userHint: z.string().optional(),
  redirectUrl: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const ApiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});
