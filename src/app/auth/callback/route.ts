import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safeNext";

// Magic links and "confirm your email" links land here.
// Two link styles are supported:
//   ?code=...                    default Supabase emails (must be opened in the
//                                same browser that asked for the link)
//   ?token_hash=...&type=email   custom email template (works from any device)
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(searchParams.get("next"));

  const fail = (reason: string) =>
    NextResponse.redirect(`${origin}/login?error=${reason}`);

  // Supabase sends its own error details when a link is expired or already used
  if (searchParams.get("error")) {
    return fail("link_expired");
  }

  const supabase = await createClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (error) return fail("link_expired");
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return fail("auth_failed");
  } else {
    return fail("missing_code");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return fail("auth_failed");

  // Password reset links go straight to "choose a new password", with or
  // without a profile.
  if (next.startsWith("/reset-password")) {
    return NextResponse.redirect(`${origin}${next}`);
  }

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  // Only send to setup when we KNOW there is no profile. If the lookup itself
  // failed, go on to the app, which shows the error with a retry.
  if (!profileError && !profile?.display_name) {
    const setupUrl =
      next === "/crews" ? "/setup" : `/setup?next=${encodeURIComponent(next)}`;
    return NextResponse.redirect(`${origin}${setupUrl}`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
