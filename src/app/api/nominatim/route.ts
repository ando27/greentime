import { NextResponse, type NextRequest } from "next/server";
import { osmHeaders } from "@/lib/osm";

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

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const q = (searchParams.get("q") ?? "").trim().slice(0, 200);
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 5, 1), 5);

  if (q.length < 3) return NextResponse.json([]);

  const url = `${NOMINATIM_URL}?format=json&addressdetails=0&limit=${limit}&q=${encodeURIComponent(q)}`;

  try {
    await waitForTurn();
    const res = await fetch(url, {
      headers: { ...osmHeaders(origin), "Accept-Language": "en" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

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
