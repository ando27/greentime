"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { UserProfile } from "./CrewsClient";

interface Props {
  userId: string;
  profile: UserProfile;
  onClose: () => void;
}

export default function JoinCrewModal({ userId, profile, onClose }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleClose = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [handleClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const trimmedCode = code.trim().toUpperCase();
    if (trimmedCode.length !== 6) {
      setError("Invite codes are 6 characters.");
      return;
    }

    setLoading(true);

    try {
      // Look up group by invite code
      const { data: group, error: groupError } = await supabase
        .from("groups")
        .select("id, name")
        .eq("invite_code", trimmedCode)
        .single();

      if (groupError || !group) {
        throw new Error("Crew not found. Check the code and try again.");
      }

      // Check if already a member
      const { data: existing } = await supabase
        .from("members")
        .select("id")
        .eq("group_id", group.id)
        .eq("user_id", userId)
        .maybeSingle();

      if (existing) {
        throw new Error("You're already a member of this crew.");
      }

      // Insert member record
      const { error: memberError } = await supabase.from("members").insert({
        group_id: group.id,
        user_id: userId,
        name: profile.displayName,
        is_admin: false,
        home_lat: profile.homeLat,
        home_lng: profile.homeLng,
        home_label: profile.homeLabel,
      });

      if (memberError) throw memberError;

      router.push(`/crews/${group.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 px-4 pb-4 sm:pb-0"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div className="bg-[#0f2018] border border-[#2d5040] rounded-2xl p-7 w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-white font-semibold text-lg">Join a Crew</h2>
          <button
            onClick={handleClose}
            className="text-[#4d7a5d] hover:text-white/60 transition-colors p-1 -mr-1"
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path
                d="M4 4l10 10M14 4L4 14"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="inviteCode"
              className="text-sm font-medium text-white/70"
            >
              Invite code
            </label>
            <input
              id="inviteCode"
              type="text"
              value={code}
              onChange={(e) =>
                setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
              }
              placeholder="ABC123"
              maxLength={6}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-lg bg-[#1a3a2a] border border-[#2d5040] text-white placeholder-[#4d7a5d] px-4 py-3 text-sm tracking-widest font-mono outline-none focus:border-[#4ade80] focus:ring-1 focus:ring-[#4ade80] transition-colors uppercase"
            />
          </div>

          <p className="text-xs text-[#4d7a5d] -mt-2">
            Ask a crew admin for their 6-character invite code.
          </p>

          {error && (
            <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-3 mt-1">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 border border-[#2d5040] text-white/50 text-sm font-medium py-3 rounded-lg hover:border-[#4d7a5d] hover:text-white/70 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || code.length !== 6}
              className="flex-1 bg-[#4ade80] text-[#0f2018] font-semibold text-sm py-3 rounded-lg hover:bg-[#6ee7a0] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Joining…" : "Join Crew"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
