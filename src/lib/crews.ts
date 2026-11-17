import type { SupabaseClient } from "@supabase/supabase-js";
import { friendlyError } from "./errors";

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

/**
 * Joins a crew by invite code, through the database function
 * join_group_by_code (see supabase/schema.sql). The function finds the crew
 * and adds the member row in one step, which is what lets a non-member join
 * even though non-members cannot read the groups table.
 *
 * It never creates a second member row for the same user in the same crew:
 * an existing membership is reused, and its home location is filled in from
 * the profile if it was empty.
 * Throws an Error with a readable message on failure.
 */
export async function joinCrewByCode(
  supabase: SupabaseClient,
  rawCode: string
): Promise<JoinResult> {
  const code = rawCode.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) {
    throw new Error("Invite codes are 6 letters or numbers.");
  }

  const { data, error } = await supabase.rpc("join_group_by_code", {
    p_code: code,
  });
  if (error) throw new Error(friendlyError(error, "Couldn't join the crew."));

  const row = (Array.isArray(data) ? data[0] : data) as
    | { group_id: string; group_name: string; already_member: boolean }
    | undefined;
  if (!row?.group_id) throw new Error("Couldn't join the crew. Please try again.");

  return {
    groupId: row.group_id,
    groupName: row.group_name,
    alreadyMember: row.already_member,
  };
}

/**
 * Creates a crew through the database function create_group: it makes the
 * crew, generates the invite code, and adds the caller as its admin, all in
 * one step. Returns the new crew's id.
 * Throws an Error with a readable message on failure.
 */
export async function createCrew(
  supabase: SupabaseClient,
  name: string
): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Crew name is required.");
  if (trimmed.length > 80) throw new Error("Crew name must be 80 characters or fewer.");

  const { data, error } = await supabase.rpc("create_group", { p_name: trimmed });
  if (error) throw new Error(friendlyError(error, "Couldn't create the crew."));
  if (typeof data !== "string" || !data) {
    throw new Error("Couldn't create the crew. Please try again.");
  }
  return data;
}

export interface InvitePreview {
  groupId: string;
  groupName: string;
  memberCount: number;
  alreadyMember: boolean;
}

/**
 * Looks up a crew by invite code without joining it (for the invite page).
 * Returns null when the code matches no crew.
 */
export async function getInvitePreview(
  supabase: SupabaseClient,
  code: string
): Promise<{ preview: InvitePreview | null; error: string | null }> {
  const { data, error } = await supabase.rpc("get_invite_preview", {
    p_code: code,
  });
  if (error) {
    return { preview: null, error: friendlyError(error, "Couldn't open the invite.") };
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    | { group_id: string; group_name: string; member_count: number; already_member: boolean }
    | undefined;
  if (!row?.group_id) return { preview: null, error: null };
  return {
    preview: {
      groupId: row.group_id,
      groupName: row.group_name,
      memberCount: row.member_count,
      alreadyMember: row.already_member,
    },
    error: null,
  };
}
