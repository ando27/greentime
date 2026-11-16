import type { SupabaseClient } from "@supabase/supabase-js";
import { friendlyError, isDuplicateError } from "./errors";

export interface Crew {
  groupId: string;
  name: string;
  isAdmin: boolean;
  memberCount: number;
}

/**
 * Loads every crew the user belongs to, with a member count for each.
 * Works with both the browser client and the server client.
 */
export async function loadCrews(
  supabase: SupabaseClient,
  userId: string
): Promise<{ crews: Crew[]; error: string | null }> {
  const { data: memberships, error } = await supabase
    .from("members")
    .select("*, groups(*)")
    .eq("user_id", userId);

  if (error) {
    return { crews: [], error: friendlyError(error, "Couldn't load your crews.") };
  }

  const rows = (memberships ?? []) as Array<{
    group_id: string;
    is_admin: boolean | null;
    groups: { id: string; name: string } | null;
  }>;

  // Skip any membership whose crew could not be read
  const valid = rows.filter((m) => m.groups?.id);
  const groupIds = valid.map((m) => m.group_id);

  // Count all members per crew in one query
  const memberCount: Record<string, number> = {};
  if (groupIds.length > 0) {
    const { data: allMembers, error: countError } = await supabase
      .from("members")
      .select("group_id")
      .in("group_id", groupIds);

    if (countError) {
      return {
        crews: [],
        error: friendlyError(countError, "Couldn't load your crews."),
      };
    }
    for (const m of (allMembers ?? []) as Array<{ group_id: string }>) {
      memberCount[m.group_id] = (memberCount[m.group_id] ?? 0) + 1;
    }
  }

  const crews = valid
    .map((m) => ({
      groupId: m.groups!.id,
      name: m.groups!.name,
      isAdmin: m.is_admin ?? false,
      memberCount: memberCount[m.group_id] ?? 1,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { crews, error: null };
}

export interface JoinResult {
  groupId: string;
  groupName: string;
  /** true when the user was already a member and the existing row was reused */
  alreadyMember: boolean;
}

interface JoinProfile {
  displayName: string;
  homeLat: number | null;
  homeLng: number | null;
  homeLabel: string | null;
}

/**
 * Joins a crew by invite code. Never creates a second member row for the same
 * user in the same crew:
 *  - already a member → reuse that row and enter the crew
 *  - existing row has no location but the profile does → copy it over
 *  - the database unique constraint (group_id, user_id) is the backstop
 * Throws an Error with a readable message on failure.
 */
export async function joinCrewByCode(
  supabase: SupabaseClient,
  userId: string,
  profile: JoinProfile,
  rawCode: string
): Promise<JoinResult> {
  const code = rawCode.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) {
    throw new Error("Invite codes are 6 letters or numbers.");
  }

  // 1. Find the crew
  const { data: group, error: groupError } = await supabase
    .from("groups")
    .select("id, name")
    .eq("invite_code", code)
    .maybeSingle();
  if (groupError) throw new Error(friendlyError(groupError));
  if (!group) throw new Error("Crew not found. Check the code and try again.");

  const findExisting = () =>
    supabase
      .from("members")
      .select("id, home_lat, home_lng")
      .eq("group_id", group.id)
      .eq("user_id", userId)
      .maybeSingle();

  // 2. Already a member? Reuse the row.
  let { data: existing, error: existingError } = await findExisting();
  if (existingError) throw new Error(friendlyError(existingError));

  if (!existing) {
    // 3. Not a member yet → add the row
    const { error: insertError } = await supabase.from("members").insert({
      group_id: group.id,
      user_id: userId,
      name: profile.displayName,
      is_admin: false,
      home_lat: profile.homeLat,
      home_lng: profile.homeLng,
      home_label: profile.homeLabel,
    });

    if (!insertError) {
      return { groupId: group.id, groupName: group.name, alreadyMember: false };
    }
    // Lost a race with another tab/tap: the constraint blocked a duplicate,
    // which means the row exists now. Fall through and reuse it.
    if (!isDuplicateError(insertError)) {
      throw new Error(friendlyError(insertError, "Couldn't join the crew."));
    }
    ({ data: existing, error: existingError } = await findExisting());
    if (existingError) throw new Error(friendlyError(existingError));
  }

  // 4. Existing row has no location but the profile does → copy it over
  const rowHasLocation =
    existing?.home_lat != null && existing?.home_lng != null;
  const profileHasLocation = profile.homeLat != null && profile.homeLng != null;
  if (existing && !rowHasLocation && profileHasLocation) {
    const { error: copyError } = await supabase
      .from("members")
      .update({
        home_lat: profile.homeLat,
        home_lng: profile.homeLng,
        home_label: profile.homeLabel,
      })
      .eq("id", existing.id);
    if (copyError) {
      throw new Error(
        "You're in the crew, but your home location couldn't be copied over: " +
          friendlyError(copyError)
      );
    }
  }

  return { groupId: group.id, groupName: group.name, alreadyMember: true };
}
