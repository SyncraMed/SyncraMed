import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { supabase } from "../utils/supabase/client";

interface LoginPageProps {
  onLogin: (accessToken: string) => void;
  onNavigateToSignup: () => void;
}

export function LoginPage({
  onLogin,
  onNavigateToSignup,
}: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { data, error: authError } =
        await supabase.auth.signInWithPassword({
          email,
          password,
        });

      if (authError) {
        setError(authError.message);
        setLoading(false);
        return;
      }

      if (data?.session?.access_token) {
        onLogin(data.session.access_token);
      }
    } catch (err) {
      console.error("Login error:", err);
      setError("Failed to login. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          {/* 🔹 Logo + Title Row */}
          <div className="flex items-center gap-3">
            {/* <img
              src="/logo.png"
              alt="SyncraMed Logo"
              className="h-10 w-10 rounded-md object-contain"
            /> */}
            <CardTitle className="text-2xl font-semibold">
              SyncraMed
            </CardTitle>
          </div>

          <CardDescription className="mt-2">
            Login to manage your medications
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="email" className="block mb-2">
                Email
              </label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="block mb-2">
                Password
              </label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
              />
            </div>

            {error && (
              <div className="text-destructive p-3 bg-destructive/10 rounded-md">
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={loading}
            >
              {loading ? "Logging in..." : "Login"}
            </Button>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={onNavigateToSignup}
            >
              Create Account
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}