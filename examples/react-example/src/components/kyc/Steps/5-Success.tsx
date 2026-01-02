import React, { useEffect } from "react";
import { CheckCircle, Loader2, XCircle } from "lucide-react";
import { motion } from "framer-motion";
import type { StepProps } from "../types";

export const SuccessStep: React.FC<StepProps & { onNext: () => void }> = ({
  onNext,
  result,
  error,
  phase,
}) => {
  const isProcessing = phase === "verifying";
  const isSuccess = result?.status === "VERIFIED";

  useEffect(() => {
    if (isSuccess && !isProcessing) {
      const timer = setTimeout(() => {
        onNext(); // Complete flow
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isSuccess, isProcessing, onNext]);

  return (
    <motion.div
      className="kyc-content"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      style={{ padding: "4rem 2rem" }}
    >
      {isProcessing ? (
        <>
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 10 }}
            style={{ marginBottom: "2rem" }}
          >
            <div
              className="icon-box bg-blue"
              style={{
                width: 80,
                height: 80,
                borderRadius: "50%",
                margin: "0 auto",
              }}
            >
              <Loader2 className="spin" size={40} />
            </div>
          </motion.div>
          <h2 className="kyc-title">Verifying...</h2>
          <p className="kyc-description">
            Please wait while we verify your identity. This usually takes a few
            seconds.
          </p>
        </>
      ) : isSuccess ? (
        <>
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 10 }}
            style={{ marginBottom: "2rem" }}
          >
            <div
              className="icon-box bg-green"
              style={{
                width: 80,
                height: 80,
                borderRadius: "50%",
                margin: "0 auto",
              }}
            >
              <CheckCircle size={40} />
            </div>
          </motion.div>
          <h2 className="kyc-title">Verification Successful!</h2>
          <p className="kyc-description">
            Your identity has been verified securely. You can now access all
            health portal features.
          </p>
          {result.risk_score !== undefined && (
            <p
              style={{
                marginTop: "1rem",
                fontSize: "0.875rem",
                color: "#64748b",
              }}
            >
              Verification score: {(100 - result.risk_score).toFixed(0)}%
            </p>
          )}
          <div
            style={{
              marginTop: "2rem",
              color: "#94a3b8",
              fontSize: "0.9rem",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              justifyContent: "center",
            }}
          >
            Redirecting... <Loader2 className="spin" size={14} />
          </div>
        </>
      ) : (
        <>
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 10 }}
            style={{ marginBottom: "2rem" }}
          >
            <div
              className="icon-box bg-red"
              style={{
                width: 80,
                height: 80,
                borderRadius: "50%",
                margin: "0 auto",
                background: "rgba(239, 68, 68, 0.2)",
                color: "#ef4444",
              }}
            >
              <XCircle size={40} />
            </div>
          </motion.div>
          <h2 className="kyc-title">Verification Failed</h2>
          <p className="kyc-description">
            {error ||
              "We could not verify your identity. Please check that your document and selfie are clear and try again."}
          </p>
          <button
            className="btn-primary btn-full"
            onClick={onNext}
            style={{ marginTop: "2rem" }}
          >
            Close
          </button>
        </>
      )}

      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </motion.div>
  );
};
