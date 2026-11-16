"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Sparkles, ArrowRight, ShieldCheck, Zap } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { login, signup } = useAuth();

  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isSignUp) {
        await signup({
          email,
          password,
          full_name: fullName,
          organization_name: orgName,
        });
      } else {
        await login(email, password);
      }
      router.push("/");
    } catch (err: any) {
      setError(err.message || "Failed to authenticate");
    } finally {
      setLoading(false);
    }
  };

  const handleFillDemo = () => {
    setIsSignUp(false);
    setEmail("demo@tokenwise.ai");
    setPassword("DemoPassword123!");
    setError(null);
  };

  return (
    <div className="min-h-screen bg-[#F5F0E8] flex flex-col justify-center items-center p-4 selection:bg-[#E98945]/30">
      <div className="w-full max-w-md">
        {/* Logo and Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex w-12 h-12 rounded-2xl bg-gradient-to-br from-[#E98945] to-[#D97732] items-center justify-center text-white font-bold text-xl shadow-md mb-4">
            TW
          </div>
          <h1 className="text-2xl font-bold text-[#171717] tracking-tight">
            TokenWise
          </h1>
          <p className="text-xs text-[#77716B] font-medium mt-1">
            Developer-first LLM Observability & Gateway Platform
          </p>
        </div>

        {/* Card */}
        <div className="bg-white/90 backdrop-blur-sm border border-[#E3DBD0] rounded-2xl p-8 shadow-sm">
          <div className="flex items-center justify-between border-b border-[#E3DBD0] pb-4 mb-6">
            <h2 className="text-base font-semibold text-[#171717]">
              {isSignUp ? "Create your organization" : "Sign in to TokenWise"}
            </h2>
            <button
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError(null);
              }}
              className="text-xs text-[#E98945] hover:text-[#D97732] font-semibold transition"
            >
              {isSignUp ? "Already registered?" : "New to TokenWise?"}
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-[#C94C4C] font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-[#262626] mb-1.5">
                    Your Name
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Alex Chen"
                    className="w-full text-xs bg-[#F5F0E8]/40 border border-[#E3DBD0] rounded-xl px-3.5 py-2.5 text-[#171717] focus:outline-none focus:ring-2 focus:ring-[#E98945]/40 transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#262626] mb-1.5">
                    Organization Name
                  </label>
                  <input
                    type="text"
                    required
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    placeholder="Acme AI Inc"
                    className="w-full text-xs bg-[#F5F0E8]/40 border border-[#E3DBD0] rounded-xl px-3.5 py-2.5 text-[#171717] focus:outline-none focus:ring-2 focus:ring-[#E98945]/40 transition"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-semibold text-[#262626] mb-1.5">
                Work Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="developer@company.com"
                className="w-full text-xs bg-[#F5F0E8]/40 border border-[#E3DBD0] rounded-xl px-3.5 py-2.5 text-[#171717] focus:outline-none focus:ring-2 focus:ring-[#E98945]/40 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#262626] mb-1.5">
                Password
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full text-xs bg-[#F5F0E8]/40 border border-[#E3DBD0] rounded-xl px-3.5 py-2.5 text-[#171717] focus:outline-none focus:ring-2 focus:ring-[#E98945]/40 transition"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-2.5 px-4 rounded-xl bg-[#E98945] hover:bg-[#D97732] text-white font-semibold text-xs tracking-wide shadow-sm transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                "Authenticating..."
              ) : (
                <>
                  <span>{isSignUp ? "Complete Setup" : "Sign In"}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </form>

          {/* One-click Demo Button */}
          <div className="mt-6 pt-5 border-t border-[#E3DBD0]">
            <button
              type="button"
              onClick={handleFillDemo}
              className="w-full py-2 px-3 rounded-xl bg-[#EAE1D5]/70 hover:bg-[#EAE1D5] border border-[#E3DBD0] text-xs font-semibold text-[#171717] flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#E98945]" />
              <span>Fill Seeded Demo Account</span>
            </button>
            <p className="text-[11px] text-[#77716B] text-center mt-2 font-mono">
              demo@tokenwise.ai • DemoPassword123!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
