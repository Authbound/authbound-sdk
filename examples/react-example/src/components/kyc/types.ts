import type { QuickIDUiPhase } from "@authbound/quickid-react";
import type { QuickIdSession, QuickIdResult } from "@authbound/quickid-core";

// Extended state for UI-specific data not managed by SDK
export interface KYCUIState {
  documentType: "passport" | "drivers-license" | null;
  documentFront: File | null;
  documentBack: File | null;
  selfieFile: File | null;
}

// Map SDK phases to our UI steps
export type KYCStep =
  | "intro"
  | "document-type"
  | "document-upload"
  | "selfie"
  | "processing"
  | "success";

export interface StepProps {
  onNext: () => void;
  onBack?: () => void;
  uiState: KYCUIState;
  updateUIState: (updates: Partial<KYCUIState>) => void;
  // SDK state
  phase: QuickIDUiPhase;
  session: QuickIdSession | null;
  result: QuickIdResult | null;
  error: string | null;
  isBusy: boolean;
  // SDK methods
  onStartSession: () => Promise<void>;
  onUploadDocument: (file: File, side: "front" | "back") => Promise<void>;
  onUploadSelfie: (file: File) => Promise<void>;
}
