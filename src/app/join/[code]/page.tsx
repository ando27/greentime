import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadProfile } from "@/lib/profile";
import { friendlyError } from "@/lib/errors";
import AuthCard, { authButtonCls } from "@/components/AuthCard";
import JoinInvite from "./JoinInvite";

// Invite link landing page: /join/ABC123
// Signed out → the proxy sends the visitor to /login and brings them back here.
// No profile yet → setup first, then back here.
export default async function JoinPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: rawCode } = await params;
  const code = decodeURIComponent(rawCode).trim().toUpperCase();
  const here = `/join/${encodeURIComponent(code)}`;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(here)}`);

  const problem = (title: string, message: string) => (
    <AuthCard subtitle="Crew invite">
      <div className="text-center" role="alert">
        <h2 className="text-white font-semibold text-lg mb-2">{title}</h2>
        <p className="text-[#4d7a5d] text-sm mb-6 break-words">{message}</p>
        <Link href="/crews" className={authButtonCls + " block text-center"}>
          Go to My Crews
        </Link>
      </div>
    </AuthCard>
  );

  if (!/^[A-Z0-9]{6}$/.test(code)) {
    return problem(
      "That invite link isn't valid",
      "Invite codes are 6 letters or numbers. Ask for a fresh link."
    );
  }

  const { profile, error: profileError } = await loadProfile(supabase, user.id);
  if (profileError) return problem("Couldn't load your profile", profileError);
  if (!profile) redirect(`/setup?next=${encodeURIComponent(here)}`);

  const { data: group, error: groupError } = await supabase
    .from("groups")
    .select("id, name")
    .eq("invite_code", code)
    .maybeSingle();
  if (groupError) return problem("Couldn't open the invite", friendlyError(groupError));
  if (!group) {
    return problem(
      "Crew not found",
      "This invite link doesn't match any crew. It may have been mistyped, or the crew was deleted."
    );
  }

  // Already in this crew → go straight in
  const { data: existing, error: existingError } = await supabase
    .from("members")
    .select("id")
    .eq("group_id", group.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (existingError) return problem("Couldn't open the invite", friendlyError(existingError));
  if (existing) redirect(`/crews/${group.id}`);

  const { count } = await supabase
    .from("members")
    .select("id", { count: "exact", head: true })
    .eq("group_id", group.id);

  return (
    <AuthCard subtitle="Crew invite">
      <JoinInvite
        userId={user.id}
        profile={profile}
        code={code}
        crewName={group.name}
        memberCount={count ?? 0}
      />
    </AuthCard>
  );
}
