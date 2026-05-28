"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type View = "password" | "magic";

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
      <p className="text-[#4d7a5d] text-sm">Find your crew. Book your tee.</p>
    </div>
  );
}

function InputField({
  id,
  label,
  type,
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  id: string;
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-white/70">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="w-full rounded-lg bg-[#1a3a2a] border border-[#2d5040] text-white placeholder-[#4d7a5d] px-4 py-3 text-sm outline-none focus:border-[#4ade80] focus:ring-1 focus:ring-[#4ade80] transition-colors"
      />
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [view, setView] = useState<View>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [magicSent, setMagicSent] = useState(false);

  async function checkProfileAndRedirect(userId: string) {
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("display_name")
      .eq("id", userId)
      .single();

    if (!profile?.display_name) {
      router.push("/setup");
    } else {
      router.push("/crews");
    }
  }

  async function handlePasswordSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { data, error: signInError } =
      await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    if (data.user) {
      await checkProfileAndRedirect(data.user.id);
    }
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setLoading(false);

    if (otpError) {
      setError(otpError.message);
    } else {
      setMagicSent(true);
    }
  }

  async function handleGuestSignIn() {
    setError("");
    setLoading(true);

    const { data, error: anonError } = await supabase.auth.signInAnonymously();

    if (anonError) {
      setError(anonError.message);
      setLoading(false);
      return;
    }

    if (data.user) {
      router.push("/crews");
    }
  }

  return (
    <div className="min-h-screen bg-[#1a3a2a] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <GreenTimeLogo />

        <div className="bg-[#0f2018] border border-[#2d5040] rounded-2xl p-8 shadow-2xl">
          {view === "password" && (
            <>
              {magicSent ? null : (
                <form onSubmit={handlePasswordSignIn} className="flex flex-col gap-5">
                  <InputField
                    id="email"
                    label="Email"
                    type="email"
                    value={email}
                    onChange={setEmail}
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                  <InputField
                    id="password"
                    label="Password"
                    type="password"
                    value={password}
                    onChange={setPassword}
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />

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
                    {loading ? "Signing in…" : "Sign In"}
                  </button>

                  <div className="flex items-center justify-center">
                    <Link
                      href="/signup"
                      className="text-sm text-[#4ade80] hover:text-[#6ee7a0] transition-colors"
                    >
                      Create account
                    </Link>
                  </div>
                </form>
              )}

              <div className="mt-6 flex flex-col items-center gap-2">
                <button
                  onClick={() => {
                    setView("magic");
                    setError("");
                    setMagicSent(false);
                  }}
                  className="text-xs text-[#4d7a5d] hover:text-white/60 transition-colors"
                >
                  Send me a magic link instead
                </button>
              </div>
            </>
          )}

          {view === "magic" && (
            <>
              {magicSent ? (
                <div className="flex flex-col items-center gap-4 py-2">
                  <div className="w-12 h-12 rounded-full bg-[#4ade80]/10 border border-[#4ade80]/30 flex items-center justify-center">
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 20 20"
                      fill="none"
                      className="text-[#4ade80]"
                    >
                      <path
                        d="M3 10l5 5 9-9"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <div className="text-center">
                    <p className="text-white font-medium text-sm mb-1">
                      Check your email
                    </p>
                    <p className="text-[#4d7a5d] text-xs">
                      We sent a magic link to{" "}
                      <span className="text-white/70">{email}</span>
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setView("password");
                      setMagicSent(false);
                    }}
                    className="text-xs text-[#4d7a5d] hover:text-white/60 transition-colors"
                  >
                    ← Back to sign in
                  </button>
                </div>
              ) : (
                <form onSubmit={handleMagicLink} className="flex flex-col gap-5">
                  <p className="text-sm text-[#4d7a5d] text-center -mt-1 mb-1">
                    Enter your email and we&apos;ll send you a one-tap link.
                  </p>

                  <InputField
                    id="magic-email"
                    label="Email"
                    type="email"
                    value={email}
                    onChange={setEmail}
                    placeholder="you@example.com"
                    autoComplete="email"
                  />

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
                    {loading ? "Sending…" : "Send Magic Link"}
                  </button>

                  <div className="flex items-center justify-center">
                    <button
                      type="button"
                      onClick={() => {
                        setView("password");
                        setError("");
                      }}
                      className="text-xs text-[#4d7a5d] hover:text-white/60 transition-colors"
                    >
                      ← Back to sign in
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>

        <div className="mt-6 flex justify-center">
          <button
            onClick={handleGuestSignIn}
            disabled={loading}
            className="text-xs text-[#4d7a5d]/60 hover:text-[#4d7a5d] transition-colors disabled:opacity-40"
          >
            Continue as guest →
          </button>
        </div>
      </div>
    </div>
  );
}
