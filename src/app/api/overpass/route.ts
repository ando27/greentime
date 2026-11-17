import { NextResponse, type NextRequest } from "next/server";
import { osmHeaders } from "@/lib/osm";
import {
  MAX_RADIUS_M,
  OVERPASS_SERVERS,
  golfCourseQueryBody,
  parseOverpassCourses,
} from "@/lib/overpass";

// Golf course search through our own server. This is the BACKUP path: the
// browser asks the Overpass servers directly first (src/lib/geo.ts), because
// the public Overpass servers often refuse requests from cloud hosts such as
// Vercel. This route is used when the direct path fails (for example on a
// network that blocks those servers).

const ATTEMPT_TIMEOUT_MS = 8_000;

// Allow the function enough time for all attempts (Vercel setting)
export const maxDuration = 60;

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
  const body = golfCourseQueryBody(lat, lng, radius);
  const problems: string[] = [];

  for (const server of OVERPASS_SERVERS) {
    const host = new URL(server).host;
    try {
      const res = await fetch(server, {
        method: "POST",
        headers: {
          ...osmHeaders(origin),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
        signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
      });

      if (!res.ok) {
        problems.push(`${host} answered ${res.status}`);
        continue; // try the next server
      }

      const courses = parseOverpassCourses(await res.json());
      return NextResponse.json(
        { courses },
        {
          // Golf courses don't move: same area within a day comes from cache
          headers: { "Cache-Control": "public, s-maxage=86400, max-age=3600" },
        }
      );
    } catch (err) {
      const timedOut = err instanceof Error && err.name === "TimeoutError";
      problems.push(`${host} ${timedOut ? "timed out" : "failed"}`);
    }
  }

  console.error("Overpass: all servers failed.", problems.join("; "));
  return NextResponse.json(
    {
      error: "Course search is unavailable right now. Please try again in a minute.",
      // What each server said, to make problems diagnosable
      detail: problems,
    },
    { status: 502 }
  );
}
