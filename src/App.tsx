import { useState, useEffect } from "react";
import { LoginPage } from "./components/LoginPage";
import { SignupPage } from "./components/SignupPage";
import { Dashboard } from "./components/Dashboard";
import { supabase } from "./utils/supabase/client";

type Page = "login" | "signup" | "dashboard";

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>("login");
  const [accessToken, setAccessToken] = useState<string | null>(
    null,
  );
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    checkExistingSession();
  }, []);

  const checkExistingSession = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.access_token) {
        setAccessToken(session.access_token);
        setCurrentPage("dashboard");
      }
    } catch (error) {
      console.error("Error checking session:", error);
    } finally {
      setCheckingSession(false);
    }
  };

  const handleLogin = (token: string) => {
    setAccessToken(token);
    setCurrentPage("dashboard");
  };

  const handleLogout = () => {
    setAccessToken(null);
    setCurrentPage("login");
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {currentPage === "login" && (
        <LoginPage
          onLogin={handleLogin}
          onNavigateToSignup={() => setCurrentPage("signup")}
        />
      )}

      {currentPage === "signup" && (
        <SignupPage
          onNavigateToLogin={() => setCurrentPage("login")}
        />
      )}

      {currentPage === "dashboard" && accessToken && (
        <Dashboard
          accessToken={accessToken}
          onLogout={handleLogout}
        />
      )}
    </div>
  );
}