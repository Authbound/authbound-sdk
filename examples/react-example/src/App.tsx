import type { QuickIDConfig } from "@authbound/quickid-core";
import { CheckCircle, FileText, Shield, User } from "lucide-react";
import { useState } from "react";
import { KYCModal } from "./components/kyc/KYCModal";
import { useCreateSession } from "./hooks/useCreateSession";
import "./App.css";

function App() {
  const [isKYCOpen, setIsKYCOpen] = useState(false);
  const [kycStatus, setKycStatus] = useState<"idle" | "completed">("idle");
  const [clientToken, setClientToken] = useState<string>("");

  // SDK Configuration
  const quickIDConfig: QuickIDConfig = {
    apiBaseUrl:
      import.meta.env.VITE_QUICKID_API_URL || "https://api.authbound.com",
  };

  console.log("quickIDConfig", quickIDConfig);

  // React Query mutation for creating sessions
  const createSessionMutation = useCreateSession();

  const handleOpenKYC = async () => {
    // Always fetch a fresh session when starting the flow
    createSessionMutation.mutate(
      {
        customer_user_ref: `demo_user_${Date.now()}`,
      },
      {
        onSuccess: (data) => {
          setClientToken(data.client_token);
          setIsKYCOpen(true);
        },
        onError: (error) => {
          console.error("Failed to create session:", error);
          alert(
            `Failed to start verification session: ${error.message}. See console for details.`
          );
        },
      }
    );
  };

  return (
    <div className="app-container">
      {/* Mock Navigation - Represents Customer Website Header */}
      <nav className="nav-bar">
        <div className="logo">
          <div className="logo-icon">D</div>
          <span>Dokport</span>
        </div>
        <div className="nav-links">
          <a href="#">Services</a>
          <a href="#">About</a>
          <a href="#">Help</a>
        </div>
        <div className="nav-auth">
          <button className="btn-ghost">Login</button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="main-content">
        <div className="hero-section">
          <div className="hero-badge">Secure Health Portal</div>
          <h1>
            Your Health, <br />{" "}
            <span className="text-gradient">Digitally Secured.</span>
          </h1>
          <p className="hero-desc">
            Access your medical records, book appointments, and consult with
            specialists securely from home.
          </p>

          <div className="cta-group">
            {kycStatus === "completed" ? (
              <div className="success-banner">
                <CheckCircle size={20} />
                <span>Identity Verified Successfully</span>
              </div>
            ) : (
              <button
                className="btn-primary"
                disabled={createSessionMutation.isPending}
                onClick={handleOpenKYC}
              >
                <Shield className="btn-icon" size={18} />
                {createSessionMutation.isPending
                  ? "Starting..."
                  : "Verify Identity to Start"}
              </button>
            )}
            <button className="btn-secondary">Learn more</button>
          </div>

          <div className="feature-grid">
            <div className="feature-card">
              <div className="icon-box bg-blue">
                <User size={20} />
              </div>
              <h3>Patient Portal</h3>
              <p>Secure access to your history</p>
            </div>
            <div className="feature-card">
              <div className="icon-box bg-purple">
                <FileText size={20} />
              </div>
              <h3>Documents</h3>
              <p>Manage prescriptions easily</p>
            </div>
            <div className="feature-card">
              <div className="icon-box bg-green">
                <Shield size={20} />
              </div>
              <h3>Secure</h3>
              <p>Bank-level encryption</p>
            </div>
          </div>
        </div>
      </main>

      {/* The SDK Integration */}
      <KYCModal
        clientToken={clientToken}
        config={quickIDConfig}
        isOpen={isKYCOpen}
        onClose={() => setIsKYCOpen(false)}
        onComplete={() => {
          setIsKYCOpen(false);
          setKycStatus("completed");
        }}
      />
    </div>
  );
}

export default App;
