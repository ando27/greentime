// Turns any error (Supabase, network, or plain Error) into a sentence a person
// can read. Use it for every Supabase call so failures are never silent.
export function friendlyError(
  err: unknown,
  fallback = "Something went wrong. Please try again."
): string {
  if (!err) return fallback;

  const message =
    typeof err === "string"
      ? err
      : typeof err === "object" && "message" in err
        ? String((err as { message: unknown }).message ?? "")
        : "";
  const code =
    typeof err === "object" && err !== null && "code" in err
      ? String((err as { code: unknown }).code ?? "")
      : "";

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "You're offline. Check your connection and try again.";
  }
  if (/failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(message)) {
    return "Can't reach the server. Check your connection and try again.";
  }
  if (code === "42501" || /row-level security|permission denied/i.test(message)) {
    return "You don't have permission to do that.";
  }
  if (code === "PGRST301" || /jwt expired/i.test(message)) {
    return "Your session expired. Please sign in again.";
  }
  if (/relation .* does not exist|could not find the (table|function)/i.test(message)) {
    return "The database isn't set up yet. Run supabase/schema.sql in Supabase.";
  }

  return message || fallback;
}

/** True when a Postgres unique constraint rejected the write. */
export function isDuplicateError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "23505"
  );
}
