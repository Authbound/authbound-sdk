import { getVerificationFromToken } from "@authbound/nextjs/server";
import { AuthboundClient, verifyClaimsDigest } from "@authbound/server";
import { cookies } from "next/headers";
import Link from "next/link";
import { authboundConfig } from "@/authbound.config";

/**
 * Claims are pulled from the secret-key result, never from webhooks, and are
 * readable for 15 minutes after the verification completes. The result token
 * commits to them through its claims_sha256 digest.
 */
async function readVerifiedClaims(verificationId: string) {
  const client = new AuthboundClient({
    apiKey: authboundConfig.apiKey,
    apiUrl: authboundConfig.apiUrl,
  });
  const result = await client.verifications.getResult(verificationId);
  if (!(result.claims && result.claimsSalt)) {
    return { claimsStatus: result.claimsStatus };
  }
  const digestVerified = await verifyClaimsDigest(
    result.claims,
    result.claimsSalt,
    result.resultToken
  );
  return {
    claimsStatus: result.claimsStatus,
    digestVerified,
    claims: digestVerified ? result.claims : undefined,
  };
}

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("__authbound")?.value;

  let verification = null;
  if (token) {
    verification = await getVerificationFromToken(
      token,
      authboundConfig.secret
    );
  }
  const verifiedClaims = verification
    ? await readVerifiedClaims(verification.verificationId)
    : null;

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
          <h1>Dashboard</h1>
          <span className="badge badge-success">
            <span className="status-indicator verified" />
            Verified
          </span>
        </div>

        <div className="card" style={{ marginBottom: "2rem" }}>
          <h3>Welcome!</h3>
          <p style={{ marginTop: "1rem" }}>
            You&apos;ve successfully passed identity verification and can now
            access this protected dashboard.
          </p>
        </div>

        {verification && (
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
                <p style={{ fontSize: "0.85rem", marginBottom: "0.25rem" }}>
                  Status
                </p>
                <p style={{ color: "var(--color-success)", fontWeight: "600" }}>
                  {verification.status}
                </p>
              </div>
              <div>
                <p style={{ fontSize: "0.85rem", marginBottom: "0.25rem" }}>
                  Assurance Level
                </p>
                <p style={{ color: "var(--color-text)", fontWeight: "600" }}>
                  {verification.assuranceLevel}
                </p>
              </div>
              <div>
                <p style={{ fontSize: "0.85rem", marginBottom: "0.25rem" }}>
                  Expires
                </p>
                <p style={{ color: "var(--color-text)", fontWeight: "600" }}>
                  {new Date(verification.expiresAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>
        )}

        {verifiedClaims && (
          <div className="card" style={{ marginTop: "2rem" }}>
            <h3>Verified Claims</h3>
            <p style={{ marginTop: "0.5rem" }}>
              Claims status: <code>{verifiedClaims.claimsStatus}</code>
              {verifiedClaims.digestVerified !== undefined && (
                <>
                  {" "}
                  · Claims digest:{" "}
                  <code id="claims-digest">
                    {verifiedClaims.digestVerified ? "verified" : "mismatch"}
                  </code>
                </>
              )}
            </p>
            {verifiedClaims.claims && (
              <pre id="verified-claims" style={{ marginTop: "1rem" }}>
                {JSON.stringify(verifiedClaims.claims, null, 2)}
              </pre>
            )}
          </div>
        )}

        <div className="grid" style={{ marginTop: "2rem" }}>
          <Link
            className="card feature-card"
            href="/premium"
            style={{ textDecoration: "none" }}
          >
            <span className="badge badge-warning">Requires Substantial</span>
            <h3 style={{ marginTop: "1rem", color: "var(--color-text)" }}>
              Premium Content
            </h3>
            <p>Access exclusive content with higher assurance.</p>
          </Link>

          <Link
            className="card feature-card"
            href="/adult"
            style={{ textDecoration: "none" }}
          >
            <span className="badge badge-danger">18+ Only</span>
            <h3 style={{ marginTop: "1rem", color: "var(--color-text)" }}>
              Adult Content
            </h3>
            <p>Age-verified content for users 18 and older.</p>
          </Link>
        </div>
      </div>
    </>
  );
}
