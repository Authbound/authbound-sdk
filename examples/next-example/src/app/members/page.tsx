import { getSessionFromToken } from "@authbound-sdk/server/next";
import { cookies } from "next/headers";
import Link from "next/link";
import { authboundConfig } from "@/authbound.config";

export default async function MembersPage() {
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
          <h1>Members Area</h1>
          <span className="badge">Low Assurance</span>
        </div>

        <div className="card" style={{ marginBottom: "2rem" }}>
          <h3>👋 Welcome, Member!</h3>
          <p style={{ marginTop: "1rem" }}>
            This area requires only LOW assurance level - basic identity
            verification with liveness check.
          </p>
        </div>

        {session && (
          <div className="card">
            <h3>Your Membership</h3>
            <div style={{ marginTop: "1rem" }}>
              <p>
                <strong>Status:</strong>{" "}
                <span className="badge badge-success">{session.status}</span>
              </p>
              <p style={{ marginTop: "0.75rem" }}>
                <strong>Assurance Level:</strong>{" "}
                <span>{session.assuranceLevel}</span>
              </p>
              <p style={{ marginTop: "0.75rem" }}>
                <strong>Member Since:</strong>{" "}
                <span>
                  {new Date(
                    session.expiresAt.getTime() - 7 * 24 * 60 * 60 * 1000
                  ).toLocaleDateString()}
                </span>
              </p>
            </div>
          </div>
        )}

        <div className="grid" style={{ marginTop: "2rem" }}>
          <div className="card feature-card">
            <h3>Community Features</h3>
            <p>Access to community forums and discussions.</p>
          </div>
          <div className="card feature-card">
            <h3>Basic Support</h3>
            <p>Email support with 48-hour response time.</p>
          </div>
          <div className="card feature-card">
            <h3>Member Resources</h3>
            <p>Access to member-only guides and tutorials.</p>
          </div>
        </div>
      </div>
    </>
  );
}
