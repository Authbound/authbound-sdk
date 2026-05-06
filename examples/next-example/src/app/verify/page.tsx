"use client";

import {
  AuthboundProvider,
  asPolicyId,
  VerificationWall,
} from "@authbound/nextjs/client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function VerifyContent() {
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") || "/dashboard";
  const publishableKey = process.env.NEXT_PUBLIC_AUTHBOUND_PK;
  const policyId = process.env.NEXT_PUBLIC_AUTHBOUND_POLICY_ID;
  const [verified, setVerified] = useState(false);

  const signOut = async () => {
    await fetch("/api/authbound", { method: "DELETE" });
    setVerified(false);
  };

  if (!(publishableKey && policyId)) {
    return (
      <div
        className="container"
        style={{ maxWidth: "600px", marginTop: "2rem" }}
      >
        <div className="card">
          <h2>Authbound is not configured</h2>
          <p>
            Set <code>NEXT_PUBLIC_AUTHBOUND_PK</code> and{" "}
            <code>NEXT_PUBLIC_AUTHBOUND_POLICY_ID</code> in your environment.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <nav className="nav">
        <Link href="/">Home</Link>
        <Link href="/dashboard">Dashboard</Link>
        <Link href="/premium">Premium</Link>
        <Link href="/adult">Adult Content</Link>
        <Link href="/verify">Verify Identity</Link>
      </nav>

      <AuthboundProvider
        policyId={asPolicyId(policyId)}
        publishableKey={publishableKey}
      >
        <VerificationWall
          description="Scan the QR code with your EU Digital Identity Wallet."
          onVerified={() => setVerified(true)}
          title="Identity Verification"
        >
          <div
            className="container"
            style={{ maxWidth: "600px", marginTop: "2rem" }}
          >
            <div className="card">
              <div style={{ marginBottom: "1.5rem" }}>
                <span className="status-indicator verified" />
                <span className="badge badge-success">Verified</span>
              </div>

              <h2>Verification complete</h2>
              <p style={{ marginBottom: "1.5rem" }}>
                Your same-origin Authbound session cookie has been created.
              </p>

              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                <Link className="btn btn-primary" href={returnTo}>
                  Continue to {returnTo}
                </Link>
                <button
                  className="btn btn-secondary"
                  onClick={signOut}
                  type="button"
                >
                  Sign Out
                </button>
              </div>

              {verified && returnTo !== "/dashboard" && (
                <p style={{ marginTop: "1rem", fontSize: "0.9rem" }}>
                  Return target: <code>{returnTo}</code>
                </p>
              )}
            </div>
          </div>
        </VerificationWall>
      </AuthboundProvider>
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
