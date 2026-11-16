import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CrewsClient from "./CrewsClient";
import LoadError from "@/components/LoadError";
import { loadProfile } from "@/lib/profile";

export default async function CrewsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { profile, error: profileError } = await loadProfile(supabase, user.id);

  // The lookup failed (network, database not set up...). Show that, with a
  // retry. Do NOT send the user to setup: they may already have a profile.
  if (profileError) {
    return (
      <LoadError
        title="Couldn't load your profile"
        message={profileError}
        retryHref="/crews"
      />
    );
  }

  // No profile row yet → first-time setup
  if (!profile) redirect("/setup");

  // Fetch user's memberships with group info
  const { data: memberships } = await supabase
    .from("members")
    .select("group_id, is_admin, groups(id, name)")
    .eq("user_id", user.id);

  const groupIds = (memberships ?? [])
    .map((m) => m.group_id)
    .filter((id): id is string => Boolean(id));

  // Count all members per group in one query
  let memberCountMap: Record<string, number> = {};
  if (groupIds.length > 0) {
    const { data: allMembers } = await supabase
      .from("members")
      .select("group_id")
      .in("group_id", groupIds);

    for (const m of allMembers ?? []) {
      if (m.group_id) {
        memberCountMap[m.group_id] = (memberCountMap[m.group_id] ?? 0) + 1;
      }
    }
  }

  const crews = (memberships ?? []).map((m) => {
    const group = m.groups as unknown as { id: string; name: string } | null;
    return {
      groupId: group?.id ?? "",
      name: group?.name ?? "",
      isAdmin: m.is_admin ?? false,
      memberCount: memberCountMap[m.group_id] ?? 0,
    };
  });

  return (
    <CrewsClient
      userId={user.id}
      initialCrews={crews}
      profile={profile}
    />
  );
}
