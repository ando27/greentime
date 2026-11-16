// Reads the Supabase URL and key from the environment, with a clear message
// when they are missing (the usual cause is a missing .env.local or missing
// Vercel environment variables).
export function supabaseEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local (local) and in Vercel (Production and Preview). See files/SUPABASE_SETUP.md."
    );
  }

  return { url, anonKey };
}
