// Server-only helpers for calling OpenStreetMap services politely.

/**
 * OpenStreetMap services (Nominatim, Overpass) require every request to say
 * which app it comes from. Requests without this get blocked.
 */
export function osmHeaders(origin: string): Record<string, string> {
  return {
    "User-Agent": `GreenTime/1.0 (golf crew scheduling app; ${origin})`,
    Referer: `${origin}/`,
    Accept: "application/json",
  };
}
