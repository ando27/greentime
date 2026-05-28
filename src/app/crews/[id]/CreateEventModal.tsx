"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { DBEvent, DBMember, DBRsvp, CourseItem } from "./types";

interface Props {
  groupId: string;
  currentMemberId: string;
  members: DBMember[];
  favorites?: CourseItem[];
  onClose: () => void;
  onSuccess: (event: DBEvent, newRsvps: DBRsvp[]) => void;
}

const EMPTY_FORM = {
  courseName: "",
  eventDate: "",
  teeTime: "",
  spots: 4,
  greensFee: "",
  cutoffHours: 24,
  notes: "",
};

export default function CreateEventModal({
  groupId,
  currentMemberId,
  members,
  favorites = [],
  onClose,
  onSuccess,
}: Props) {
  const supabase = createClient();
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  const handleClose = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && handleClose();
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [handleClose]);

  function set(field: keyof typeof EMPTY_FORM, value: string | number) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!form.courseName.trim()) return setError("Course name is required.");
    if (!form.eventDate) return setError("Date is required.");
    if (!form.teeTime) return setError("Tee time is required.");

    setLoading(true);
    try {
      // 1. Insert event
      const { data: newEvent, error: evErr } = await supabase
        .from("events")
        .insert({
          group_id: groupId,
          created_by: currentMemberId,
          course_name: form.courseName.trim(),
          event_date: form.eventDate,
          tee_time: form.teeTime,
          spots: form.spots,
          greens_fee: form.greensFee ? Number(form.greensFee) : null,
          cutoff_hours: form.cutoffHours,
          notes: form.notes.trim() || null,
        })
        .select()
        .single();

      if (evErr || !newEvent) throw evErr ?? new Error("Insert failed");

      // 2. Auto-RSVP: batch-check availability for other members
      const otherMembers = members.filter((m) => m.id !== currentMemberId);
      let autoRsvps: DBRsvp[] = [];

      if (otherMembers.length > 0) {
        const { data: avail } = await supabase
          .from("availability")
          .select("member_id")
          .in(
            "member_id",
            otherMembers.map((m) => m.id)
          )
          .eq("avail_date", form.eventDate);

        const availIds = new Set((avail ?? []).map((a) => a.member_id));

        const toInsert = otherMembers
          .filter((m) => availIds.has(m.id))
          .map((m) => ({
            event_id: newEvent.id,
            member_id: m.id,
            group_id: groupId,
            status: "in" as const,
            auto_rsvp: true,
            confirmed_at: new Date().toISOString(),
          }));

        if (toInsert.length > 0) {
          const { data: inserted } = await supabase
            .from("rsvps")
            .insert(toInsert)
            .select();
          autoRsvps = (inserted ?? []) as DBRsvp[];
        }
      }

      onSuccess(newEvent as DBEvent, autoRsvps);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 px-4 pb-4 sm:pb-0"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div className="bg-[#0f2018] border border-[#2d5040] rounded-2xl p-7 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-white font-semibold text-lg">New Event</h2>
          <button
            onClick={handleClose}
            className="text-[#4d7a5d] hover:text-white/60 transition-colors p-1 -mr-1"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path
                d="M4 4l10 10M14 4L4 14"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {favorites.length > 0 && (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setPickerOpen((o) => !o)}
                className="flex items-center gap-1.5 text-xs font-medium text-[#4d7a5d] hover:text-[#4ade80] transition-colors self-start"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  className={`transition-transform ${pickerOpen ? "rotate-90" : ""}`}
                >
                  <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Pick from favorites
              </button>
              {pickerOpen && (
                <div className="flex flex-wrap gap-1.5">
                  {favorites.map((c) => (
                    <button
                      key={`${c.lat}::${c.lng}`}
                      type="button"
                      onClick={() => {
                        set("courseName", c.name);
                        setPickerOpen(false);
                      }}
                      className="text-xs px-2.5 py-1.5 rounded-lg border border-[#2d5040] text-white/80 hover:border-[#4ade80]/60 hover:text-[#4ade80] transition-all"
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <Field label="Course name">
            <input
              type="text"
              value={form.courseName}
              onChange={(e) => set("courseName", e.target.value)}
              placeholder="Augusta National"
              autoFocus
              className={inputCls}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Date">
              <input
                type="date"
                value={form.eventDate}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => set("eventDate", e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Tee time">
              <input
                type="time"
                value={form.teeTime}
                onChange={(e) => set("teeTime", e.target.value)}
                className={inputCls}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Spots">
              <input
                type="number"
                value={form.spots}
                min={1}
                max={99}
                onChange={(e) => set("spots", Number(e.target.value))}
                className={inputCls}
              />
            </Field>
            <Field label="Greens fee (optional)">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4d7a5d] text-sm">
                  $
                </span>
                <input
                  type="number"
                  value={form.greensFee}
                  min={0}
                  step="0.01"
                  placeholder="0"
                  onChange={(e) => set("greensFee", e.target.value)}
                  className={inputCls + " pl-7"}
                />
              </div>
            </Field>
          </div>

          <Field label="Bail cutoff (hours before tee)">
            <input
              type="number"
              value={form.cutoffHours}
              min={0}
              onChange={(e) => set("cutoffHours", Number(e.target.value))}
              className={inputCls}
            />
          </Field>

          <Field label="Notes (optional)">
            <textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Anything the crew should know…"
              rows={3}
              className={inputCls + " resize-none"}
            />
          </Field>

          {error && (
            <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-3 mt-1">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 border border-[#2d5040] text-white/50 text-sm font-medium py-3 rounded-lg hover:border-[#4d7a5d] hover:text-white/70 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-[#4ade80] text-[#0f2018] font-semibold text-sm py-3 rounded-lg hover:bg-[#6ee7a0] active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {loading ? "Creating…" : "Create Event"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-white/70">{label}</label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full rounded-lg bg-[#1a3a2a] border border-[#2d5040] text-white placeholder-[#4d7a5d] px-4 py-3 text-sm outline-none focus:border-[#4ade80] focus:ring-1 focus:ring-[#4ade80] transition-colors";
