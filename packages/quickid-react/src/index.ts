export * from "./useQuickID";
export * from "./components/quickIdFlow";
export * from "./components/documentUpload";
export * from "./components/selfieCapture";
export * from "./components/status";

// Re-export core types for convenience
export type {
  QuickIDConfig,
  VerificationResult,
  VerificationStatus,
  AssuranceLevel,
  DocumentData,
  BiometricData,
  ErrorDetail,
} from "@authbound/quickid-core";
