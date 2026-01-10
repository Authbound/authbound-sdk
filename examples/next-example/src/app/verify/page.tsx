"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

type VerificationStatus = "idle" | "loading" | "verified" | "error";

interface SessionStatus {
  isVerified: boolean;
  session: {
    status: string;
    assuranceLevel: string;
    age?: number;
    sessionId: string;
    userRef: string;
    expiresAt: string;
  } | null;
}

function VerifyContent() {
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") || "/dashboard";

  const [status, setStatus] = useState<VerificationStatus>("idle");
  const [sessionStatus, setSessionStatus] = useState<SessionStatus | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  // Check current session status on mount
  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    try {
      const res = await fetch("/api/authbound/status");
      const data = await res.json();
      setSessionStatus(data);
      if (data.isVerified) {
        setStatus("verified");
      }
    } catch (err) {
      console.error("Failed to check status:", err);
    }
  };

  const startVerification = async () => {
    setStatus("loading");
    setError(null);

    try {
      // Create a new verification session
      const res = await fetch("/api/authbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        throw new Error("Failed to create session");
      }

      const data = await res.json();
      console.log("Session created:", data);

      // In a real app, you would:
      // 1. Use the clientToken with @authbound-sdk/quickid-react
      // 2. Show the KYC flow modal
      // 3. Wait for the webhook to update the session

      // For demo purposes, simulate a successful verification
      // by calling the callback endpoint directly
      await simulateVerification(data.sessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
      setStatus("error");
    }
  };

  // Demo helper - in production, this happens via webhook
  const simulateVerification = async (sessionId: string) => {
    try {
      // Simulate webhook callback
      const res = await fetch("/api/authbound/callback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          customer_user_ref: `demo_user_${Date.now()}`,
          status: "VERIFIED",
          assurance_level: "SUBSTANTIAL",
          document_data: {
            first_name: "John",
            last_name: "Doe",
            date_of_birth: "1990-05-15",
            issuing_country: "FI",
          },
          biometrics: {
            face_match_confidence: 95.5,
            liveness_verified: true,
          },
          timestamp: new Date().toISOString(),
        }),
      });

      if (!res.ok) {
        throw new Error("Verification callback failed");
      }

      setStatus("verified");
      await checkStatus();
    } catch (err) {
      throw err;
    }
  };

  const signOut = async () => {
    try {
      await fetch("/api/authbound", { method: "DELETE" });
      setSessionStatus(null);
      setStatus("idle");
    } catch (err) {
      console.error("Sign out failed:", err);
    }
  };

  return (
    <>
      <nav className="nav">
        <Link href="/">Home</Link>
        <Link href="/dashboard">Dashboard</Link>
        <Link href="/premium">Premium</Link>
        <Link href="/adult">Adult Content</Link>
        <Link href="/verify">Verify Identity</Link>
      </nav>

      <div
        className="container"
        style={{ maxWidth: "600px", marginTop: "2rem" }}
      >
        <div className="card">
          <h2>Identity Verification</h2>
          <p style={{ marginBottom: "2rem" }}>
            Complete identity verification to access protected content.
          </p>

          {status === "idle" && !sessionStatus?.isVerified && (
            <div>
              <p style={{ marginBottom: "1.5rem" }}>
                This demo simulates the verification process. In production,
                you&apos;d use the <code>@authbound-sdk/quickid-react</code>{" "}
                components to capture documents and selfie.
              </p>
              <button className="btn btn-primary" onClick={startVerification}>
                Start Verification
              </button>
            </div>
          )}

          {status === "loading" && (
            <div style={{ textAlign: "center", padding: "2rem" }}>
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  border: "3px solid var(--color-border)",
                  borderTopColor: "var(--color-primary)",
                  borderRadius: "50%",
                  animation: "spin 1s linear infinite",
                  margin: "0 auto 1rem",
                }}
              />
              <p>Verifying your identity...</p>
              <style jsx>{`
                @keyframes spin {
                  to {
                    transform: rotate(360deg);
                  }
                }
              `}</style>
            </div>
          )}

          {status === "verified" && sessionStatus?.isVerified && (
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  marginBottom: "1.5rem",
                }}
              >
                <span className="status-indicator verified" />
                <span className="badge badge-success">Verified</span>
              </div>

              <div
                style={{
                  background: "var(--color-bg-elevated)",
                  borderRadius: "8px",
                  padding: "1rem",
                  marginBottom: "1.5rem",
                }}
              >
                <h4 style={{ marginBottom: "0.75rem", fontSize: "0.9rem" }}>
                  Session Details
                </h4>
                <div
                  style={{
                    display: "grid",
                    gap: "0.5rem",
                    fontSize: "0.85rem",
                    color: "var(--color-text-muted)",
                  }}
                >
                  <div>
                    <strong>Status:</strong> {sessionStatus.session?.status}
                  </div>
                  <div>
                    <strong>Assurance:</strong>{" "}
                    {sessionStatus.session?.assuranceLevel}
                  </div>
                  {sessionStatus.session?.age && (
                    <div>
                      <strong>Age:</strong> {sessionStatus.session.age} years
                    </div>
                  )}
                  <div>
                    <strong>Session ID:</strong>{" "}
                    <code style={{ fontSize: "0.8rem" }}>
                      {sessionStatus.session?.sessionId.slice(0, 8)}...
                    </code>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                <Link className="btn btn-primary" href={returnTo}>
                  Continue to {returnTo} →
                </Link>
                <button className="btn btn-secondary" onClick={signOut}>
                  Sign Out
                </button>
              </div>
            </div>
          )}

          {status === "error" && (
            <div>
              <div
                className="badge badge-danger"
                style={{ marginBottom: "1rem" }}
              >
                Verification Failed
              </div>
              <p style={{ marginBottom: "1.5rem" }}>{error}</p>
              <button className="btn btn-primary" onClick={startVerification}>
                Try Again
              </button>
            </div>
          )}
        </div>

        {returnTo !== "/dashboard" && (
          <p
            style={{
              marginTop: "1rem",
              textAlign: "center",
              fontSize: "0.9rem",
            }}
          >
            You&apos;ll be redirected to <code>{returnTo}</code> after
            verification.
          </p>
        )}
      </div>
    </>
  );
}

function LoadingFallback() {
  return (
    <div className="container" style={{ maxWidth: "600px", marginTop: "2rem" }}>
      <div className="card" style={{ textAlign: "center", padding: "2rem" }}>
        <p>Loading...</p>
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <VerifyContent />
    </Suspense>
  );
}
