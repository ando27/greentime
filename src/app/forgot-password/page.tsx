"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import AuthCard, {
  authButtonCls,
  authErrorCls,
  authInputCls,
} from "@/components/AuthCard";

// Step 1 of a password reset: ask for the email and send a reset link.
// The link lands on /auth/callback, which signs the user in and forwards
// them to /reset-password (step 2).
export default function ForgotPasswordPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/reset-password")}`,
      }
    );

    setLoading(false);
    if (resetError) {
      setError(friendlyError(resetError, "Couldn't send the reset link."));
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <AuthCard subtitle="Reset your password">
        <div className="text-center">
          <h2 className="text-white font-semibold text-lg mb-2">
            Check your email
          </h2>
          {/* Same message whether or not the account exists, on purpose */}
          <p className="text-[#4d7a5d] text-sm mb-6">
            If there&apos;s a GreenTime account for{" "}
            <span className="text-white/70">{email.trim()}</span>, we sent a
            link to reset the password. Open it on this device, in this
            browser.
          </p>
          <Link
            href="/login"
            className="text-sm text-[#4ade80] hover:text-[#6ee7a0] transition-colors"
          >
            ← Back to sign in
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard subtitle="Reset your password">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <p className="text-sm text-[#4d7a5d] -mt-1">
          Enter your email and we&apos;ll send you a link to choose a new
          password.
        </p>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-medium text-white/70">
            Email
          </label>
          <input
            id="email"
            type="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            autoFocus
            required
            className={authInputCls}
          />
        </div>

        {error && (
          <p className={authErrorCls} role="alert">
            {error}
          </p>
        )}

        <button type="submit" disabled={loading} className={authButtonCls}>
          {loading ? "Sending…" : "Send reset link"}
        </button>

        <div className="flex items-center justify-center">
          <Link
            href="/login"
            className="text-sm text-[#4d7a5d] hover:text-white/60 transition-colors"
          >
            ← Back to sign in
          </Link>
        </div>
      </form>
    </AuthCard>
  );
}
