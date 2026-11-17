"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import LocationInput from "@/components/LocationInput";
import { useToast } from "@/components/Toast";
import { saveProfile, type HomeLocation, type UserProfile } from "@/lib/profile";
import { friendlyError } from "@/lib/errors";

interface Props {
  userId: string;
  /** true for a guest (anonymous sign-in) who hasn't added an email yet */
  isGuest: boolean;
  initialProfile: UserProfile;
  onClose: () => void;
  onSuccess: (updated: UserProfile, accountSaved: boolean) => void;
}

const inputCls =
  "w-full rounded-lg bg-[#1a3a2a] border border-[#2d5040] text-white placeholder-[#4d7a5d] px-4 py-3 text-sm outline-none focus:border-[#4ade80] focus:ring-1 focus:ring-[#4ade80] transition-colors";

export default function ProfileModal({
  userId,
  isGuest,
  initialProfile,
  onClose,
  onSuccess,
}: Props) {
  const supabase = createClient();
  const toast = useToast();

  const [displayName, setDisplayName] = useState(initialProfile.displayName);
  const [selectedLocation, setSelectedLocation] = useState<HomeLocation | null>(
    initialProfile.homeLat != null &&
      initialProfile.homeLng != null &&
      initialProfile.homeLabel
      ? {
          lat: initialProfile.homeLat,
          lng: initialProfile.homeLng,
          label: initialProfile.homeLabel,
        }
      : null
  );
  const [locationText, setLocationText] = useState(
    initialProfile.homeLabel ?? ""
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  // Guests only: the email to attach to this account
  const [guestEmail, setGuestEmail] = useState("");

  const handleClose = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && handleClose();
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [handleClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const trimmedName = displayName.trim();
    if (!trimmedName) {
      setError("Display name is required.");
      return;
    }
    // Text typed but never picked from the list would be silently dropped
    if (locationText.trim() && !selectedLocation) {
      setError(
        "Pick your home location from the suggestions, or clear the box to remove it."
      );
      return;
    }

    // A guest saving their account needs both an email and a password
    const savingGuestAccount = isGuest && guestEmail.trim() !== "";
    if (savingGuestAccount) {
      if (!/^\S+@\S+\.\S+$/.test(guestEmail.trim())) {
        setError("Enter a valid email address.");
        return;
      }
      if (!newPassword) {
        setError("Choose a password to go with your email.");
        return;
      }
    } else if (isGuest && newPassword) {
      setError("Enter your email to save your account.");
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
      // 1. Save the profile, then re-read it to confirm it stuck
      const saved = await saveProfile(
        supabase,
        userId,
        trimmedName,
        selectedLocation
      );

      // 2. Copy name + location onto every crew membership, so Meet in the
      //    Middle uses the new location in every crew. .select() returns the
      //    rows that changed, so a blocked update can't pass silently.
      const { data: updatedRows, error: memberError } = await supabase
        .from("members")
        .update({
          name: saved.displayName,
          home_lat: saved.homeLat,
          home_lng: saved.homeLng,
          home_label: saved.homeLabel,
        })
        .eq("user_id", userId)
        .select("id");
      if (memberError) {
        throw new Error(
          "Profile saved, but your crews couldn't be updated: " +
            friendlyError(memberError)
        );
      }

      let accountNote = "";
      if (savingGuestAccount) {
        // Turns the guest into a normal account. Same user, so crews,
        // availability and RSVPs all stay.
        const { data: upgraded, error: upgradeError } =
          await supabase.auth.updateUser({
            email: guestEmail.trim(),
            password: newPassword,
          });
        if (upgradeError) {
          throw new Error(
            "Profile saved, but your account couldn't be saved: " +
              friendlyError(upgradeError)
          );
        }
        accountNote =
          upgraded.user?.email === guestEmail.trim()
            ? ` Account saved: sign in with ${guestEmail.trim()} from now on.`
            : ` Check ${guestEmail.trim()} for a link to confirm your email.`;
      } else if (newPassword) {
        const { error: pwError } = await supabase.auth.updateUser({
          password: newPassword,
        });
        if (pwError) {
          throw new Error(
            "Profile saved, but the password wasn't changed: " +
              friendlyError(pwError)
          );
        }
      }

      const crewCount = updatedRows?.length ?? 0;
      const crewNote =
        crewCount > 0
          ? ` Updated in ${crewCount} ${crewCount === 1 ? "crew" : "crews"}.`
          : "";
      toast.success(
        (saved.homeLabel
          ? `Saved. Home location: ${saved.homeLabel}.${crewNote}`
          : `Saved. No home location set.${crewNote}`) + accountNote
      );
      onSuccess(saved, savingGuestAccount);
    } catch (err) {
      setError(friendlyError(err, "Couldn't save your profile."));
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

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="profileLocation"
              className="text-sm font-medium text-white/70"
            >
              Home location
            </label>
            <LocationInput
              id="profileLocation"
              value={selectedLocation}
              onChange={(location, text) => {
                setSelectedLocation(location);
                setLocationText(text);
              }}
            />
            <p className="text-xs text-[#4d7a5d]">
              Used for Meet in the Middle in all your crews.
            </p>
          </div>

          {isGuest ? (
            /* Guests: attach an email + password to keep this account */
            <div className="flex flex-col gap-3 rounded-lg border border-amber-400/30 bg-amber-400/5 p-3">
              <div>
                <p className="text-sm font-medium text-amber-300">
                  You&apos;re using a guest account
                </p>
                <p className="text-xs text-[#4d7a5d] mt-0.5">
                  Add an email and password to keep your crews and sign in on
                  other devices. Nothing you&apos;ve done is lost.
                </p>
              </div>
              <input
                type="email"
                inputMode="email"
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                aria-label="Email"
                className={inputCls}
              />
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Password (at least 8 characters)"
                autoComplete="new-password"
                aria-label="Password"
                className={inputCls}
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                autoComplete="new-password"
                aria-label="Confirm password"
                className={inputCls}
              />
            </div>
          ) : (
          <>
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
          </>
          )}

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
