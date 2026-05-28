"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
}

interface SelectedLocation {
  lat: number;
  lng: number;
  label: string;
}

export default function SetupPage() {
  const router = useRouter();
  const supabase = createClient();

  const [displayName, setDisplayName] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [selectedLocation, setSelectedLocation] =
    useState<SelectedLocation | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const locationRef = useRef<HTMLDivElement>(null);

  // Redirect to /login if not authenticated
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.replace("/login");
    });
  }, [supabase, router]);

  // Close suggestions on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        locationRef.current &&
        !locationRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const searchLocation = useCallback(async (query: string) => {
    if (!query.trim() || query.length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    setIsSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5`,
        { headers: { "Accept-Language": "en" } }
      );
      const data: NominatimResult[] = await res.json();
      setSuggestions(data);
      setShowSuggestions(data.length > 0);
    } catch {
      setSuggestions([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  function handleLocationChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setLocationQuery(value);
    setSelectedLocation(null);

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchLocation(value), 450);
  }

  function handleSelectSuggestion(suggestion: NominatimResult) {
    const label = suggestion.display_name;
    setLocationQuery(label);
    setSelectedLocation({
      lat: parseFloat(suggestion.lat),
      lng: parseFloat(suggestion.lon),
      label,
    });
    setSuggestions([]);
    setShowSuggestions(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!displayName.trim()) {
      setError("Display name is required.");
      return;
    }

    if (!selectedLocation) {
      setError("Please select a home location from the suggestions.");
      return;
    }

    setIsSubmitting(true);

    const { error: rpcError } = await supabase.rpc("upsert_user_profile", {
      p_display_name: displayName.trim(),
      p_home_lat: selectedLocation.lat,
      p_home_lng: selectedLocation.lng,
      p_home_label: selectedLocation.label,
    });

    if (rpcError) {
      setError(rpcError.message);
      setIsSubmitting(false);
      return;
    }

    router.push("/crews");
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

            <div ref={locationRef} className="relative flex flex-col gap-1.5">
              <label
                htmlFor="location"
                className="text-sm font-medium text-white/70"
              >
                Home location
              </label>
              <div className="relative">
                <input
                  id="location"
                  type="text"
                  value={locationQuery}
                  onChange={handleLocationChange}
                  onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                  placeholder="Augusta, GA"
                  autoComplete="off"
                  className="w-full rounded-lg bg-[#1a3a2a] border border-[#2d5040] text-white placeholder-[#4d7a5d] px-4 py-3 text-sm outline-none focus:border-[#4ade80] focus:ring-1 focus:ring-[#4ade80] transition-colors pr-8"
                />
                {isSearching && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <div className="w-4 h-4 border-2 border-[#4ade80]/30 border-t-[#4ade80] rounded-full animate-spin" />
                  </div>
                )}
                {selectedLocation && !isSearching && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 14 14"
                      fill="none"
                      className="text-[#4ade80]"
                    >
                      <path
                        d="M2 7l3.5 3.5 6.5-6.5"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                )}
              </div>

              {showSuggestions && suggestions.length > 0 && (
                <ul className="absolute top-full mt-1 left-0 right-0 z-10 bg-[#0f2018] border border-[#2d5040] rounded-lg overflow-hidden shadow-xl">
                  {suggestions.map((s, i) => (
                    <li key={i}>
                      <button
                        type="button"
                        onClick={() => handleSelectSuggestion(s)}
                        className="w-full text-left px-4 py-2.5 text-sm text-white/80 hover:bg-[#1a3a2a] hover:text-white transition-colors truncate"
                      >
                        {s.display_name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
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
