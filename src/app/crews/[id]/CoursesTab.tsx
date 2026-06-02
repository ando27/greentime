"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { DBMember, CourseItem } from "./types";

export type { CourseItem };

interface Props {
  currentMember: DBMember;
  groupId: string;
  initialFavorites: CourseItem[];
}

const MILES_TO_METERS = 1609.34;
const SEARCH_RADIUS_M = Math.round(30 * MILES_TO_METERS);

function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function geocode(query: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `/api/nominatim?format=json&limit=1&q=${encodeURIComponent(query)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.length) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {
    return null;
  }
}

async function fetchNearbyCourses(lat: number, lng: number): Promise<CourseItem[]> {
  const query = `[out:json][timeout:25];(node["leisure"="golf_course"](around:${SEARCH_RADIUS_M},${lat},${lng});way["leisure"="golf_course"](around:${SEARCH_RADIUS_M},${lat},${lng});relation["leisure"="golf_course"](around:${SEARCH_RADIUS_M},${lat},${lng}););out center tags;`;

  const res = await fetch(`/api/overpass?data=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error(`Overpass error ${res.status}`);
  const data = await res.json();

  return (data.elements as Array<Record<string, unknown>>)
    .map((el) => {
      const tags = (el.tags ?? {}) as Record<string, string>;
      const name = tags.name ?? tags["name:en"] ?? "Unnamed Course";
      const elLat =
        typeof el.lat === "number"
          ? el.lat
          : typeof el.center === "object" && el.center !== null
          ? (el.center as Record<string, number>).lat
          : null;
      const elLng =
        typeof el.lon === "number"
          ? el.lon
          : typeof el.center === "object" && el.center !== null
          ? (el.center as Record<string, number>).lon
          : null;
      if (elLat == null || elLng == null) return null;

      const addrParts = [tags["addr:city"], tags["addr:state"]].filter(Boolean);
      const item: CourseItem = { name, lat: elLat, lng: elLng };
      if (addrParts.length) item.address = addrParts.join(", ");
      return item;
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .sort(
      (a, b) =>
        haversineDistance(lat, lng, a.lat, a.lng) -
        haversineDistance(lat, lng, b.lat, b.lng)
    );
}

function courseKey(c: CourseItem) {
  return `${c.name}::${c.lat.toFixed(5)}::${c.lng.toFixed(5)}`;
}

export default function CoursesTab({ currentMember, groupId, initialFavorites }: Props) {
  const supabase = createClient();
  const router = useRouter();

  const [location, setLocation] = useState(currentMember.home_label ?? "");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<CourseItem[]>([]);
  const [searchOrigin, setSearchOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const [favorites, setFavorites] = useState<CourseItem[]>(initialFavorites);
  const [favPending, setFavPending] = useState<Set<string>>(new Set());
  const [removePending, setRemovePending] = useState<Set<string>>(new Set());

  const favoriteKeys = new Set(favorites.map(courseKey));

  async function handleSearch() {
    const query = location.trim();
    if (!query) return;
    setSearching(true);
    setSearchError(null);
    setHasSearched(false);

    try {
      const coords = await geocode(query);
      if (!coords) {
        setSearchError("Location not found. Try a city, zip code, or address.");
        return;
      }
      setSearchOrigin(coords);
      const courses = await fetchNearbyCourses(coords.lat, coords.lng);
      setResults(courses);
      setHasSearched(true);
    } catch {
      setSearchError("Search failed. Please try again.");
    } finally {
      setSearching(false);
    }
  }

  async function handleAddFavorite(course: CourseItem) {
    const key = courseKey(course);
    if (favPending.has(key) || favoriteKeys.has(key)) return;
    setFavPending((p) => new Set(p).add(key));

    const updated = [...favorites, course];
    const { error } = await supabase
      .from("groups")
      .update({ favorite_courses: updated })
      .eq("id", groupId);

    if (!error) {
      setFavorites(updated);
      router.refresh();
    }
    setFavPending((p) => {
      const s = new Set(p);
      s.delete(key);
      return s;
    });
  }

  async function handleRemoveFavorite(course: CourseItem) {
    const key = courseKey(course);
    if (removePending.has(key)) return;
    setRemovePending((p) => new Set(p).add(key));

    const next = favorites.filter((f) => courseKey(f) !== key);
    const { error } = await supabase
      .from("groups")
      .update({ favorite_courses: next })
      .eq("id", groupId);

    if (!error) {
      setFavorites(next);
      router.refresh();
    }
    setRemovePending((p) => {
      const s = new Set(p);
      s.delete(key);
      return s;
    });
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Search section */}
      <section>
        <h2 className="text-white/80 text-sm font-semibold uppercase tracking-wider mb-3">
          Search Nearby Courses
        </h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="City, zip code, or address"
            className="flex-1 bg-[#0f2018] border border-[#2d5040] text-white placeholder-[#4d7a5d] text-sm rounded-lg px-3 py-2.5 outline-none focus:border-[#4ade80]/60 transition-colors"
          />
          <button
            onClick={handleSearch}
            disabled={searching || !location.trim()}
            className="bg-[#4ade80] text-[#0f2018] font-semibold text-sm px-4 py-2.5 rounded-lg hover:bg-[#6ee7a0] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {searching ? "Searching…" : "Search"}
          </button>
        </div>

        {searchError && (
          <p className="text-rose-400 text-sm mt-2">{searchError}</p>
        )}

        {hasSearched && results.length === 0 && (
          <p className="text-[#4d7a5d] text-sm mt-3">
            No golf courses found within 30 miles.
          </p>
        )}

        {results.length > 0 && (
          <div className="flex flex-col gap-2 mt-4">
            {results.map((course) => {
              const key = courseKey(course);
              const isFav = favoriteKeys.has(key);
              const isPending = favPending.has(key);
              const dist = searchOrigin
                ? haversineDistance(searchOrigin.lat, searchOrigin.lng, course.lat, course.lng)
                : null;

              return (
                <div
                  key={key}
                  className="bg-[#0f2018] border border-[#2d5040] rounded-xl px-4 py-3 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-white text-sm font-medium truncate">{course.name}</p>
                    <p className="text-[#4d7a5d] text-xs mt-0.5">
                      {[
                        course.address,
                        dist != null ? `${dist.toFixed(1)} mi` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-none">
                    {/* TODO: E-06 — pre-fill event form with this course */}
                    <button
                      onClick={() => console.log("book", course)}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-[#4ade80] text-[#4ade80] hover:bg-[#4ade80]/10 active:scale-95 transition-all"
                    >
                      Book This
                    </button>
                    <button
                      onClick={() => handleAddFavorite(course)}
                      disabled={isFav || isPending}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${
                        isFav
                          ? "border-[#4ade80] text-[#4ade80] cursor-default"
                          : "border-[#2d5040] text-[#4d7a5d] hover:border-[#4ade80] hover:text-[#4ade80] active:scale-95 disabled:opacity-50 disabled:cursor-wait"
                      }`}
                    >
                      {isFav ? "Saved ✓" : isPending ? "Saving…" : "Add to Favorites"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Favorites section */}
      <section>
        <h2 className="text-white/80 text-sm font-semibold uppercase tracking-wider mb-3">
          Crew Favorites
        </h2>

        {favorites.length === 0 ? (
          <p className="text-[#4d7a5d] text-sm">
            No favorites yet. Search for courses above and add them here.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {favorites.map((course) => {
              const key = courseKey(course);
              const isPending = removePending.has(key);

              return (
                <div
                  key={key}
                  className="bg-[#0f2018] border border-[#2d5040] rounded-xl px-4 py-3 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-white text-sm font-medium truncate">{course.name}</p>
                    {course.address && (
                      <p className="text-[#4d7a5d] text-xs mt-0.5">{course.address}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-none">
                    {/* TODO: E-06 — pre-fill event form with this course */}
                    <button
                      onClick={() => console.log("book", course)}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-[#4ade80] text-[#4ade80] hover:bg-[#4ade80]/10 active:scale-95 transition-all"
                    >
                      Book This
                    </button>
                    {currentMember.is_admin && (
                      <button
                        onClick={() => handleRemoveFavorite(course)}
                        disabled={isPending}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-[#2d5040] text-[#4d7a5d] hover:border-rose-500/50 hover:text-rose-400 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-wait"
                      >
                        {isPending ? "Removing…" : "Remove"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
