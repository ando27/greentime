import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CrewDetail from "./CrewDetail";
import type { DBGroup, DBMember, DBEvent, DBRsvp, DBBailLog, DBAvailability } from "./types";

export default async function CrewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Group
  const { data: group } = await supabase
    .from("groups")
    .select("id, name, invite_code, favorite_courses")
    .eq("id", id)
    .single();
  if (!group) redirect("/crews");

  // Current user's member row — must be a member to view
  const { data: currentMember } = await supabase
    .from("members")
    .select("id, name, is_admin, user_id, home_lat, home_lng, home_label, joined_at")
    .eq("group_id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!currentMember) redirect("/crews");

  // All members
  const { data: members } = await supabase
    .from("members")
    .select("id, name, is_admin, user_id, home_lat, home_lng, home_label, joined_at")
    .eq("group_id", id)
    .order("joined_at", { ascending: true });

  // All events for this group
  const { data: events } = await supabase
    .from("events")
    .select(
      "id, group_id, created_by, course_name, event_date, tee_time, spots, greens_fee, cutoff_hours, notes, created_at"
    )
    .eq("group_id", id)
    .order("event_date", { ascending: true });

  const eventIds = (events ?? []).map((e) => e.id);

  // RSVPs and bail log (only if there are events)
  let rsvps: DBRsvp[] = [];
  let bailLog: DBBailLog[] = [];

  // All availability for this group (used for heatmap; filtered to currentMember in CrewDetail)
  const { data: availabilityRows } = await supabase
    .from("availability")
    .select("id, member_id, group_id, avail_date, time_of_day")
    .eq("group_id", id);

  if (eventIds.length > 0) {
    const [{ data: rsvpRows }, { data: bailRows }] = await Promise.all([
      supabase
        .from("rsvps")
        .select("id, event_id, member_id, group_id, status, auto_rsvp, confirmed_at, updated_at")
        .in("event_id", eventIds),
      supabase
        .from("bail_log")
        .select("id, event_id, member_id, group_id, bailed_at, amount_owed")
        .in("event_id", eventIds),
    ]);
    rsvps = (rsvpRows ?? []) as DBRsvp[];
    bailLog = (bailRows ?? []) as DBBailLog[];
  }

  return (
    <CrewDetail
      group={group as DBGroup}
      currentMember={currentMember as DBMember}
      initialMembers={(members ?? []) as DBMember[]}
      initialEvents={(events ?? []) as DBEvent[]}
      initialRsvps={rsvps}
      initialBailLog={bailLog}
      allAvailability={(availabilityRows ?? []) as DBAvailability[]}
      favoriteCourses={group.favorite_courses ?? []}
    />
  );
}
