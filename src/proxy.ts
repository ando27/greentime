import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseEnv } from "@/lib/supabase/env";

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const { url: supabaseUrl, anonKey } = supabaseEnv();

  const supabase = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // Must call getUser() to refresh tokens — do not add logic between createServerClient and this call
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;

  const protectedRoutes = ["/crews", "/setup", "/join"];
  const authRoutes = ["/login", "/signup"];

  // A redirect must carry any refreshed session cookies with it, otherwise the
  // browser keeps an expired token and the user looks signed out.
  function redirectTo(path: string, query?: Record<string, string>) {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = "";
    for (const [k, v] of Object.entries(query ?? {})) {
      url.searchParams.set(k, v);
    }
    const response = NextResponse.redirect(url);
    supabaseResponse.cookies
      .getAll()
      .forEach((cookie) => response.cookies.set(cookie));
    return response;
  }

  if (!user && protectedRoutes.some((r) => pathname.startsWith(r))) {
    // Remember where they were headed (e.g. an invite link) for after sign-in
    const wanted = pathname + search;
    return redirectTo(
      "/login",
      pathname.startsWith("/join") ? { next: wanted } : undefined
    );
  }

  if (user && authRoutes.some((r) => pathname.startsWith(r))) {
    const next = request.nextUrl.searchParams.get("next");
    const safe =
      next && next.startsWith("/") && !next.startsWith("//") ? next : "/crews";
    const url = new URL(safe, request.nextUrl.origin);
    return redirectTo(
      url.pathname,
      Object.fromEntries(url.searchParams.entries())
    );
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
