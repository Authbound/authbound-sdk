import { getVerificationFromToken } from "@authbound/nextjs/server";
import { cookies } from "next/headers";
import Link from "next/link";
import { authboundConfig } from "@/authbound.config";

export default async function AdultPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("__authbound")?.value;

  let verification = null;
  if (token) {
    verification = await getVerificationFromToken(
      token,
      authboundConfig.secret
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

      <div className="container">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "1rem",
            marginBottom: "2rem",
          }}
        >
          <h1>Adult Content</h1>
          <span className="badge badge-danger">18+ Verified</span>
        </div>

        <div className="card" style={{ marginBottom: "2rem" }}>
          <h3>✅ Age Verified Access</h3>
          <p style={{ marginTop: "1rem" }}>
            Your wallet has proven that you are at least 18. You have access to
            age-restricted content.
          </p>
        </div>

        {verification?.ageClaims && (
          <div className="card">
            <h3>Disclosed Age Claims</h3>
            <pre style={{ marginTop: "1rem" }}>
              {JSON.stringify(verification.ageClaims, null, 2)}
            </pre>
            <p
              style={{
                marginTop: "0.5rem",
                fontSize: "0.9rem",
                color: "var(--color-text-muted)",
              }}
            >
              The route checks these claims exactly as your wallet disclosed
              them.
            </p>
          </div>
        )}

        <div
          style={{
            marginTop: "2rem",
            padding: "3rem",
            background:
              "linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(99, 102, 241, 0.1))",
            borderRadius: "var(--radius)",
            textAlign: "center",
          }}
        >
          <h2>Age-Restricted Content</h2>
          <p style={{ marginTop: "1rem" }}>
            This area contains content that is only accessible to users who have
            verified they are 18 years or older.
          </p>
        </div>
      </div>
    </>
  );
}
