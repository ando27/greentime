// Shared between the browser (src/lib/geo.ts) and the server route
// (src/app/api/overpass/route.ts): which Overpass servers to use, how to ask
// them for golf courses, and how to read the answer.

// Which public Overpass servers we use, and why (checked Nov 2026):
//  - overpass-api.de (the main one) is NOT used. It answers 406 to this app
//    from the browser and from Vercel. 406 is its "you are blocked" signal;
//    it turns away cloud hosts and hosted-app domains. Don't add it back.
//  - ovp.dresel.systems: free, no key, allows browser requests (CORS), asks
//    only for an identifying User-Agent or Referer. Has a North America copy.
//  - overpass.private.coffee: the new address of overpass.kumi.systems.
//  - maps.mail.ru: no stated limits; slow from some networks.
// List and policies: https://wiki.openstreetmap.org/wiki/Overpass_API
const DRESEL_NORTH_AMERICA = "https://ovp.dresel.systems/api-na/interpreter";
const DRESEL_EUROPE = "https://ovp.dresel.systems/api/interpreter";
const PRIVATE_COFFEE = "https://overpass.private.coffee/api/interpreter";
const VK_MAPS = "https://maps.mail.ru/osm/tools/overpass/api/interpreter";

/** Overpass servers to try, in order, for a search around this longitude. */
export function overpassServersFor(lng: number): string[] {
  const inNorthAmerica = lng >= -170 && lng <= -50;
  return inNorthAmerica
    ? [DRESEL_NORTH_AMERICA, PRIVATE_COFFEE, VK_MAPS]
    : [PRIVATE_COFFEE, DRESEL_EUROPE, VK_MAPS];
}

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

/** Straight-line distance between two points, in meters. */
export function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
