"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { UserProfile } from "./CrewsClient";

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

interface Props {
  userId: string;
  initialProfile: UserProfile;
  onClose: () => void;
  onSuccess: (updated: UserProfile) => void;
}

const inputCls =
  "w-full rounded-lg bg-[#1a3a2a] border border-[#2d5040] text-white placeholder-[#4d7a5d] px-4 py-3 text-sm outline-none focus:border-[#4ade80] focus:ring-1 focus:ring-[#4ade80] transition-colors";

export default function ProfileModal({
  userId,
  initialProfile,
  onClose,
  onSuccess,
}: Props) {
  const supabase = createClient();

  const [displayName, setDisplayName] = useState(initialProfile.displayName);
  const [locationQuery, setLocationQuery] = useState(
    initialProfile.homeLabel ?? ""
  );
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [selectedLocation, setSelectedLocation] =
    useState<SelectedLocation | null>(
      initialProfile.homeLat && initialProfile.homeLng && initialProfile.homeLabel
        ? {
            lat: initialProfile.homeLat,
            lng: initialProfile.homeLng,
            label: initialProfile.homeLabel,
          }
        : null
    );
  const [isSearching, setIsSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const locationRef = useRef<HTMLDivElement>(null);

  const handleClose = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && handleClose();
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [handleClose]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        locationRef.current &&
        !locationRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
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
    debounceRef.current = setTimeout(() => searchLocation(value), 300);
  }

  function handleSelectSuggestion(s: NominatimResult) {
    setLocationQuery(s.display_name);
    setSelectedLocation({
      lat: parseFloat(s.lat),
      lng: parseFloat(s.lon),
      label: s.display_name,
    });
    setSuggestions([]);
    setShowSuggestions(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const trimmedName = displayName.trim();
    if (!trimmedName) {
      setError("Display name is required.");
      return;
    }
    if (!selectedLocation) {
      setError("Please select a home location from the suggestions.");
      return;
    }
    if (newPassword) {
      if (newPassword.length < 8) {
        setError("Password must be at least 8 characters.");
        return;
      }
      if (newPassword !== confirmPassword) {
        setError("Passwords don't match.");
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const { error: rpcError } = await supabase.rpc("upsert_user_profile", {
        p_display_name: trimmedName,
        p_home_lat: selectedLocation.lat,
        p_home_lng: selectedLocation.lng,
        p_home_label: selectedLocation.label,
      });
      if (rpcError) throw rpcError;

      // Sync name + location across all the user's member rows
      const { error: memberError } = await supabase
        .from("members")
        .update({
          name: trimmedName,
          home_lat: selectedLocation.lat,
          home_lng: selectedLocation.lng,
          home_label: selectedLocation.label,
        })
        .eq("user_id", userId);
      if (memberError) throw memberError;

      if (newPassword) {
        const { error: pwError } = await supabase.auth.updateUser({ password: newPassword });
        if (pwError) throw pwError;
      }

      onSuccess({
        displayName: trimmedName,
        homeLat: selectedLocation.lat,
        homeLng: selectedLocation.lng,
        homeLabel: selectedLocation.label,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save profile.");
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 px-4 pb-4 sm:pb-0"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div className="bg-[#0f2018] border border-[#2d5040] rounded-2xl p-7 w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-white font-semibold text-lg">Edit Profile</h2>
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
              htmlFor="profileDisplayName"
              className="text-sm font-medium text-white/70"
            >
              Display name
            </label>
            <input
              id="profileDisplayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoFocus
              className={inputCls}
            />
          </div>

          <div ref={locationRef} className="relative flex flex-col gap-1.5">
            <label
              htmlFor="profileLocation"
              className="text-sm font-medium text-white/70"
            >
              Home location
            </label>
            <div className="relative">
              <input
                id="profileLocation"
                type="text"
                value={locationQuery}
                onChange={handleLocationChange}
                onFocus={() =>
                  suggestions.length > 0 && setShowSuggestions(true)
                }
                placeholder="Augusta, GA"
                autoComplete="off"
                className={inputCls + " pr-8"}
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

          {/* Password section */}
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => {
                setShowPassword((p) => !p);
                setNewPassword("");
                setConfirmPassword("");
              }}
              className="text-xs text-[#4d7a5d] hover:text-white/60 transition-colors text-left flex items-center gap-1.5"
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                fill="none"
                className={`transition-transform ${showPassword ? "rotate-180" : ""}`}
              >
                <path
                  d="M2 3.5l3 3 3-3"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {showPassword ? "Cancel password change" : "Set a password"}
            </button>
            {showPassword && (
              <div className="flex flex-col gap-3">
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="New password"
                  autoComplete="new-password"
                  className={inputCls}
                />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm password"
                  autoComplete="new-password"
                  className={inputCls}
                />
              </div>
            )}
          </div>

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
              disabled={isSubmitting}
              className="flex-1 bg-[#4ade80] text-[#0f2018] font-semibold text-sm py-3 rounded-lg hover:bg-[#6ee7a0] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
