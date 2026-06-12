"use client";

import { useState } from "react";
import type { DBMember, CourseItem } from "./types";

interface Props {
  members: DBMember[];
  groupId: string;
  isAdmin: boolean;
  onBookCourse: (courseName: string) => void;
}

// Members who have opted in with a home location
interface LocatedMember {
  id: string;
  name: string;
  home_lat: number;
  home_lng: number;
}

interface CourseWithDrives {
  course: CourseItem;
  drives: { member: LocatedMember; miles: number }[];
  maxDrive: number;
}

interface AlgorithmResult {
  midpoint: { lat: number; lng: number };
  courses: CourseWithDrives[];
  globalMax: number; // max drive across all courses in this result set
}

// ── Geo helpers ───────────────────────────────────────────────────────────────

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
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

function centroidOf(pts: LocatedMember[]): { lat: number; lng: number } {
  return {
    lat: pts.reduce((s, m) => s + m.home_lat, 0) / pts.length,
    lng: pts.reduce((s, m) => s + m.home_lng, 0) / pts.length,
  };
}

/**
 * Iterative 1-center approximation (minimises the longest individual drive).
 * Converges by repeatedly pulling the candidate centre toward the farthest
 * member with a decaying step size, reaching sub-mile accuracy after 500 iters.
 */
function minimaxOf(pts: LocatedMember[]): { lat: number; lng: number } {
  if (pts.length <= 2) return centroidOf(pts);
  let { lat: cx, lng: cy } = centroidOf(pts);
  let alpha = 0.5;
  for (let i = 0; i < 500; i++) {
    let maxD = 0;
    let fLat = cx;
    let fLng = cy;
    for (const m of pts) {
      const d = haversine(cx, cy, m.home_lat, m.home_lng);
      if (d > maxD) {
        maxD = d;
        fLat = m.home_lat;
        fLng = m.home_lng;
      }
    }
    cx = (1 - alpha) * cx + alpha * fLat;
    cy = (1 - alpha) * cy + alpha * fLng;
    alpha *= 0.99;
  }
  return { lat: cx, lng: cy };
}

const SEARCH_RADIUS_M = Math.round(25 * 1609.34);
const MAX_RESULTS = 5;

