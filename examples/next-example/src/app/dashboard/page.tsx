import Link from "next/link";
import { cookies } from "next/headers";
import { getSessionFromToken } from "@authbound/server/next";
import { authboundConfig } from "@/authbound.config";

export default async function DashboardPage() {
  // Get session from cookie (server-side)
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
          <h1>Dashboard</h1>
          <span className="badge badge-success">
            <span className="status-indicator verified" />
            Verified
          </span>
        </div>

        <div className="card" style={{ marginBottom: "2rem" }}>
          <h3>Welcome!</h3>
          <p style={{ marginTop: "1rem" }}>
            You&apos;ve successfully passed identity verification and can now access
            this protected dashboard.
          </p>
        </div>

        {session && (
          <div className="card">
            <h3>Your Verification Details</h3>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "1.5rem",
                marginTop: "1.5rem",
              }}
            >
              <div>
                <p style={{ fontSize: "0.85rem", marginBottom: "0.25rem" }}>Status</p>
                <p style={{ color: "var(--color-success)", fontWeight: "600" }}>
                  {session.status}
                </p>
              </div>
              <div>
                <p style={{ fontSize: "0.85rem", marginBottom: "0.25rem" }}>Assurance Level</p>
                <p style={{ color: "var(--color-text)", fontWeight: "600" }}>
                  {session.assuranceLevel}
                </p>
              </div>
              {session.age && (
                <div>
                  <p style={{ fontSize: "0.85rem", marginBottom: "0.25rem" }}>Age</p>
                  <p style={{ color: "var(--color-text)", fontWeight: "600" }}>
                    {session.age} years old
                  </p>
                </div>
              )}
              <div>
                <p style={{ fontSize: "0.85rem", marginBottom: "0.25rem" }}>Expires</p>
                <p style={{ color: "var(--color-text)", fontWeight: "600" }}>
                  {new Date(session.expiresAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="grid" style={{ marginTop: "2rem" }}>
          <Link href="/premium" className="card feature-card" style={{ textDecoration: "none" }}>
            <span className="badge badge-warning">Requires Substantial</span>
            <h3 style={{ marginTop: "1rem", color: "var(--color-text)" }}>Premium Content</h3>
            <p>Access exclusive content with higher assurance.</p>
          </Link>

          <Link href="/adult" className="card feature-card" style={{ textDecoration: "none" }}>
            <span className="badge badge-danger">18+ Only</span>
            <h3 style={{ marginTop: "1rem", color: "var(--color-text)" }}>Adult Content</h3>
            <p>Age-verified content for users 18 and older.</p>
          </Link>
        </div>
      </div>
    </>
  );
}

