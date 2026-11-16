"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { loadProfile, saveProfile, type HomeLocation } from "@/lib/profile";
import LocationInput from "@/components/LocationInput";
import { safeNext } from "@/lib/safeNext";
import { friendlyError } from "@/lib/errors";

export default function SetupPage() {
  const router = useRouter();
  const supabase = createClient();

  const [displayName, setDisplayName] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [selectedLocation, setSelectedLocation] = useState<HomeLocation | null>(
    null
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Who is signed in. null until we know.
  const [userId, setUserId] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  // Where to go after setup (an invite link may have sent the user here)
  function nextPage(): string {
    return safeNext(new URLSearchParams(window.location.search).get("next"));
  }

  // First-run check: signed out → /login. Profile already exists → skip this
  // screen, so setup is only ever shown once.
  useEffect(() => {
    let active = true;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!active) return;
      if (!user) {
        router.replace("/login");
        return;
      }
      setUserId(user.id);

      const { profile, error: loadError } = await loadProfile(supabase, user.id);
      if (!active) return;
      if (profile) {
        router.replace(nextPage());
        return;
      }
      if (loadError) setError(loadError);
      setChecking(false);
    })();
    return () => {
      active = false;
    };
  }, [supabase, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!displayName.trim()) {
      setError("Display name is required.");
      return;
    }

    // Location is optional, but half-typed text that was never picked from
    // the list would be silently dropped, so stop and say so.
    if (locationQuery.trim() && !selectedLocation) {
      setError(
        "Pick your home location from the suggestions, or clear the box to add it later."
      );
      return;
    }

    if (!userId) {
      setError("Still checking your sign-in. Try again in a moment.");
      return;
    }

    setIsSubmitting(true);

    try {
      // Saves, then re-reads the row to confirm it stuck before moving on
      await saveProfile(supabase, userId, displayName, selectedLocation);
    } catch (err) {
      setError(friendlyError(err, "Couldn't save your profile."));
      setIsSubmitting(false);
      return;
    }

    router.push(nextPage());
    router.refresh();
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-[#1a3a2a] flex items-center justify-center">
        <div
          className="w-6 h-6 border-2 border-[#4ade80]/30 border-t-[#4ade80] rounded-full animate-spin"
          role="status"
          aria-label="Loading"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1a3a2a] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
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
          <p className="text-[#4d7a5d] text-sm">Set up your profile</p>
        </div>

        <div className="bg-[#0f2018] border border-[#2d5040] rounded-2xl p-8 shadow-2xl">
          <p className="text-white/60 text-sm mb-6">
            Just two things before you hit the course.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="displayName"
                className="text-sm font-medium text-white/70"
              >
                Display name
              </label>
              <input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Tiger"
                autoComplete="nickname"
                className="w-full rounded-lg bg-[#1a3a2a] border border-[#2d5040] text-white placeholder-[#4d7a5d] px-4 py-3 text-sm outline-none focus:border-[#4ade80] focus:ring-1 focus:ring-[#4ade80] transition-colors"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="location"
                className="text-sm font-medium text-white/70"
              >
                Home location{" "}
                <span className="text-[#4d7a5d] font-normal">
                  (optional, used for Meet in the Middle)
                </span>
              </label>
              <LocationInput
                id="location"
                value={selectedLocation}
                onChange={(location, text) => {
                  setSelectedLocation(location);
                  setLocationQuery(text);
                }}
              />
            </div>

            {error && (
              <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-[#4ade80] text-[#0f2018] font-semibold py-3 rounded-lg hover:bg-[#6ee7a0] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-1"
            >
              {isSubmitting ? "Saving…" : "Save & Continue"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
