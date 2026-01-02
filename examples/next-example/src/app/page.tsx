import Link from "next/link";

export default function HomePage() {
  return (
    <>
      <nav className="nav">
        <Link href="/">Home</Link>
        <Link href="/dashboard">Dashboard</Link>
        <Link href="/premium">Premium</Link>
        <Link href="/adult">Adult Content</Link>
        <Link href="/verify">Verify Identity</Link>
      </nav>

      <div className="hero">
        <h1>Authbound SDK Demo</h1>
        <p style={{ maxWidth: "600px", margin: "0 auto 2rem" }}>
          This example demonstrates how to protect routes with identity and age
          verification using the Authbound Server SDK for Next.js.
        </p>
        <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
          <Link href="/verify" className="btn btn-primary">
            Start Verification
          </Link>
          <Link href="/dashboard" className="btn btn-secondary">
            Try Protected Route
          </Link>
        </div>
      </div>

      <div className="container">
        <h2>Protected Routes</h2>
        <p style={{ marginBottom: "2rem" }}>
          Try accessing these routes to see the middleware in action. You&apos;ll be
          redirected to the verification page if requirements aren&apos;t met.
        </p>

        <div className="grid">
          <div className="card feature-card">
            <span className="badge">Identity Required</span>
            <h3 style={{ marginTop: "1rem" }}>Dashboard</h3>
            <p>
              Requires basic identity verification. Any verified user can
              access.
            </p>
            <Link
              href="/dashboard"
              className="btn btn-secondary"
              style={{ marginTop: "1rem" }}
            >
              Go to Dashboard →
            </Link>
          </div>

          <div className="card feature-card">
            <span className="badge badge-warning">High Assurance</span>
            <h3 style={{ marginTop: "1rem" }}>Premium Content</h3>
            <p>
              Requires SUBSTANTIAL assurance level with document verification.
            </p>
            <Link
              href="/premium"
              className="btn btn-secondary"
              style={{ marginTop: "1rem" }}
            >
              Go to Premium →
            </Link>
          </div>

          <div className="card feature-card">
            <span className="badge badge-danger">18+ Only</span>
            <h3 style={{ marginTop: "1rem" }}>Adult Content</h3>
            <p>
              Age-gated content requiring verified age of 18 or older.
            </p>
            <Link
              href="/adult"
              className="btn btn-secondary"
              style={{ marginTop: "1rem" }}
            >
              Go to Adult →
            </Link>
          </div>
        </div>

        <div className="card" style={{ marginTop: "3rem" }}>
          <h3>How It Works</h3>
          <ol
            style={{
              marginTop: "1rem",
              paddingLeft: "1.5rem",
              color: "var(--color-text-muted)",
            }}
          >
            <li style={{ marginBottom: "0.75rem" }}>
              <strong style={{ color: "var(--color-text)" }}>Middleware checks</strong>{" "}
              - Every request to protected routes goes through the Authbound
              middleware
            </li>
            <li style={{ marginBottom: "0.75rem" }}>
              <strong style={{ color: "var(--color-text)" }}>Session validation</strong>{" "}
              - The middleware reads and validates the encrypted JWT cookie
            </li>
            <li style={{ marginBottom: "0.75rem" }}>
              <strong style={{ color: "var(--color-text)" }}>Requirements check</strong>{" "}
              - Route requirements (verified, minAge, assuranceLevel) are
              evaluated
            </li>
            <li style={{ marginBottom: "0.75rem" }}>
              <strong style={{ color: "var(--color-text)" }}>Redirect or allow</strong>{" "}
              - Users are redirected to /verify if requirements aren&apos;t met
            </li>
          </ol>
        </div>
      </div>
    </>
  );
}

