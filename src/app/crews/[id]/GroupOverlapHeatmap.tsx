"use client";

import { useState } from "react";
import type { DBAvailability, DBMember } from "./types";

interface Props {
  members: DBMember[];
  groupId: string;
  allAvailability: DBAvailability[];
}

// ── Geo/date helpers (match AvailabilityCalendar exactly) ─────────────────────

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

function formatDateStr(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// ── Color scale ───────────────────────────────────────────────────────────────

function bgForCount(n: number): string {
  if (n === 0) return "bg-[#0f2018]";
  if (n === 1) return "bg-[#1a3d2b]";
  if (n === 2) return "bg-[#2d5040]";
  if (n === 3) return "bg-[#3d7a55]";
  return "bg-[#4ade80]";
}

function countTextForCount(n: number): string {
  if (n === 0) return "text-[#2d5040]";
  if (n === 1) return "text-white/50";
  if (n === 2) return "text-white/70";
  if (n === 3) return "text-white";
  return "text-[#0f2018]";
}

function labelTextForCount(n: number): string {
  return n >= 4 ? "text-[#0f2018]/70" : "text-[#4d7a5d]";
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function GroupOverlapHeatmap({ members, allAvailability }: Props) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayDateStr = toDateStr(today);

  const [windowOffset, setWindowOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Build date → Set<memberId> from allAvailability
  const dateToMemberIds = new Map<string, Set<string>>();
  for (const row of allAvailability) {
    let s = dateToMemberIds.get(row.avail_date);
    if (!s) {
      s = new Set();
      dateToMemberIds.set(row.avail_date, s);
    }
    s.add(row.member_id);
  }

  const windowDays = Array.from({ length: 14 }, (_, i) =>
    addDays(today, windowOffset + i)
  );
  const rangeLabel = formatRange(windowDays[0], windowDays[13]);
  const atStart = windowOffset === 0;

  // Derived data for the expanded panel
  const selectedIds = selectedDate ? (dateToMemberIds.get(selectedDate) ?? new Set<string>()) : new Set<string>();
  const selectedMembers = members.filter((m) => selectedIds.has(m.id));

  function handleDayClick(dateStr: string) {
    setSelectedDate((prev) => (prev === dateStr ? null : dateStr));
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Window navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setWindowOffset((o) => Math.max(0, o - 14))}
          disabled={atStart}
          className="w-9 h-9 flex items-center justify-center rounded-lg text-[#4d7a5d] hover:text-white/70 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Previous two weeks"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <span className="text-white font-semibold text-sm">{rangeLabel}</span>
        <button
          onClick={() => setWindowOffset((o) => o + 14)}
          className="w-9 h-9 flex items-center justify-center rounded-lg text-[#4d7a5d] hover:text-white/70 transition-colors"
          aria-label="Next two weeks"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M5 2l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* Day strip */}
      <div
        className="flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" }}
      >
        {windowDays.map((d) => {
          const dateStr = toDateStr(d);
          const memberSet = dateToMemberIds.get(dateStr) ?? new Set<string>();
          const count = memberSet.size;
          const isToday = dateStr === todayDateStr;
          const isSelected = dateStr === selectedDate;
          const isBright = count >= 4;
          const dayName = d.toLocaleDateString("en-US", { weekday: "short" });
          const dayNum = d.getDate();

          return (
            <button
              key={dateStr}
              onClick={() => handleDayClick(dateStr)}
              title={`${count} member${count !== 1 ? "s" : ""} free`}
              aria-pressed={isSelected}
              className={`flex-none w-[60px] flex flex-col items-center gap-1.5 ${bgForCount(count)} border-2 rounded-xl py-3 px-1.5 transition-all active:scale-95 ${
                isSelected ? "border-[#4ade80]" : "border-[#2d5040]/60"
              }`}
            >
              {/* Day name */}
              <span className={`text-[9px] font-semibold uppercase tracking-wide ${labelTextForCount(count)}`}>
                {dayName}
              </span>

              {/* Date number — highlight today */}
              <div
                className={`w-7 h-7 flex items-center justify-center rounded-full text-sm font-semibold ${
                  isToday
                    ? isBright
                      ? "bg-[#0f2018]/25 text-[#0f2018] font-bold"
                      : "bg-[#4ade80] text-[#0f2018]"
                    : isBright
                    ? "text-[#0f2018]"
                    : "text-white/70"
                }`}
              >
                {dayNum}
              </div>

              {/* Overlap count */}
              <span className={`text-base font-bold leading-none ${countTextForCount(count)}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Expanded member panel */}
      {selectedDate && (
        <div className="bg-[#0f2018] border border-[#4ade80]/30 rounded-xl px-4 py-3">
          <p className="text-xs font-semibold text-[#4ade80]/80 uppercase tracking-wider mb-2">
            {formatDateStr(selectedDate)}
          </p>
          {selectedMembers.length === 0 ? (
            <p className="text-white/30 text-sm">No members marked free</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {selectedMembers.map((m) => (
                <span
                  key={m.id}
                  className="text-xs px-2.5 py-1 rounded-full bg-[#4ade80]/10 border border-[#4ade80]/25 text-[#4ade80]"
                >
                  {m.name}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-3 justify-center flex-wrap">
        <span className="text-[10px] text-[#4d7a5d]">Members free:</span>
        {([0, 1, 2, 3, "4+"] as const).map((label, i) => (
          <div key={i} className="flex items-center gap-1">
            <div className={`w-3 h-3 rounded ${bgForCount(i === 4 ? 4 : (label as number))} border border-[#2d5040]/40`} />
            <span className="text-[10px] text-[#4d7a5d]">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
