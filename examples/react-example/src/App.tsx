import { useState } from "react";
import { Shield, CheckCircle, User, FileText } from "lucide-react";
import { KYCModal } from "./components/kyc/KYCModal";
import type { QuickIDConfig } from "@authbound/quickid-core";
import "./App.css";

function App() {
  const [isKYCOpen, setIsKYCOpen] = useState(false);
  const [kycStatus, setKycStatus] = useState<"idle" | "completed">("idle");

  // SDK Configuration
  // TODO: Replace with your actual API endpoint and upload function
  const quickIDConfig: QuickIDConfig = {
    apiBaseUrl:
      import.meta.env.VITE_QUICKID_API_URL || "https://api.authbound.com",
    token: import.meta.env.VITE_QUICKID_API_KEY,
    upload: async (file: File): Promise<string> => {
      // TODO: Implement your file upload logic
      // This should upload the file to your storage (S3, R2, etc.) and return a URL
      // Example:
      // const formData = new FormData();
      // formData.append('file', file);
      // const response = await fetch('/api/upload', { method: 'POST', body: formData });
      // const { url } = await response.json();
      // return url;

      // For now, return a mock URL
      return `https://example.com/uploads/${file.name}`;
    },
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
                onClick={() => setIsKYCOpen(true)}
              >
                <Shield size={18} className="btn-icon" />
                Verify Identity to Start
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
        isOpen={isKYCOpen}
        onClose={() => setIsKYCOpen(false)}
        onComplete={() => {
          setIsKYCOpen(false);
          setKycStatus("completed");
        }}
        config={quickIDConfig}
      />
    </div>
  );
}

export default App;
