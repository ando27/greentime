"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { safeNext } from "@/lib/safeNext";
import { friendlyError } from "@/lib/errors";

function GreenTimeLogo() {
  return (
    <div className="flex flex-col items-center gap-2 mb-8">
      <div className="w-10 h-10 rounded-full bg-[#4ade80] flex items-center justify-center shadow-lg shadow-[#4ade80]/20">
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          className="text-[#0f2018]"
        >
          <path
            d="M10 3C6.686 3 4 5.686 4 9c0 2.21 1.197 4.14 2.98 5.19L10 17l3.02-2.81A5.994 5.994 0 0 0 16 9c0-3.314-2.686-6-6-6Z"
            fill="currentColor"
          />
          <circle cx="10" cy="9" r="2" fill="#0f2018" />
        </svg>
      </div>
      <h1
        className="text-3xl tracking-tight text-white"
        style={{ fontFamily: "var(--font-instrument-serif)" }}
      >
        GreenTime
      </h1>
    </div>
  );
}

export default function SignupPage() {
  // useSearchParams needs a Suspense boundary
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#1a3a2a]" />}>
      <SignupForm />
    </Suspense>
  );
}

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const next = safeNext(searchParams.get("next"));
  const nextQuery = next === "/crews" ? "" : `?next=${encodeURIComponent(next)}`;
  const [confirmSent, setConfirmSent] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback${nextQuery}`,
      },
    });

    if (signUpError) {
      setError(friendlyError(signUpError));
      setLoading(false);
      return;
    }

    // When "Confirm email" is on in Supabase there is no session yet: the
    // user has to click the link in their email first. Going to /setup now
    // would just bounce them back to the sign-in page.
    if (!data.session) {
      setLoading(false);
      setConfirmSent(true);
      return;
    }

    router.push(`/setup${nextQuery}`);
  }

  if (confirmSent) {
    return (
      <div className="min-h-screen bg-[#1a3a2a] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <GreenTimeLogo />
          <div className="bg-[#0f2018] border border-[#2d5040] rounded-2xl p-8 shadow-2xl text-center">
            <h2 className="text-white font-semibold text-lg mb-2">
              Check your email
            </h2>
            <p className="text-[#4d7a5d] text-sm mb-6">
              We sent a confirmation link to{" "}
              <span className="text-white/70">{email}</span>. Tap it to finish
              creating your account. If you already have an account with this
              email, sign in instead.
            </p>
            <Link
              href={`/login${nextQuery}`}
              className="text-sm text-[#4ade80] hover:text-[#6ee7a0] transition-colors"
            >
              ← Back to sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1a3a2a] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <GreenTimeLogo />

        <div className="bg-[#0f2018] border border-[#2d5040] rounded-2xl p-8 shadow-2xl">
          <h2 className="text-white font-semibold text-lg mb-6">
            Create your account
          </h2>

          <form onSubmit={handleSignup} className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-sm font-medium text-white/70">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
                className="w-full rounded-lg bg-[#1a3a2a] border border-[#2d5040] text-white placeholder-[#4d7a5d] px-4 py-3 text-sm outline-none focus:border-[#4ade80] focus:ring-1 focus:ring-[#4ade80] transition-colors"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-sm font-medium text-white/70">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                required
                className="w-full rounded-lg bg-[#1a3a2a] border border-[#2d5040] text-white placeholder-[#4d7a5d] px-4 py-3 text-sm outline-none focus:border-[#4ade80] focus:ring-1 focus:ring-[#4ade80] transition-colors"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="confirm" className="text-sm font-medium text-white/70">
                Confirm password
              </label>
              <input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                required
                className="w-full rounded-lg bg-[#1a3a2a] border border-[#2d5040] text-white placeholder-[#4d7a5d] px-4 py-3 text-sm outline-none focus:border-[#4ade80] focus:ring-1 focus:ring-[#4ade80] transition-colors"
              />
            </div>

            {error && (
              <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#4ade80] text-[#0f2018] font-semibold py-3 rounded-lg hover:bg-[#6ee7a0] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Creating account…" : "Create Account"}
            </button>

            <div className="flex items-center justify-center">
              <Link
                href={`/login${nextQuery}`}
                className="text-sm text-[#4d7a5d] hover:text-white/60 transition-colors"
              >
                Already have an account? Sign in
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
