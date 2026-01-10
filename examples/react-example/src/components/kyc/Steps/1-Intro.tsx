import { motion } from "framer-motion";
import { ArrowRight, Shield } from "lucide-react";
import type React from "react";
import type { StepProps } from "../types";

export const IntroStep: React.FC<StepProps> = ({
  onNext,
  onStartSession,
  isBusy,
}) => {
  const handleStart = async () => {
    await onStartSession();
    onNext(); // Advance to document type selection
  };

  return (
    <motion.div
      animate={{ opacity: 1, x: 0 }}
      className="kyc-content"
      exit={{ opacity: 0, x: -20 }}
      initial={{ opacity: 0, x: 20 }}
    >
      <div className="kyc-icon-large">
        <Shield size={32} />
      </div>
      <h2 className="kyc-title">Identity Verification</h2>
      <p className="kyc-description">
        To ensure the security of your health data, we need to verify your
        identity. This process takes less than 2 minutes.
      </p>

      <div className="doc-options">
        <div
          className="doc-card"
          style={{ cursor: "default", border: "none", background: "#f8fafc" }}
        >
          <div className="icon-box bg-blue" style={{ marginBottom: 0 }}>
            1
          </div>
          <div className="doc-info">
            <h4>Upload ID</h4>
            <p>Passport or License</p>
          </div>
        </div>
        <div
          className="doc-card"
          style={{ cursor: "default", border: "none", background: "#f8fafc" }}
        >
          <div className="icon-box bg-purple" style={{ marginBottom: 0 }}>
            2
          </div>
          <div className="doc-info">
            <h4>Take Selfie</h4>
            <p>Face verification</p>
          </div>
        </div>
      </div>

      <div
        className="kyc-footer"
        style={{ width: "100%", border: "none", padding: "2rem 0 0 0" }}
      >
        <button
          className="btn-primary btn-full"
          disabled={isBusy}
          onClick={handleStart}
          style={{ opacity: isBusy ? 0.5 : 1 }}
        >
          Start Verification <ArrowRight size={18} />
        </button>
      </div>
    </motion.div>
  );
};
