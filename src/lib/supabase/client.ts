import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseEnv } from "./env";

// ONE shared Supabase client for the whole browser tab. Every component that
// calls createClient() gets this same instance, so there is a single session
// and a single auth listener.
let browserClient: SupabaseClient | undefined;

export function createClient(): SupabaseClient {
  if (!browserClient) {
    const { url, anonKey } = supabaseEnv();
    browserClient = createBrowserClient(url, anonKey);
  }
  return browserClient;
}
