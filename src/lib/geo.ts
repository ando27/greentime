// Location search (Nominatim) and golf course search (Overpass) helpers,
// shared by every screen. Both go through our own /api routes.

export interface Place {
  label: string;
  lat: number;
  lng: number;
}

// ── Location search ──────────────────────────────────────────────────────────
// Nominatim allows at most 1 request per second. Three layers keep us under:
//   - LocationInput waits for a pause in typing before searching (debounce)
//   - searches from this browser are spaced at least MIN_GAP_MS apart
//   - repeated searches are answered from memory

const MIN_GAP_MS = 1100;
const placeCache = new Map<string, Place[]>();
let lastSearchAt = 0;
let searchQueue: Promise<void> = Promise.resolve();

function waitForTurn(): Promise<void> {
  const turn = searchQueue.then(async () => {
    const wait = lastSearchAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastSearchAt = Date.now();
  });
  searchQueue = turn.catch(() => {});
  return turn;
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

  const cacheKey = `${limit}:${q.toLowerCase()}`;
  const cached = placeCache.get(cacheKey);
  if (cached) return cached;

  await waitForTurn();
  // The user kept typing while this search waited its turn: skip it
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const res = await fetch(
    `/api/nominatim?limit=${limit}&q=${encodeURIComponent(q)}`,
    { signal }
  );
  if (!res.ok) throw new Error(`Location search failed (${res.status}).`);

  const data = (await res.json()) as Array<{
    display_name: string;
    lat: string;
    lon: string;
  }>;

  const places = data
    .map((d) => ({
      label: d.display_name,
      lat: parseFloat(d.lat),
      lng: parseFloat(d.lon),
    }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));

  placeCache.set(cacheKey, places);
  return places;
}

// ── Golf course search ───────────────────────────────────────────────────────

export interface Course {
  name: string;
  lat: number;
  lng: number;
  address?: string;
}

// Results kept for the session, keyed by rounded position + radius, so
// repeating a search (or two members near each other) costs nothing.
const courseCache = new Map<string, Promise<Course[]>>();

/**
 * Finds golf courses within radiusMeters of a point. The server route adds a
 * timeout and retries on backup servers. Throws with a readable message if
 * every server fails.
 */
export function fetchGolfCourses(
  lat: number,
  lng: number,
  radiusMeters: number
): Promise<Course[]> {
  // Round to 2 decimals (about 1 km / 0.7 mi): close enough for a 25-30 mile
  // search, and it makes nearby searches share one cached answer.
  const rLat = Math.round(lat * 100) / 100;
  const rLng = Math.round(lng * 100) / 100;
  const radius = Math.round(radiusMeters);
  const key = `${rLat},${rLng},${radius}`;

  const cached = courseCache.get(key);
  if (cached) return cached;

  const request = (async () => {
    const res = await fetch(
      `/api/overpass?lat=${rLat}&lng=${rLng}&radius=${radius}`
    );
    const body = (await res.json().catch(() => null)) as {
      courses?: Course[];
      error?: string;
    } | null;
    if (!res.ok || !body?.courses) {
      throw new Error(body?.error ?? "Course search failed. Please try again.");
    }
    return body.courses;
  })();

  courseCache.set(key, request);
  // Don't remember failures: the next try should ask again
  request.catch(() => courseCache.delete(key));
  return request;
}
