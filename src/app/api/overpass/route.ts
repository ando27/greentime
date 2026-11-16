import { NextResponse, type NextRequest } from "next/server";
import { osmHeaders } from "@/lib/osm";

// Golf course search (OpenStreetMap Overpass), proxied through our own server
// so we can add: a timeout, automatic retries on backup servers, an
// identifying User-Agent (overpass-api.de answers 406 without one), and caching.

// Tried in order. If one times out or errors, the next one is tried.
const OVERPASS_SERVERS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
const ATTEMPT_TIMEOUT_MS = 12_000;
const MAX_RADIUS_M = 80_500; // 50 miles

// Allow the function enough time for all attempts (Vercel setting)
export const maxDuration = 60;

interface Course {
  name: string;
  lat: number;
  lng: number;
  address?: string;
}

function parseCourses(elements: Array<Record<string, unknown>>): Course[] {
  const courses: Course[] = [];
  for (const el of elements) {
    const tags = (el.tags ?? {}) as Record<string, string>;
    const center = (el.center ?? null) as { lat?: number; lon?: number } | null;
    const lat = typeof el.lat === "number" ? el.lat : center?.lat;
    const lng = typeof el.lon === "number" ? el.lon : center?.lon;
    if (typeof lat !== "number" || typeof lng !== "number") continue;

    const course: Course = {
      name: tags.name ?? tags["name:en"] ?? "Unnamed Course",
      lat,
      lng,
    };
    const address = [tags["addr:city"], tags["addr:state"]]
      .filter(Boolean)
      .join(", ");
    if (address) course.address = address;
    courses.push(course);
  }
  return courses;
}

export async function GET(request: NextRequest) {
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

  // The query is built here, not sent by the browser, so this route can only
  // ever be used to look up golf courses.
  const around = `(around:${radius},${lat},${lng})`;
  const query = `[out:json][timeout:10];(node["leisure"="golf_course"]${around};way["leisure"="golf_course"]${around};relation["leisure"="golf_course"]${around};);out center tags;`;

  let lastProblem = "no servers tried";

  for (const server of OVERPASS_SERVERS) {
    try {
      const res = await fetch(server, {
        method: "POST",
        headers: {
          ...osmHeaders(origin),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
      });

      if (!res.ok) {
        lastProblem = `${new URL(server).host} answered ${res.status}`;
        continue; // try the next server
      }

      const data = (await res.json()) as {
        elements?: Array<Record<string, unknown>>;
      };
      if (!Array.isArray(data.elements)) {
        lastProblem = `${new URL(server).host} sent an unreadable answer`;
        continue;
      }

      return NextResponse.json(
        { courses: parseCourses(data.elements) },
        {
          // Golf courses don't move: same area within a day comes from cache
          headers: { "Cache-Control": "public, s-maxage=86400, max-age=3600" },
        }
      );
    } catch {
      lastProblem = `${new URL(server).host} timed out`;
    }
  }

  console.error("Overpass: all servers failed.", lastProblem);
  return NextResponse.json(
    { error: "Course search is unavailable right now. Please try again in a minute." },
    { status: 502 }
  );
}