async function fetchCourses(lat: number, lng: number): Promise<CourseItem[]> {
  const query = `[out:json][timeout:25];(node["leisure"="golf_course"](around:${SEARCH_RADIUS_M},${lat},${lng});way["leisure"="golf_course"](around:${SEARCH_RADIUS_M},${lat},${lng});relation["leisure"="golf_course"](around:${SEARCH_RADIUS_M},${lat},${lng}););out center tags;`;

  const res = await fetch(`/api/overpass?data=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error("Overpass API error");
  const data = await res.json();

  return (data.elements as Array<Record<string, unknown>>)
    .map((el) => {
      const tags = (el.tags ?? {}) as Record<string, string>;
      const name = tags.name ?? tags["name:en"] ?? "Unnamed Course";
      const elLat =
        typeof el.lat === "number"
          ? el.lat
          : el.center != null
          ? (el.center as Record<string, number>).lat
          : null;
      const elLng =
        typeof el.lon === "number"
          ? el.lon
          : el.center != null
          ? (el.center as Record<string, number>).lon
          : null;
      if (elLat == null || elLng == null) return null;
      const item: CourseItem = { name, lat: elLat, lng: elLng };
      const city = tags["addr:city"];
      const state = tags["addr:state"];
      if (city || state) item.address = [city, state].filter(Boolean).join(", ");
      return item;
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .sort((a, b) => haversine(lat, lng, a.lat, a.lng) - haversine(lat, lng, b.lat, b.lng))
    .slice(0, MAX_RESULTS);
}

function buildResult(
  midpoint: { lat: number; lng: number },
  courses: CourseItem[],
  members: LocatedMember[]
): AlgorithmResult {
  const withDrives: CourseWithDrives[] = courses.map((course) => {
    const drives = members.map((m) => ({
      member: m,
      miles: haversine(m.home_lat, m.home_lng, course.lat, course.lng),
    }));
    return { course, drives, maxDrive: Math.max(...drives.map((d) => d.miles)) };
  });

  const globalMax = withDrives.reduce((mx, c) => Math.max(mx, c.maxDrive), 0);
  return { midpoint, courses: withDrives, globalMax };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function DriveChart({
  drives,
  globalMax,
}: {
  drives: CourseWithDrives["drives"];
  globalMax: number;
}) {
  const localMax = Math.max(...drives.map((d) => d.miles));
  return (
    <div className="flex flex-col gap-1.5 mt-3">
      {drives.map(({ member, miles }) => {
        const pct = globalMax > 0 ? (miles / globalMax) * 100 : 0;
        const isLongest = miles === localMax;
        return (
          <div key={member.id} className="flex items-center gap-2">
            <span className="text-[#4d7a5d] text-[10px] w-[4.5rem] shrink-0 truncate">
              {member.name}
            </span>
            <div className="flex-1 h-1.5 bg-[#1a3a2a] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${isLongest ? "bg-amber-400" : "bg-[#4ade80]"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-white/60 text-[10px] w-10 text-right shrink-0">
              {miles.toFixed(1)} mi
            </span>
          </div>
        );
      })}
    </div>
  );
}

function CourseCard({
  item,
  globalMax,
  isAdmin,
  onBookCourse,
}: {
  item: CourseWithDrives;
  globalMax: number;
  isAdmin: boolean;
  onBookCourse: (courseName: string) => void;
}) {
  return (
    <div className="bg-[#0f2018] border border-[#2d5040] rounded-xl px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-white text-sm font-medium leading-snug">{item.course.name}</p>
          {item.course.address && (
            <p className="text-[#4d7a5d] text-xs mt-0.5">{item.course.address}</p>
          )}
        </div>
        {isAdmin && (
          <button
            onClick={() => onBookCourse(item.course.name)}
            className="flex-none text-xs font-semibold px-3 py-1.5 rounded-lg border border-[#2d5040] text-[#4d7a5d] hover:border-[#4ade80] hover:text-[#4ade80] active:scale-95 transition-all"
          >
            Book This
          </button>
        )}
      </div>

      <DriveChart drives={item.drives} globalMax={globalMax} />

      <p className="text-[10px] text-[#4d7a5d]/70 mt-2">
        Longest drive:{" "}
        <span className="text-amber-400">{item.maxDrive.toFixed(1)} mi</span>
      </p>
    </div>
  );
}

function ResultSection({
  label,
  badge,
  description,
  result,
  isAdmin,
  onBookCourse,
}: {
  label: string;
  badge: string;
  description: string;
  result: AlgorithmResult;
  isAdmin: boolean;
  onBookCourse: (courseName: string) => void;
}) {
  if (result.courses.length === 0) {
    return (
      <section>
        <SectionHeader label={label} badge={badge} description={description} />
        <p className="text-[#4d7a5d] text-sm">No courses found within 25 miles of this midpoint.</p>
      </section>
    );
  }

  return (
    <section>
      <SectionHeader label={label} badge={badge} description={description} />
      <div className="flex flex-col gap-2">
        {result.courses.map((item) => (
          <CourseCard
            key={`${item.course.lat}::${item.course.lng}`}
            item={item}
            globalMax={result.globalMax}
            isAdmin={isAdmin}
            onBookCourse={onBookCourse}
          />
        ))}
      </div>
    </section>
  );
}

function SectionHeader({
  label,
  badge,
  description,
}: {
  label: string;
  badge: string;
  description: string;
}) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-2 mb-0.5">
        <h2 className="text-white font-semibold text-sm">{label}</h2>
        <span className="text-[10px] font-semibold tracking-wider uppercase px-1.5 py-0.5 rounded bg-[#4ade80]/10 border border-[#4ade80]/25 text-[#4ade80]">
          {badge}
        </span>
      </div>
      <p className="text-[#4d7a5d] text-xs">{description}</p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type Status = "idle" | "loading" | "done" | "error";

export default function MeetInTheMiddle({ members, isAdmin, onBookCourse }: Props) {
  const located: LocatedMember[] = members
    .filter((m): m is DBMember & { home_lat: number; home_lng: number } =>
      m.home_lat != null && m.home_lng != null
    )
    .map((m) => ({ id: m.id, name: m.name, home_lat: m.home_lat, home_lng: m.home_lng }));

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [centroidResult, setCentroidResult] = useState<AlgorithmResult | null>(null);
  const [minimaxResult, setMinimaxResult] = useState<AlgorithmResult | null>(null);

  async function handleFind() {
    setStatus("loading");
    setError(null);

    try {
      const cPt = centroidOf(located);
      const mPt = minimaxOf(located);

      const [cCourses, mCourses] = await Promise.all([
        fetchCourses(cPt.lat, cPt.lng),
        fetchCourses(mPt.lat, mPt.lng),
      ]);

      setCentroidResult(buildResult(cPt, cCourses, located));
      setMinimaxResult(buildResult(mPt, mCourses, located));
      setStatus("done");
    } catch {
      setError("Failed to fetch courses. Please try again.");
      setStatus("error");
    }
  }

  // Gate: need at least 2 members with home locations
  if (located.length < 2) {
    return (
      <div className="flex flex-col items-center text-center gap-4 py-10">
        <div className="w-12 h-12 rounded-full bg-[#0f2018] border border-[#2d5040] flex items-center justify-center">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <circle cx="11" cy="11" r="8" stroke="#2d5040" strokeWidth="1.75" />
            <path d="M11 7v4l2.5 2.5" stroke="#4d7a5d" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
        <div>
          <p className="text-white font-semibold mb-1">Not enough locations set</p>
          <p className="text-[#4d7a5d] text-sm max-w-xs">
            At least 2 crew members need to set their home location before we can find a midpoint.
          </p>
        </div>
        {located.length === 1 && (
          <p className="text-[#4d7a5d]/70 text-xs">
            1 of {members.length} members {members.length === 1 ? "has" : "have"} set a location so far.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Trigger */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white text-sm font-medium">
              {located.length} of {members.length} members have home locations
            </p>
            <p className="text-[#4d7a5d] text-xs mt-0.5">
              Comparing two midpoint algorithms to find the fairest meet-up spot.
            </p>
          </div>
          <button
            onClick={handleFind}
            disabled={status === "loading"}
            className="flex-none bg-[#4ade80] text-[#0f2018] font-semibold text-sm px-4 py-2.5 rounded-lg hover:bg-[#6ee7a0] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === "loading" ? "Finding…" : status === "done" ? "Refresh" : "Find Midpoint Courses"}
          </button>
        </div>

        {/* Member location pills */}
        <div className="flex flex-wrap gap-1.5">
          {members.map((m) => {
            const hasLoc = m.home_lat != null && m.home_lng != null;
            return (
              <span
                key={m.id}
                className={`text-[10px] font-medium px-2 py-1 rounded-full border ${
                  hasLoc
                    ? "border-[#4ade80]/30 text-[#4ade80] bg-[#4ade80]/5"
                    : "border-[#2d5040] text-[#4d7a5d]"
                }`}
              >
                {m.name}
                {!hasLoc && <span className="ml-1 opacity-50">·no loc</span>}
              </span>
            );
          })}
        </div>
      </div>

      {error && <p className="text-rose-400 text-sm">{error}</p>}

      {status === "loading" && (
        <div className="flex flex-col gap-4">
          <LoadingSkeleton />
          <LoadingSkeleton />
        </div>
      )}

      {status === "done" && centroidResult && minimaxResult && (
        <div className="flex flex-col gap-8">
          <ResultSection
            label="Geographic Midpoint"
            badge="Centroid"
            description="Average of all home locations — shortest total travel time."
            result={centroidResult}
            isAdmin={isAdmin}
            onBookCourse={onBookCourse}
          />

          <div className="h-px bg-[#2d5040]/50" />

          <ResultSection
            label="Fairest for All"
            badge="Minimax"
            description="Minimises the longest individual drive so no one gets stuck with a marathon commute."
            result={minimaxResult}
            isAdmin={isAdmin}
            onBookCourse={onBookCourse}
          />
        </div>
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <div className="h-4 w-32 rounded bg-[#2d5040]/40 animate-pulse" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="bg-[#0f2018] border border-[#2d5040] rounded-xl px-4 py-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex flex-col gap-1.5 flex-1">
              <div className="h-3.5 w-3/4 rounded bg-[#2d5040]/40 animate-pulse" />
              <div className="h-2.5 w-1/2 rounded bg-[#2d5040]/30 animate-pulse" />
            </div>
            <div className="h-7 w-16 rounded-lg bg-[#2d5040]/30 animate-pulse" />
          </div>
          <div className="flex flex-col gap-1.5">
            {[0, 1].map((j) => (
              <div key={j} className="flex items-center gap-2">
                <div className="h-2 w-16 rounded bg-[#2d5040]/30 animate-pulse" />
                <div className="flex-1 h-1.5 rounded-full bg-[#2d5040]/30 animate-pulse" />
                <div className="h-2 w-8 rounded bg-[#2d5040]/30 animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
