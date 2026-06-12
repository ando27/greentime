"use client";

import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDate, type DBAvailability, type DBMember } from "./types";

interface Props {
  currentMember: DBMember;
  groupId: string;
  initialAvailability: DBAvailability[];
  members: DBMember[];
  allAvailability: DBAvailability[];
  onAvailabilityChange?: (rows: DBAvailability[]) => void;
}

type TimeSlot = "morning" | "afternoon" | "evening";

const SLOTS: { key: TimeSlot; label: string }[] = [
  { key: "morning", label: "Morning" },
  { key: "afternoon", label: "Afternoon" },
  { key: "evening", label: "Twilight" },
];

function slotKey(date: string, slot: TimeSlot): string {
  return `${date}:${slot}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatRange(start: Date, end: Date): string {
  const sm = start.toLocaleDateString("en-US", { month: "short" });
  const em = end.toLocaleDateString("en-US", { month: "short" });
  const sd = start.getDate();
  const ed = end.getDate();
  return sm === em ? `${sm} ${sd} – ${ed}` : `${sm} ${sd} – ${em} ${ed}`;
}

export default function AvailabilityCalendar({
  currentMember,
  groupId,
  initialAvailability,
  members,
  allAvailability,
  onAvailabilityChange,
}: Props) {
  const supabase = createClient();
  const myRowsRef = useRef<DBAvailability[]>(initialAvailability);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayDateStr = toDateStr(today);

  // Days offset from today; 0 = window starts at today
  const [windowOffset, setWindowOffset] = useState(0);

  // "YYYY-MM-DD:slot" → row id
  const [availMap, setAvailMap] = useState<Map<string, string>>(() => {
    const m = new Map<string, string>();
    for (const row of initialAvailability) {
      m.set(slotKey(row.avail_date, row.time_of_day), row.id);
    }
    return m;
  });

  const [pending, setPending] = useState<Set<string>>(new Set());

  // AV-03: which day's crew availability detail is expanded (read-only view)
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  // date → member_id → Set<slot>, for everyone except the current member
  const othersByDate = new Map<string, Map<string, Set<TimeSlot>>>();
  for (const row of allAvailability) {
    if (row.member_id === currentMember.id) continue;
    let byMember = othersByDate.get(row.avail_date);
    if (!byMember) {
      byMember = new Map();
      othersByDate.set(row.avail_date, byMember);
    }
    let slots = byMember.get(row.member_id);
    if (!slots) {
      slots = new Set();
      byMember.set(row.member_id, slots);
    }
    slots.add(row.time_of_day);
  }

  const memberById = new Map(members.map((m) => [m.id, m]));
  const expandedEntries = expandedDate
    ? [...(othersByDate.get(expandedDate) ?? new Map<string, Set<TimeSlot>>())]
        .map(([memberId, slots]) => ({ member: memberById.get(memberId), slots }))
        .filter((e): e is { member: DBMember; slots: Set<TimeSlot> } => e.member !== undefined)
    : [];

  const atStart = windowOffset === 0;

  function goToPrev() {
    setWindowOffset((o) => Math.max(0, o - 14));
  }

  function goToNext() {
    setWindowOffset((o) => o + 14);
  }

  async function toggleSlot(date: string, slot: TimeSlot) {
    const key = slotKey(date, slot);
    if (pending.has(key)) return;

    const existingId = availMap.get(key);
    const wasMarked = existingId !== undefined;

    setPending((p) => new Set(p).add(key));
    setAvailMap((prev) => {
      const next = new Map(prev);
      if (wasMarked) {
        next.delete(key);
      } else {
        next.set(key, "__pending__");
      }
      return next;
    });

    try {
      if (wasMarked) {
        const { error } = await supabase
          .from("availability")
          .delete()
          .eq("id", existingId);
        if (error) {
          setAvailMap((prev) => new Map(prev).set(key, existingId));
        } else {
          myRowsRef.current = myRowsRef.current.filter(
            (r) => !(r.avail_date === date && r.time_of_day === slot)
          );
          onAvailabilityChange?.(myRowsRef.current);
        }
      } else {
        const { data, error } = await supabase
          .from("availability")
          .insert({
            member_id: currentMember.id,
            group_id: groupId,
            avail_date: date,
            time_of_day: slot,
          })
          .select("id")
          .single();
        if (error) {
          setAvailMap((prev) => {
            const next = new Map(prev);
            next.delete(key);
            return next;
          });
        } else if (data) {
          const newId = (data as { id: string }).id;
          setAvailMap((prev) => new Map(prev).set(key, newId));
          myRowsRef.current = [
            ...myRowsRef.current,
            { id: newId, member_id: currentMember.id, group_id: groupId, avail_date: date, time_of_day: slot },
          ];
          onAvailabilityChange?.(myRowsRef.current);
        }
      }
    } finally {
      setPending((p) => {
        const next = new Set(p);
        next.delete(key);
        return next;
      });
    }
  }

  const windowDays = Array.from({ length: 14 }, (_, i) =>
    addDays(today, windowOffset + i)
  );
  const rangeLabel = formatRange(windowDays[0], windowDays[13]);

  return (
    <div className="flex flex-col gap-4">
      {/* Window navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={goToPrev}
          disabled={atStart}
          className="w-9 h-9 flex items-center justify-center rounded-lg text-[#4d7a5d] hover:text-white/70 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Previous two weeks"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M9 2L4 7l5 5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <span className="text-white font-semibold text-sm">{rangeLabel}</span>
        <button
          onClick={goToNext}
          className="w-9 h-9 flex items-center justify-center rounded-lg text-[#4d7a5d] hover:text-white/70 transition-colors"
          aria-label="Next two weeks"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M5 2l5 5-5 5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {/* Horizontal scroll strip */}
      <div
        className="flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" }}
      >
        {windowDays.map((d) => {
          const dateStr = toDateStr(d);
          const isToday = dateStr === todayDateStr;
          const dayName = d.toLocaleDateString("en-US", { weekday: "short" });
          const dayNum = d.getDate();
          const othersCount = othersByDate.get(dateStr)?.size ?? 0;
          const isExpanded = expandedDate === dateStr;

          return (
            <div
              key={dateStr}
              className={`flex-none w-[60px] flex flex-col items-center gap-1.5 bg-[#0f2018] border rounded-xl py-3 px-1.5 transition-colors ${
                isExpanded ? "border-[#4ade80]/60" : "border-[#2d5040]"
              }`}
            >
              {/* Day name */}
              <span className="text-[9px] font-semibold uppercase tracking-wide text-[#4d7a5d]">
                {dayName}
              </span>

              {/* Date number */}
              <div
                className={`w-7 h-7 flex items-center justify-center rounded-full text-sm font-semibold ${
                  isToday ? "bg-[#4ade80] text-[#0f2018]" : "text-white/70"
                }`}
              >
                {dayNum}
              </div>

              {/* Crew availability badge (AV-03) */}
              {othersCount > 0 ? (
                <button
                  onClick={() =>
                    setExpandedDate((prev) => (prev === dateStr ? null : dateStr))
                  }
                  aria-expanded={isExpanded}
                  aria-label={`${othersCount} other ${othersCount === 1 ? "member" : "members"} available on ${dateStr}`}
                  className={`h-[18px] min-w-[28px] px-1.5 flex items-center justify-center rounded-full text-[9px] font-bold leading-none transition-all active:scale-95 ${
                    isExpanded
                      ? "bg-[#4ade80] text-[#0f2018]"
                      : "bg-[#4ade80]/10 border border-[#4ade80]/40 text-[#4ade80] hover:bg-[#4ade80]/20"
                  }`}
                >
                  +{othersCount}
                </button>
              ) : (
                <div className="h-[18px]" aria-hidden="true" />
              )}

              {/* Time pills */}
              {SLOTS.map(({ key: slot, label }) => {
                const k = slotKey(dateStr, slot);
                const isActive = availMap.has(k);
                const isLoading = pending.has(k);

                return (
                  <button
                    key={slot}
                    onClick={() => toggleSlot(dateStr, slot)}
                    disabled={isLoading}
                    aria-label={`${slot} on ${dateStr}`}
                    aria-pressed={isActive}
                    className={`w-full rounded text-[9px] font-semibold py-1.5 leading-none transition-all ${
                      isActive
                        ? "bg-[#4ade80] text-[#0f2018]"
                        : "border border-[#2d5040] text-white hover:border-[#4ade80]/50"
                    } ${isLoading ? "opacity-50 cursor-wait" : ""}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Crew availability detail (AV-03, read-only) */}
      {expandedDate && (
        <div className="bg-[#0f2018] border border-[#4ade80]/30 rounded-xl px-4 py-3">
          <p className="text-xs font-semibold text-[#4ade80]/80 uppercase tracking-wider mb-2">
            Crew available · {formatDate(expandedDate)}
          </p>
          {expandedEntries.length === 0 ? (
            <p className="text-white/50 text-sm">No other members marked free.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {expandedEntries.map(({ member, slots }) => (
                <div key={member.id} className="flex items-center justify-between gap-3">
                  <span className="text-white text-sm truncate">{member.name}</span>
                  <div className="flex gap-1 flex-none">
                    {SLOTS.filter(({ key }) => slots.has(key)).map(({ key, label }) => (
                      <span
                        key={key}
                        className="text-[9px] font-semibold px-2 py-1 rounded-full bg-[#4ade80]/10 border border-[#4ade80]/25 text-[#4ade80] leading-none"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 justify-center">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-[#4ade80]" />
          <span className="text-[10px] text-[#4d7a5d]">Available</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded border border-[#2d5040]" />
          <span className="text-[10px] text-[#4d7a5d]">Not marked</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 px-1 flex items-center rounded-full bg-[#4ade80]/10 border border-[#4ade80]/40 text-[#4ade80] text-[8px] font-bold leading-none">
            +n
          </div>
          <span className="text-[10px] text-[#4d7a5d]">Crew free</span>
        </div>
      </div>
    </div>
  );
}
