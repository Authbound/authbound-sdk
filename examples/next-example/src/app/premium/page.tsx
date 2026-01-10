import { getSessionFromToken } from "@authbound/server/next";
import { cookies } from "next/headers";
import Link from "next/link";
import { authboundConfig } from "@/authbound.config";

export default async function PremiumPage() {
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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "1rem",
            marginBottom: "2rem",
          }}
        >
          <h1>Premium Content</h1>
          <span className="badge badge-warning">Substantial Assurance</span>
        </div>

        <div className="card" style={{ marginBottom: "2rem" }}>
          <h3>🎉 High-Value Access Granted</h3>
          <p style={{ marginTop: "1rem" }}>
            You have SUBSTANTIAL assurance level verification, allowing you to
            access premium content and features that require higher trust
            levels.
          </p>
        </div>

        {session && (
          <div className="card">
            <h3>Verification Summary</h3>
            <div style={{ marginTop: "1rem" }}>
              <p>
                <strong>Assurance Level:</strong>{" "}
                <span style={{ color: "var(--color-warning)" }}>
                  {session.assuranceLevel}
                </span>
              </p>
              <p style={{ marginTop: "0.5rem" }}>
                <strong>User Reference:</strong> <code>{session.userRef}</code>
              </p>
            </div>
          </div>
        )}

        <div
          style={{
            marginTop: "2rem",
            padding: "3rem",
            background:
              "linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(99, 102, 241, 0.1))",
            borderRadius: "var(--radius)",
            textAlign: "center",
          }}
        >
          <h2>Premium Feature Placeholder</h2>
          <p style={{ marginTop: "1rem" }}>
            This is where your premium content would go. Only users with
            SUBSTANTIAL or HIGH assurance can see this.
          </p>
        </div>
      </div>
    </>
  );
}
