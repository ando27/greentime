"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { DBEvent } from "./types";

interface Props {
  event: DBEvent;
  onClose: () => void;
  onSuccess: (updated: DBEvent) => void;
}

export default function EditEventModal({ event, onClose, onSuccess }: Props) {
  const supabase = createClient();
  const [form, setForm] = useState({
    courseName: event.course_name,
    eventDate: event.event_date,
    teeTime: event.tee_time.slice(0, 5),
    spots: event.spots,
    greensFee: event.greens_fee !== null ? String(event.greens_fee) : "",
    cutoffHours: event.cutoff_hours,
    notes: event.notes ?? "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleClose = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && handleClose();
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [handleClose]);

  function set(field: keyof typeof form, value: string | number) {
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
      const { data, error: upErr } = await supabase
        .from("events")
        .update({
          course_name: form.courseName.trim(),
          event_date: form.eventDate,
          tee_time: form.teeTime,
          spots: form.spots,
          greens_fee: form.greensFee ? Number(form.greensFee) : null,
          cutoff_hours: form.cutoffHours,
          notes: form.notes.trim() || null,
        })
        .eq("id", event.id)
        .select()
        .single();

      if (upErr || !data) throw upErr ?? new Error("Update failed");

      onSuccess(data as DBEvent);
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
          <h2 className="text-white font-semibold text-lg">Edit Event</h2>
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
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-white/70">
              Course name
            </label>
            <input
              type="text"
              value={form.courseName}
              onChange={(e) => set("courseName", e.target.value)}
              autoFocus
              className={inputCls}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-white/70">Date</label>
              <input
                type="date"
                value={form.eventDate}
                onChange={(e) => set("eventDate", e.target.value)}
                className={inputCls}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-white/70">
                Tee time
              </label>
              <input
                type="time"
                value={form.teeTime}
                onChange={(e) => set("teeTime", e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-white/70">Spots</label>
              <input
                type="number"
                value={form.spots}
                min={1}
                max={99}
                onChange={(e) => set("spots", Number(e.target.value))}
                className={inputCls}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-white/70">
                Greens fee
              </label>
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
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-white/70">
              Bail cutoff (hours before tee)
            </label>
            <input
              type="number"
              value={form.cutoffHours}
              min={0}
              onChange={(e) => set("cutoffHours", Number(e.target.value))}
              className={inputCls}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-white/70">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={3}
              className={inputCls + " resize-none"}
            />
          </div>

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
              {loading ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg bg-[#1a3a2a] border border-[#2d5040] text-white placeholder-[#4d7a5d] px-4 py-3 text-sm outline-none focus:border-[#4ade80] focus:ring-1 focus:ring-[#4ade80] transition-colors";
