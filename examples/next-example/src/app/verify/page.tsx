"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";

type VerificationStatus = "idle" | "loading" | "verified" | "error";

type VerificationStatusResponse = {
  isVerified: boolean;
  session: {
    status: string;
    assuranceLevel: string;
    age?: number;
    verificationId: string;
    userRef: string;
    expiresAt: string;
  } | null;
};

function VerifyContent() {
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") || "/dashboard";

  const [status, setStatus] = useState<VerificationStatus>("idle");
  const [verificationStatus, setVerificationStatus] =
    useState<VerificationStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/authbound/status");
      const data = await res.json();
      setVerificationStatus(data);
      if (data.isVerified) {
        setStatus("verified");
      }
    } catch (err) {
      console.error("Failed to check status:", err);
    }
  }, []);

  // Check current session status on mount
  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const startVerification = async () => {
    setStatus("loading");
    setError(null);

    try {
      // Create a new verification
      const res = await fetch("/api/authbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        throw new Error("Failed to create verification");
      }

      const data = await res.json();
      console.log("Verification created:", data);

      // In a real app, you would:
      // 1. Send the user through the configured Authbound verification flow
      // 2. Poll the returned verification status or wait for the webhook
      // 3. Let the callback update the encrypted session cookie

      // For demo purposes, simulate a successful verification
      // by calling the callback endpoint directly
      await simulateVerification(data.verificationId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
      setStatus("error");
    }
  };

  // Demo helper - in production, this happens via webhook
  const simulateVerification = useCallback(
    async (verificationId: string) => {
      // Simulate webhook callback
      const now = Math.floor(Date.now() / 1000);
      const res = await fetch("/api/authbound/callback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: `evt_${Date.now()}`,
          object: "event",
          api_version: "2026-04-01",
          created: now,
          livemode: false,
          type: "identity.verification_session.verified",
          data: {
            object: {
              id: verificationId,
              object: "identity.verification_session",
              created: now,
              livemode: false,
              type: "id_number",
              status: "verified",
              client_reference_id: `demo_user_${Date.now()}`,
              verified_outputs: {
                first_name: "John",
                last_name: "Doe",
                dob: {
                  day: 15,
                  month: 5,
                  year: 1990,
                },
              },
            },
          },
        }),
      });

      if (!res.ok) {
        throw new Error("Verification callback failed");
      }

      setStatus("verified");
      await checkStatus();
    },
    [checkStatus]
  );

  const signOut = async () => {
    try {
      await fetch("/api/authbound", { method: "DELETE" });
      setVerificationStatus(null);
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

          {status === "idle" && !verificationStatus?.isVerified && (
            <div>
              <p style={{ marginBottom: "1.5rem" }}>
                This demo simulates the verification process. In production,
                you&apos;d redirect the user through your configured Authbound
                verification experience and let the webhook update the session.
              </p>
              <button
                className="btn btn-primary"
                onClick={startVerification}
                type="button"
              >
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

          {status === "verified" && verificationStatus?.isVerified && (
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
                  Verification Details
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
                    <strong>Status:</strong>{" "}
                    {verificationStatus.session?.status}
                  </div>
                  <div>
                    <strong>Assurance:</strong>{" "}
                    {verificationStatus.session?.assuranceLevel}
                  </div>
                  {verificationStatus.session?.age && (
                    <div>
                      <strong>Age:</strong> {verificationStatus.session.age}{" "}
                      years
                    </div>
                  )}
                  <div>
                    <strong>Verification ID:</strong>{" "}
                    <code style={{ fontSize: "0.8rem" }}>
                      {verificationStatus.session?.verificationId.slice(0, 8)}
                      ...
                    </code>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                <Link className="btn btn-primary" href={returnTo}>
                  Continue to {returnTo} →
                </Link>
                <button
                  className="btn btn-secondary"
                  onClick={signOut}
                  type="button"
                >
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
              <button
                className="btn btn-primary"
                onClick={startVerification}
                type="button"
              >
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
