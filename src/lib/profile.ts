import type { SupabaseClient } from "@supabase/supabase-js";
import { friendlyError } from "./errors";

export interface UserProfile {
  displayName: string;
  homeLat: number | null;
  homeLng: number | null;
  homeLabel: string | null;
}

export interface HomeLocation {
  lat: number;
  lng: number;
  label: string;
}

const PROFILE_COLUMNS = "display_name, home_lat, home_lng, home_label";

interface ProfileRow {
  display_name: string | null;
  home_lat: number | null;
  home_lng: number | null;
  home_label: string | null;
}

function toProfile(row: ProfileRow | null): UserProfile | null {
  if (!row?.display_name) return null;
  return {
    displayName: row.display_name,
    homeLat: row.home_lat ?? null,
    homeLng: row.home_lng ?? null,
    homeLabel: row.home_label ?? null,
  };
}

/**
 * Loads the user's profile.
 *  - profile === null and error === null → no profile yet (show setup)
 *  - error !== null → the lookup itself failed (show the error, do NOT show setup)
 */
export async function loadProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<{ profile: UserProfile | null; error: string | null }> {
  // maybeSingle(): a missing row is a normal answer, not an error
  const { data, error } = await supabase
    .from("user_profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    return { profile: null, error: friendlyError(error, "Couldn't load your profile.") };
  }
  return { profile: toProfile(data as ProfileRow | null), error: null };
}

/**
 * Saves the profile, then reads it back and checks it really saved.
 * Throws an Error with a readable message if anything went wrong.
 */
export async function saveProfile(
  supabase: SupabaseClient,
  userId: string,
  displayName: string,
  home: HomeLocation | null
): Promise<UserProfile> {
  const name = displayName.trim();

  const { error: rpcError } = await supabase.rpc("upsert_user_profile", {
    p_display_name: name,
    p_home_lat: home?.lat ?? null,
    p_home_lng: home?.lng ?? null,
    p_home_label: home?.label ?? null,
  });
  if (rpcError) {
    throw new Error(friendlyError(rpcError, "Couldn't save your profile."));
  }

  // Re-read and confirm before moving on
  const { profile, error } = await loadProfile(supabase, userId);
  if (error) throw new Error(error);

  const saved =
    profile !== null &&
    profile.displayName === name &&
    (profile.homeLabel ?? null) === (home?.label ?? null);
  if (!saved) {
    throw new Error(
      "Your profile didn't save. Please try again. If this keeps happening, sign out and back in."
    );
  }

  return profile;
}
