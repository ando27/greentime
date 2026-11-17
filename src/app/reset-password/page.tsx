"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { useToast } from "@/components/Toast";
import AuthCard, {
  authButtonCls,
  authErrorCls,
  authInputCls,
} from "@/components/AuthCard";

// Step 2 of a password reset: the emailed link signed the user in (via
// /auth/callback) and sent them here to choose a new password.
export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();

  // null = still checking, true/false = signed in or not
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (active) setSignedIn(Boolean(data.user));
    });
    return () => {
      active = false;
    };
  }, [supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(friendlyError(updateError, "Couldn't change your password."));
      setLoading(false);
      return;
    }

    toast.success("Password changed");
    router.push("/crews");
    router.refresh();
  }

  if (signedIn === null) {
    return (
      <AuthCard subtitle="Choose a new password">
        <div className="flex justify-center py-4" role="status" aria-label="Loading">
          <div className="w-6 h-6 border-2 border-[#4ade80]/30 border-t-[#4ade80] rounded-full animate-spin" />
        </div>
      </AuthCard>
    );
  }

  // Opened without a valid reset link (expired, already used, or a different browser)
  if (!signedIn) {
    return (
      <AuthCard subtitle="Choose a new password">
        <div className="text-center">
          <h2 className="text-white font-semibold text-lg mb-2">
            That link didn&apos;t work
          </h2>
          <p className="text-[#4d7a5d] text-sm mb-6">
            Reset links expire and only work once, in the browser that
            requested them. Request a new one.
          </p>
          <Link href="/forgot-password" className={authButtonCls + " block text-center"}>
            Send a new link
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard subtitle="Choose a new password">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-sm font-medium text-white/70">
            New password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            autoComplete="new-password"
            autoFocus
            required
            className={authInputCls}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="confirm" className="text-sm font-medium text-white/70">
            Confirm new password
          </label>
          <input
            id="confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
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
          {loading ? "Saving…" : "Save new password"}
        </button>
      </form>
    </AuthCard>
  );
}
