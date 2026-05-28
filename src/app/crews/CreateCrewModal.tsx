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

function generateCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from(
    { length: 6 },
    () => chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

export default function CreateCrewModal({ userId, profile, onClose }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [name, setName] = useState("");
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

  async function getUniqueCode(): Promise<string> {
    for (let i = 0; i < 10; i++) {
      const code = generateCode();
      const { data } = await supabase
        .from("groups")
        .select("id")
        .eq("invite_code", code)
        .maybeSingle();
      if (!data) return code;
    }
    throw new Error("Could not generate a unique invite code. Try again.");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Crew name is required.");
      return;
    }

    setLoading(true);

    try {
      const inviteCode = await getUniqueCode();

      const { data: group, error: groupError } = await supabase
        .from("groups")
        .insert({ name: trimmedName, invite_code: inviteCode })
        .select("id")
        .single();

      if (groupError || !group) throw groupError ?? new Error("Insert failed");

      const { error: memberError } = await supabase.from("members").insert({
        group_id: group.id,
        user_id: userId,
        name: profile.displayName,
        is_admin: true,
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
          <h2 className="text-white font-semibold text-lg">Create a Crew</h2>
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
              htmlFor="crewName"
              className="text-sm font-medium text-white/70"
            >
              Crew name
            </label>
            <input
              id="crewName"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Augusta Regulars"
              autoFocus
              className="w-full rounded-lg bg-[#1a3a2a] border border-[#2d5040] text-white placeholder-[#4d7a5d] px-4 py-3 text-sm outline-none focus:border-[#4ade80] focus:ring-1 focus:ring-[#4ade80] transition-colors"
            />
          </div>

          <p className="text-xs text-[#4d7a5d] -mt-2">
            A 6-character invite code will be generated automatically.
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
              disabled={loading}
              className="flex-1 bg-[#4ade80] text-[#0f2018] font-semibold text-sm py-3 rounded-lg hover:bg-[#6ee7a0] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Creating…" : "Create Crew"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
