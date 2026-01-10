import { motion } from "framer-motion";
import {
  ArrowRight,
  CheckCircle,
  FileText,
  Trash2,
  UploadCloud,
} from "lucide-react";
import type React from "react";
import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import type { StepProps } from "../types";

interface UploadBoxProps {
  label: string;
  file: File | null;
  onUpload: (file: File) => void;
  onRemove: () => void;
  disabled?: boolean;
}

const UploadBox: React.FC<UploadBoxProps> = ({
  label,
  file,
  onUpload,
  onRemove,
  disabled,
}) => {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        onUpload(acceptedFiles[0]);
      }
    },
    [onUpload]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [], "application/pdf": [] },
    maxFiles: 1,
    disabled: !!file || disabled,
  });

  if (file) {
    return (
      <div
        className="preview-container"
        style={{ height: 160, marginBottom: "1rem" }}
      >
        {file.type.startsWith("image/") ? (
          <img alt="Preview" src={URL.createObjectURL(file)} />
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "white",
            }}
          >
            <FileText size={32} />
            <p style={{ fontSize: 12, marginTop: 4 }}>{file.name}</p>
          </div>
        )}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              background: "#22c55e",
              padding: 8,
              borderRadius: "50%",
              color: "white",
            }}
          >
            <CheckCircle size={24} />
          </div>
        </div>
        <button
          className="btn-icon-only"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            background: "rgba(0,0,0,0.6)",
            color: "white",
            width: 32,
            height: 32,
          }}
        >
          <Trash2 size={16} />
        </button>
        <div
          style={{
            position: "absolute",
            bottom: 8,
            left: 8,
            color: "white",
            fontSize: 12,
            fontWeight: 600,
            textShadow: "0 1px 2px rgba(0,0,0,0.5)",
          }}
        >
          {label}
        </div>
      </div>
    );
  }

  return (
    <div
      {...getRootProps()}
      className={`upload-zone ${isDragActive ? "active" : ""}`}
      style={{ padding: "1.5rem 1rem", marginBottom: "1rem" }}
    >
      <input {...getInputProps()} />
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: "1rem",
          textAlign: "left",
        }}
      >
        <div
          className="icon-box bg-blue"
          style={{ marginBottom: 0, width: 48, height: 48, flexShrink: 0 }}
        >
          <UploadCloud size={24} />
        </div>
        <div>
          <p
            style={{
              margin: 0,
              fontWeight: 600,
              color: "#334155",
              fontSize: "0.95rem",
            }}
          >
            {label}
          </p>
          <p
            style={{
              margin: "0.25rem 0 0 0",
              fontSize: "0.8rem",
              color: "#94a3b8",
            }}
          >
            Click or drag file
          </p>
        </div>
      </div>
    </div>
  );
};

export const DocumentUploadStep: React.FC<StepProps> = ({
  onNext,
  updateUIState,
  uiState,
  onUploadDocument,
  isBusy,
  error,
}) => {
  const isPassport = uiState.documentType === "passport";
  const isReady = isPassport
    ? !!uiState.documentFront
    : !!uiState.documentFront && !!uiState.documentBack;

  const handleUpload = async (file: File, side: "front" | "back") => {
    // Update UI state immediately for preview
    if (side === "front") {
      updateUIState({ documentFront: file });
      // We only send the front to the SDK for now as per current specs
      await onUploadDocument(file);
    } else {
      updateUIState({ documentBack: file });
      // We don't send back to SDK yet
    }
  };

  return (
    <motion.div
      animate={{ opacity: 1, x: 0 }}
      className="kyc-content"
      exit={{ opacity: 0, x: -20 }}
      initial={{ opacity: 0, x: 20 }}
    >
      <h2 className="kyc-title">Upload Document</h2>
      <p className="kyc-description">
        {isPassport
          ? "Please upload the photo page of your Passport."
          : "Please upload both sides of your Driver's License."}
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

      <div style={{ width: "100%" }}>
        <UploadBox
          disabled={isBusy}
          file={uiState.documentFront}
          label={isPassport ? "Passport Photo Page" : "Front of License"}
          onRemove={() => updateUIState({ documentFront: null })}
          onUpload={(file) => handleUpload(file, "front")}
        />

        {!isPassport && (
          <UploadBox
            disabled={isBusy}
            file={uiState.documentBack}
            label="Back of License"
            onRemove={() => updateUIState({ documentBack: null })}
            onUpload={(file) => handleUpload(file, "back")}
          />
        )}
      </div>

      <div
        className="kyc-footer"
        style={{ width: "100%", border: "none", padding: "1rem 0 0 0" }}
      >
        <button
          className="btn-primary btn-full"
          disabled={!isReady || isBusy}
          onClick={onNext}
          style={{ opacity: !isReady || isBusy ? 0.5 : 1 }}
        >
          {isBusy ? "Uploading..." : "Continue"} <ArrowRight size={18} />
        </button>
      </div>
    </motion.div>
  );
};
