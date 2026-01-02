import Link from "next/link";
import { cookies } from "next/headers";
import { getSessionFromToken } from "@authbound/server/next";
import { authboundConfig } from "@/authbound.config";

export default async function AdultPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("__authbound")?.value;
  
  let session = null;
  if (token) {
    session = await getSessionFromToken(token, authboundConfig.secret);
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
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "2rem" }}>
          <h1>Adult Content</h1>
          <span className="badge badge-danger">
            18+ Verified
          </span>
        </div>

        <div className="card" style={{ marginBottom: "2rem" }}>
          <h3>✅ Age Verified Access</h3>
          <p style={{ marginTop: "1rem" }}>
            Your age has been verified through document verification.
            You have access to age-restricted content.
          </p>
        </div>

        {session && session.age && (
          <div className="card">
            <h3>Age Verification Details</h3>
            <div style={{ marginTop: "1rem" }}>
              <p>
                <strong>Verified Age:</strong>{" "}
                <span style={{ color: "var(--color-success)", fontSize: "1.25rem", fontWeight: "700" }}>
                  {session.age} years old
                </span>
              </p>
              {session.dateOfBirth && (
                <p style={{ marginTop: "0.5rem" }}>
                  <strong>Date of Birth:</strong>{" "}
                  <span>{session.dateOfBirth}</span>
                </p>
              )}
              <p style={{ marginTop: "0.5rem", fontSize: "0.9rem", color: "var(--color-text-muted)" }}>
                Age calculated from verified identity document.
              </p>
            </div>
          </div>
        )}

        <div
          style={{
            marginTop: "2rem",
            padding: "3rem",
            background: "linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(99, 102, 241, 0.1))",
            borderRadius: "var(--radius)",
            textAlign: "center",
          }}
        >
          <h2>Age-Restricted Content</h2>
          <p style={{ marginTop: "1rem" }}>
            This area contains content that is only accessible to users
            who have verified they are 18 years or older.
          </p>
        </div>
      </div>
    </>
  );
}

