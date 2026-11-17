// Shared between the browser (src/lib/geo.ts) and the server route
// (src/app/api/overpass/route.ts): which Overpass servers to use, how to ask
// them for golf courses, and how to read the answer.

/** Public Overpass servers, tried in this order. */
export const OVERPASS_SERVERS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

export const MAX_RADIUS_M = 80_500; // 50 miles

export interface Course {
  name: string;
  lat: number;
  lng: number;
  address?: string;
}

/** The request body asking for every golf course within radius of a point. */
export function golfCourseQueryBody(
  lat: number,
  lng: number,
  radiusMeters: number
): string {
  const around = `(around:${Math.round(radiusMeters)},${lat},${lng})`;
  const query = `[out:json][timeout:10];(node["leisure"="golf_course"]${around};way["leisure"="golf_course"]${around};relation["leisure"="golf_course"]${around};);out center tags;`;
  return `data=${encodeURIComponent(query)}`;
}

/** Turns an Overpass answer into our course list. Throws if it isn't one. */
export function parseOverpassCourses(data: unknown): Course[] {
  const elements = (data as { elements?: unknown } | null)?.elements;
  if (!Array.isArray(elements)) {
    throw new Error("unreadable answer");
  }

  const courses: Course[] = [];
  for (const el of elements as Array<Record<string, unknown>>) {
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
