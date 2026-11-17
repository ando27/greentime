import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CrewsClient from "./CrewsClient";
import LoadError from "@/components/LoadError";
import { loadProfile } from "@/lib/profile";
import { loadCrews } from "@/lib/crews";

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

  const { crews, error: crewsError } = await loadCrews(supabase, user.id);

  return (
    <CrewsClient
      userId={user.id}
      initialCrews={crews}
      initialError={crewsError}
      isGuest={user.is_anonymous === true}
      profile={profile}
    />
  );
}
