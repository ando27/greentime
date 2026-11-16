"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const SIGNED_OUT_PAGES = ["/login", "/signup", "/auth"];

/**
 * Keeps the page in step with the Supabase session. Mounted once in the root
 * layout.
 *
 * IMPORTANT: never `await` a Supabase call inside the onAuthStateChange
 * callback. supabase-js holds a lock while the callback runs, so a query
 * inside it waits forever (known deadlock). The callback only records what
 * happened; any follow-up work is pushed out with setTimeout(..., 0).
 */
export default function AuthListener() {
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  // undefined = not known yet, null = signed out, string = signed-in user id
  const userIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    const onSignedOutPage = () =>
      SIGNED_OUT_PAGES.some((p) => pathnameRef.current.startsWith(p));

    // On app load: restore the session saved in cookies, so a page refresh
    // keeps the user signed in.
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (userIdRef.current === undefined) {
        userIdRef.current = data.session?.user.id ?? null;
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const previous = userIdRef.current;
      const current = session?.user.id ?? null;
      userIdRef.current = current;

      switch (event) {
        case "INITIAL_SESSION":
          // First report after load. Nothing to do: the server already
          // rendered the right page for this session.
          break;

        case "SIGNED_IN":
          // Also fires when the tab regains focus, so only react when the
          // signed-in user actually changed (e.g. signed in from another tab).
          if (previous !== undefined && previous !== current) {
            setTimeout(() => router.refresh(), 0);
          }
          break;

        case "TOKEN_REFRESHED":
          // The new token is already saved to cookies by the client.
          break;

        case "SIGNED_OUT":
          // Covers signing out in another tab and sessions that can no
          // longer be refreshed.
          if (!onSignedOutPage()) {
            setTimeout(() => {
              router.replace("/login");
              router.refresh();
            }, 0);
          }
          break;

        default:
          break;
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [router]);

  return null;
}
