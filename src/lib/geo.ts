// Location search (Nominatim) helpers, shared by every screen.

export interface Place {
  label: string;
  lat: number;
  lng: number;
}

/**
 * Looks up places matching the text. Returns [] when nothing matches.
 * Throws when the search service can't be reached.
 */
export async function searchPlaces(
  query: string,
  limit = 5,
  signal?: AbortSignal
): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 3) return [];

  const res = await fetch(
    `/api/nominatim?format=json&limit=${limit}&q=${encodeURIComponent(q)}`,
    { signal, headers: { "Accept-Language": "en" } }
  );
  if (!res.ok) throw new Error(`Location search failed (${res.status}).`);

  const data = (await res.json()) as Array<{
    display_name: string;
    lat: string;
    lon: string;
  }>;

  return data
    .map((d) => ({
      label: d.display_name,
      lat: parseFloat(d.lat),
      lng: parseFloat(d.lon),
    }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
}
