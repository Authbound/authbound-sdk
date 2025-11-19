import React from "react";
import { CreditCard, FileText, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import type { StepProps } from "../types";

export const DocumentTypeStep: React.FC<StepProps> = ({
  onNext,
  updateUIState,
  uiState,
}) => {
  const handleSelect = (type: "passport" | "drivers-license") => {
    if (uiState.documentType !== type) {
      updateUIState({
        documentType: type,
        documentFront: null,
        documentBack: null,
      });
    }
  };

  return (
    <motion.div
      className="kyc-content"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
    >
      <h2 className="kyc-title">Select Document Type</h2>
      <p className="kyc-description">
        Choose the document you want to use for verification.
      </p>

      <div className="doc-options">
        <div
          className={`doc-card ${
            uiState.documentType === "passport" ? "selected" : ""
          }`}
          onClick={() => handleSelect("passport")}
        >
          <div className="icon-box bg-blue" style={{ marginBottom: 0 }}>
            <FileText size={24} />
          </div>
          <div className="doc-info">
            <h4>Passport</h4>
            <p>International travel document</p>
          </div>
        </div>

        <div
          className={`doc-card ${
            uiState.documentType === "drivers-license" ? "selected" : ""
          }`}
          onClick={() => handleSelect("drivers-license")}
        >
          <div className="icon-box bg-green" style={{ marginBottom: 0 }}>
            <CreditCard size={24} />
          </div>
          <div className="doc-info">
            <h4>Driver's License</h4>
            <p>National identity card</p>
          </div>
        </div>
      </div>

      <div
        className="kyc-footer"
        style={{ width: "100%", border: "none", padding: "2rem 0 0 0" }}
      >
        <button
          className="btn-primary btn-full"
          onClick={onNext}
          disabled={!uiState.documentType}
          style={{ opacity: !uiState.documentType ? 0.5 : 1 }}
        >
          Continue <ArrowRight size={18} />
        </button>
      </div>
    </motion.div>
  );
};
