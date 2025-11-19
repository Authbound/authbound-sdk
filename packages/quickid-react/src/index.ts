export * from "./useQuickID";
export * from "./components/quickIdFlow";
export * from "./components/documentUpload";
export * from "./components/selfieCapture";
export * from "./components/status";

// Re-export core types for convenience
export type {
  QuickIDConfig,
  QuickIdSession,
  QuickIdResult,
  QuickIdStatus,
  QuickIdLevel,
  CreateSessionInput,
} from "@authbound/quickid-core";
