import React, { useRef, useState, useCallback } from "react";
import Webcam from "react-webcam";
import { Camera, RefreshCw, Check } from "lucide-react";
import { motion } from "framer-motion";
import type { StepProps } from "../types";

export const SelfieStep: React.FC<StepProps> = ({
  updateUIState,
  uiState,
  onUploadSelfie,
  isBusy,
  error,
}) => {
  const webcamRef = useRef<Webcam>(null);
  const [imgSrc, setImgSrc] = useState<string | null>(null);

  const capture = useCallback(() => {
    if (webcamRef.current) {
      const imageSrc = webcamRef.current.getScreenshot();
      if (imageSrc) {
        setImgSrc(imageSrc);
        // Convert base64 to file
        fetch(imageSrc)
          .then((res) => res.blob())
          .then((blob) => {
            const file = new File([blob], "selfie.jpg", { type: "image/jpeg" });
            updateUIState({ selfieFile: file });
          });
      }
    }
  }, [webcamRef, updateUIState]);

  const retake = () => {
    setImgSrc(null);
    updateUIState({ selfieFile: null });
  };

  const handleConfirm = async () => {
    if (uiState.selfieFile) {
      await onUploadSelfie(uiState.selfieFile);
      // SDK will handle verification and phase transitions
    }
  };

  return (
    <motion.div
      className="kyc-content"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
    >
      <h2 className="kyc-title">Take a Selfie</h2>
      <p className="kyc-description">
        Make sure your face is well-lit and centered in the frame.
      </p>

      {error && (
        <div
          style={{
            padding: "0.75rem 1rem",
            background: "#fee2e2",
            border: "1px solid #fecaca",
            borderRadius: "8px",
            color: "#991b1b",
            marginBottom: "1rem",
            fontSize: "0.875rem",
          }}
        >
          {error}
        </div>
      )}

      <div className="camera-container">
        {imgSrc ? (
          <img
            src={imgSrc}
            alt="Selfie"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              transform: "scaleX(-1)",
            }}
          />
        ) : (
          <>
            <Webcam
              audio={false}
              ref={webcamRef}
              screenshotFormat="image/jpeg"
              width="100%"
              height="100%"
              videoConstraints={{ facingMode: "user" }}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                transform: "scaleX(-1)",
              }}
            />
            <div className="camera-overlay" />
          </>
        )}
      </div>

      <div
        className="kyc-footer"
        style={{ width: "100%", border: "none", padding: 0 }}
      >
        {!imgSrc ? (
          <button
            className="btn-primary btn-full"
            onClick={capture}
            disabled={isBusy}
          >
            <Camera size={18} /> Capture Photo
          </button>
        ) : (
          <div style={{ display: "flex", gap: "1rem", width: "100%" }}>
            <button
              className="btn-secondary btn-full"
              onClick={retake}
              disabled={isBusy}
            >
              <RefreshCw size={18} /> Retake
            </button>
            <button
              className="btn-primary btn-full"
              onClick={handleConfirm}
              disabled={isBusy || !uiState.selfieFile}
            >
              {isBusy ? "Verifying..." : "Confirm"} <Check size={18} />
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
};
