"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { joinCrewByCode } from "@/lib/crews";
import { friendlyError } from "@/lib/errors";
import { useToast } from "@/components/Toast";
import { authButtonCls, authErrorCls } from "@/components/AuthCard";

interface Props {
  displayName: string;
  code: string;
  crewName: string;
  memberCount: number;
}

// "You've been invited to <crew>" with a Join button. Joining happens on the
// button press (not just by opening the link), so link previews and
// prefetching can never add someone to a crew.
export default function JoinInvite({
  displayName,
  code,
  crewName,
  memberCount,
}: Props) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleJoin() {
    if (loading) return;
    setError("");
    setLoading(true);
    try {
      const result = await joinCrewByCode(supabase, code);
      toast.success(
        result.alreadyMember
          ? `You're already in ${result.groupName}. Opening it.`
          : `Joined ${result.groupName}`
      );
      router.push(`/crews/${result.groupId}`);
      router.refresh();
    } catch (err) {
      setError(friendlyError(err, "Couldn't join the crew."));
      setLoading(false);
    }
  }

  return (
    <div className="text-center">
      <p className="text-[#4d7a5d] text-sm mb-1">You&apos;re invited to join</p>
      <h2
        className="text-white text-3xl mb-1 break-words"
        style={{ fontFamily: "var(--font-instrument-serif)" }}
      >
        {crewName}
      </h2>
      <p className="text-[#4d7a5d] text-sm mb-6">
        {memberCount} {memberCount === 1 ? "member" : "members"} · joining as{" "}
        <span className="text-white/70">{displayName}</span>
      </p>

      {error && (
        <p className={authErrorCls + " mb-4 text-left"} role="alert">
          {error}
        </p>
      )}

      <button onClick={handleJoin} disabled={loading} className={authButtonCls}>
        {loading ? "Joining…" : "Join crew"}
      </button>
      <Link
        href="/crews"
        className="block mt-4 text-sm text-[#4d7a5d] hover:text-white/60 transition-colors py-2"
      >
        Not now
      </Link>
    </div>
  );
}
