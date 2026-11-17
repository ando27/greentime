import { NextResponse, type NextRequest } from "next/server";
import { osmHeaders } from "@/lib/osm";
import { MAX_RADIUS_M, distanceMeters, type Course } from "@/lib/overpass";

// Location search, proxied through our own server so we can follow the
// Nominatim usage policy (https://operations.osmfoundation.org/policies/nominatim/):
//   1. identify the app (User-Agent + Referer)   → osmHeaders()
//   2. at most 1 request per second               → the queue below
//   3. cache results                              → Cache-Control below
// The browser also debounces, throttles and caches (see src/lib/geo.ts).

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const MIN_GAP_MS = 1100;
const TIMEOUT_MS = 8000;

// Requests wait in line so this server never sends more than one per second.
let queue: Promise<void> = Promise.resolve();
let lastCallAt = 0;

function waitForTurn(): Promise<void> {
  const turn = queue.then(async () => {
    const wait = lastCallAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCallAt = Date.now();
  });
  queue = turn.catch(() => {});
  return turn;
}

async function askNominatim(url: string, origin: string): Promise<Response> {
  await waitForTurn();
  return fetch(url, {
    headers: { ...osmHeaders(origin), "Accept-Language": "en" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

const CACHE_HEADERS = { "Cache-Control": "public, s-maxage=86400, max-age=3600" };

interface NominatimPlace {
  class?: string;
  type?: string;
  name?: string;
  display_name?: string;
  lat: string;
  lon: string;
  address?: Record<string, string>;
}

// Last-resort golf course search, used when every Overpass server fails.
// Nominatim returns at most 40 places, so in a dense area the list can be
// incomplete (the response says so with `partial: true`).
async function golfSearch(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  const radius = Math.round(Number(searchParams.get("radius")));

  if (
    !Number.isFinite(lat) || Math.abs(lat) > 90 ||
    !Number.isFinite(lng) || Math.abs(lng) > 180 ||
    !Number.isFinite(radius) || radius <= 0 || radius > MAX_RADIUS_M
  ) {
    return NextResponse.json({ error: "Bad search area." }, { status: 400 });
  }

  // A box around the point (west, north, east, south)
  const dLat = radius / 111_320;
  const dLng = radius / (111_320 * Math.max(Math.cos((lat * Math.PI) / 180), 0.1));
  const viewbox = [lng - dLng, lat + dLat, lng + dLng, lat - dLat]
    .map((n) => n.toFixed(4))
    .join(",");
  const LIMIT = 40;
  const url = `${NOMINATIM_URL}?format=json&addressdetails=1&bounded=1&limit=${LIMIT}&q=${encodeURIComponent("golf course")}&viewbox=${viewbox}`;

  try {
    const res = await askNominatim(url, origin);
    if (!res.ok) {
      return NextResponse.json(
        { error: `Course search is unavailable (${res.status}).` },
        { status: 502 }
      );
    }
    const data = (await res.json()) as NominatimPlace[];
    const places = Array.isArray(data) ? data : [];

    const courses: Course[] = [];
    for (const p of places) {
      if (p.class !== "leisure" || p.type !== "golf_course") continue;
      const pLat = parseFloat(p.lat);
      const pLng = parseFloat(p.lon);
      if (!Number.isFinite(pLat) || !Number.isFinite(pLng)) continue;
      if (distanceMeters(lat, lng, pLat, pLng) > radius) continue; // box corners

      const course: Course = {
        name: p.name || p.display_name?.split(",")[0] || "Unnamed Course",
        lat: pLat,
        lng: pLng,
      };
      const a = p.address ?? {};
      const address = [a.city ?? a.town ?? a.village ?? a.hamlet, a.state]
        .filter(Boolean)
        .join(", ");
      if (address) course.address = address;
      courses.push(course);
    }

    return NextResponse.json(
      { courses, partial: places.length >= LIMIT },
      { headers: CACHE_HEADERS }
    );
  } catch {
    return NextResponse.json(
      { error: "Course search timed out." },
      { status: 504 }
    );
  }
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  if (searchParams.get("golf") === "1") return golfSearch(request);

  const q = (searchParams.get("q") ?? "").trim().slice(0, 200);
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 5, 1), 5);

  if (q.length < 3) return NextResponse.json([]);

  const url = `${NOMINATIM_URL}?format=json&addressdetails=0&limit=${limit}&q=${encodeURIComponent(q)}`;

  try {
    const res = await askNominatim(url, origin);

    if (!res.ok) {
      return NextResponse.json(
        { error: `Location search is unavailable (${res.status}).` },
        { status: 502 }
      );
    }

    const data = await res.json();
    return NextResponse.json(Array.isArray(data) ? data : [], {
      // Same search within a day is answered from cache, not Nominatim
      headers: { "Cache-Control": "public, s-maxage=86400, max-age=3600" },
    });
  } catch {
    return NextResponse.json(
      { error: "Location search timed out." },
      { status: 504 }
    );
  }
}
