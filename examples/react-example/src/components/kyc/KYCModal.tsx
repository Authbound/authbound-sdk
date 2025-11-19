import React, { useState, useEffect } from "react";
import { X, ChevronLeft } from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { useQuickID } from "@authbound/quickid-react";
import type { QuickIDConfig } from "@authbound/quickid-core";
import { IntroStep } from "./Steps/1-Intro";
import { DocumentTypeStep } from "./Steps/2-DocumentType";
import { DocumentUploadStep } from "./Steps/3-DocumentUpload";
import { SelfieStep } from "./Steps/4-Selfie";
import { SuccessStep } from "./Steps/5-Success";
import type { KYCStep, KYCUIState } from "./types";
import "./kyc.css";

interface KYCModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
  config: QuickIDConfig;
}

const STEPS_ORDER: KYCStep[] = [
  "intro",
  "document-type",
  "document-upload",
  "selfie",
  "success",
];

// Map SDK phase to our UI step
const mapPhaseToStep = (phase: string, uiStep: KYCStep): KYCStep => {
  switch (phase) {
    case "idle":
      return uiStep === "intro" ? "intro" : "intro";
    case "creating_session":
      return "document-type";
    case "awaiting_document":
      return "document-upload";
    case "awaiting_selfie":
      return "selfie";
    case "verifying":
      return "processing";
    case "done":
      return "success";
    default:
      return uiStep;
  }
};

export const KYCModal: React.FC<KYCModalProps> = ({
  isOpen,
  onClose,
  onComplete,
  config,
}) => {
  const [uiStep, setUiStep] = useState<KYCStep>("intro");
  const [uiState, setUIState] = useState<KYCUIState>({
    documentType: null,
    documentFront: null,
    documentBack: null,
    selfieFile: null,
  });

  // Use SDK hook
  const {
    state: { phase, session, result, error, isBusy },
    start,
    uploadDocument,
    uploadSelfieAndVerify,
    reset,
  } = useQuickID(config);

  // Sync SDK phase to UI step
  useEffect(() => {
    if (!isOpen) return;
    const mappedStep = mapPhaseToStep(phase, uiStep);
    if (mappedStep !== uiStep) {
      setUiStep(mappedStep);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, isOpen]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        setUIState({
          documentType: null,
          documentFront: null,
          documentBack: null,
          selfieFile: null,
        });
        setUiStep("intro");
        reset();
      }, 100);
    }
  }, [isOpen, reset]);

  // Handle completion
  useEffect(() => {
    if (phase === "done" && result?.verified) {
      const timer = setTimeout(() => {
        onComplete();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [phase, result, onComplete]);

  if (!isOpen) return null;

  const currentStepIndex = STEPS_ORDER.indexOf(uiStep);
  const progress = (currentStepIndex / (STEPS_ORDER.length - 1)) * 100;

  const updateUIState = (updates: Partial<KYCUIState>) => {
    setUIState((prev) => ({ ...prev, ...updates }));
  };

  const handleNext = () => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < STEPS_ORDER.length) {
      setUiStep(STEPS_ORDER[nextIndex]);
    } else {
      onComplete();
    }
  };

  const handleBack = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setUiStep(STEPS_ORDER[prevIndex]);
    }
  };

  const handleStartSession = async () => {
    await start();
    setUiStep("document-type");
  };

  const handleUploadDocument = async (file: File, side: "front" | "back") => {
    await uploadDocument(file, side);
    // Don't auto-advance - let user control flow
  };

  const handleUploadSelfie = async (file: File) => {
    await uploadSelfieAndVerify(file);
    // SDK will handle verification and phase transitions
  };

  const renderStep = () => {
    const props = {
      onNext: handleNext,
      onBack: handleBack,
      uiState,
      updateUIState,
      phase,
      session,
      result,
      error,
      isBusy,
      onStartSession: handleStartSession,
      onUploadDocument: handleUploadDocument,
      onUploadSelfie: handleUploadSelfie,
    };

    switch (uiStep) {
      case "intro":
        return <IntroStep {...props} />;
      case "document-type":
        return <DocumentTypeStep {...props} />;
      case "document-upload":
        return <DocumentUploadStep {...props} />;
      case "selfie":
        return <SelfieStep {...props} />;
      case "processing":
        return <SuccessStep {...props} onNext={onComplete} />;
      case "success":
        return <SuccessStep {...props} onNext={onComplete} />;
      default:
        return null;
    }
  };

  return (
    <div className="kyc-overlay">
      <div className="kyc-modal">
        <div className="kyc-header">
          {uiStep !== "intro" && uiStep !== "success" ? (
            <button className="btn-icon-only" onClick={handleBack}>
              <ChevronLeft size={20} />
            </button>
          ) : (
            <div style={{ width: 36 }} />
          )}

          <div className="kyc-progress-track">
            <div
              className="kyc-progress-bar"
              style={{ width: `${progress}%` }}
            />
          </div>

          <button className="btn-icon-only" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <AnimatePresence mode="wait">{renderStep()}</AnimatePresence>
      </div>
    </div>
  );
};
