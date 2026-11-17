// Location search (Nominatim) and golf course search (Overpass) helpers,
// shared by every screen.

import {
  overpassServersFor,
  golfCourseQueryBody,
  parseOverpassCourses,
  type Course,
} from "./overpass";

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

export type { Course } from "./overpass";

// How long to wait for each Overpass server when asking from the browser
const DIRECT_TIMEOUT_MS = 8_000;
// Ask at most this many servers directly before using our own server route
const DIRECT_ATTEMPTS = 2;

// Results kept for the session, keyed by rounded position + radius, so
// repeating a search (or two members near each other) costs nothing.
const courseCache = new Map<string, Promise<Course[]>>();

/** Asks one Overpass server straight from the browser. */
async function fetchDirect(server: string, body: string): Promise<Course[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DIRECT_TIMEOUT_MS);
  try {
    const res = await fetch(server, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`answered ${res.status}`);
    return parseOverpassCourses(await res.json());
  } finally {
    clearTimeout(timer);
  }
}

interface CourseAnswer {
  courses?: Course[];
  error?: string;
  detail?: string[];
}

/** Asks one of our own server routes for courses. */
async function fetchFromOurServer(url: string, label: string): Promise<Course[]> {
  const res = await fetch(url);
  const body = (await res.json().catch(() => null)) as CourseAnswer | null;
  if (!res.ok || !body?.courses) {
    if (body?.detail) console.warn(`Course search (${label}):`, body.detail);
    throw new Error(body?.error ?? "Course search failed. Please try again.");
  }
  return body.courses;
}

/**
 * Finds golf courses within radiusMeters of a point.
 *
 * Order of attempts, one at a time, each with a timeout:
 *   1-2. two Overpass servers, straight from the browser
 *   3.   our /api/overpass route (asks Overpass from Vercel instead)
 *   4.   our /api/nominatim?golf=1 route (a different data service; returns
 *        at most 40 courses, so it is only the last resort)
 * Throws with a readable message only if all four fail.
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
    const body = golfCourseQueryBody(rLat, rLng, radius);
    const area = `lat=${rLat}&lng=${rLng}&radius=${radius}`;

    for (const server of overpassServersFor(rLng).slice(0, DIRECT_ATTEMPTS)) {
      try {
        return await fetchDirect(server, body);
      } catch (err) {
        console.warn(`Course search: ${new URL(server).host} failed, trying next.`, err);
      }
    }

    try {
      return await fetchFromOurServer(`/api/overpass?${area}`, "server route");
    } catch (err) {
      console.warn("Course search: server route failed, trying map search.", err);
    }

    return fetchFromOurServer(`/api/nominatim?golf=1&${area}`, "map search");
  })();

  courseCache.set(key, request);
  // Don't remember failures: the next try should ask again
  request.catch(() => courseCache.delete(key));
  return request;
}
