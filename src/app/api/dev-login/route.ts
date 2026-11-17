import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// One-tap test login, for development only.
//
// It signs in as the account named in DEV_LOGIN_EMAIL / DEV_LOGIN_PASSWORD.
// It is a shortcut for typing that email and password, not a way around
// sign-in: the account is a normal account with normal permissions.
//
// Safety:
//  - Always OFF on the live site (Vercel "production"), even if the
//    variables are set there by mistake.
//  - OFF unless both variables are set.
//  - The password never reaches the browser (these are server-only
//    variables, no NEXT_PUBLIC_ prefix).

function devLoginEnabled(): boolean {
  if (process.env.VERCEL_ENV === "production") return false;
  return Boolean(process.env.DEV_LOGIN_EMAIL && process.env.DEV_LOGIN_PASSWORD);
}

// The login page asks this to decide whether to show the button
export async function GET() {
  return NextResponse.json(
    { enabled: devLoginEnabled() },
    { headers: { "Cache-Control": "no-store" } }
  );
}

// The button submits here
export async function POST(request: NextRequest) {
  const { origin } = request.nextUrl;

  if (!devLoginEnabled()) {
    return new NextResponse("Not found", { status: 404 });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: process.env.DEV_LOGIN_EMAIL!,
    password: process.env.DEV_LOGIN_PASSWORD!,
  });

  // 303 = "now load this page with a normal GET"
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=dev_login_failed`, 303);
  }
  return NextResponse.redirect(`${origin}/crews`, 303);
}
