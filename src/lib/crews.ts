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
