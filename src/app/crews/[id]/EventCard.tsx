"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { isDuplicateError } from "@/lib/errors";
import {
  formatDate,
  formatTime,
  formatMoney,
  isWithinCutoff,
  type DBEvent,
  type DBRsvp,
  type DBBailLog,
  type DBMember,
} from "./types";

interface Props {
  event: DBEvent;
  rsvps: DBRsvp[];
  bailLog: DBBailLog[];
  members: DBMember[];
  currentMember: DBMember;
  isAdmin: boolean;
  onRsvpChange: (rsvp: DBRsvp) => void;
  onRsvpDelete: (rsvpId: string) => void;
  onBailLogAdd: (entry: DBBailLog) => void;
  onBailLogRemove: (entryId: string) => void;
  onEdit: (event: DBEvent) => void;
  onCancelRequest: (event: DBEvent) => void;
}

function PayLink({
  href,
  label,
}: {
  href?: string;
  label: string;
}) {
  if (!href) {
    return (
      <span className="text-xs text-[#4d7a5d] border border-[#2d5040] px-2 py-1 rounded-md">
        {label}
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs text-[#4ade80] border border-[#4ade80]/30 px-2 py-1 rounded-md hover:bg-[#4ade80]/10 transition-colors"
    >
      {label}
    </a>
  );
}

export default function EventCard({
  event,
  rsvps,
  bailLog,
  members,
  currentMember,
  isAdmin,
  onRsvpChange,
  onRsvpDelete,
  onBailLogAdd,
  onBailLogRemove,
  onEdit,
  onCancelRequest,
}: Props) {
  const supabase = createClient();
  const toast = useToast();
  const [rsvpLoading, setRsvpLoading] = useState(false);

  const myRsvp = rsvps.find((r) => r.member_id === currentMember.id) ?? null;
  const inCount = rsvps.filter((r) => r.status === "in").length;
  const outCount = rsvps.filter((r) => r.status === "out").length;
  const pendingCount = Math.max(0, members.length - inCount - outCount);
  const spotsRemaining = Math.max(0, event.spots - inCount);
  const isFull = spotsRemaining === 0;

  const dedupedBailLog = Object.values(
    bailLog.reduce<Record<string, DBBailLog>>((acc, entry) => {
      const existing = acc[entry.member_id];
      if (!existing || entry.bailed_at > existing.bailed_at) acc[entry.member_id] = entry;
      return acc;
    }, {})
  );

  // Logs a bail for the current member on this event (at most one, ever).
  async function logBail() {
    if (bailLog.some((b) => b.member_id === currentMember.id)) return;

    const { data: bailEntry, error } = await supabase
      .from("bail_log")
      .insert({
        event_id: event.id,
        member_id: currentMember.id,
        group_id: event.group_id,
        amount_owed: event.greens_fee ?? 0,
      })
      .select()
      .single();

    if (error) {
      if (!isDuplicateError(error)) {
        toast.error(error, "Your RSVP changed, but the bail couldn't be logged.");
        return;
      }
      // The database already has a bail for this member + event (unique
      // constraint). Load it so the card shows it.
      const { data: existing, error: readError } = await supabase
        .from("bail_log")
        .select()
        .eq("event_id", event.id)
        .eq("member_id", currentMember.id)
        .maybeSingle();
      if (readError) toast.error(readError, "Couldn't load the bail log.");
      else if (existing) onBailLogAdd(existing as DBBailLog);
      return;
    }
    if (bailEntry) onBailLogAdd(bailEntry as DBBailLog);
  }

  async function handleRsvp(newStatus: "in" | "out") {
    if (rsvpLoading) return;
    setRsvpLoading(true);

    // Decide once, up front, whether we are inside the bail window
    const withinCutoff = isWithinCutoff(
      event.event_date,
      event.tee_time,
      event.cutoff_hours
    );
    const now = new Date().toISOString();

    try {
      // Deselect: tapping the already-active status removes the RSVP entirely
      if (myRsvp?.status === newStatus) {
        const { error } = await supabase
          .from("rsvps")
          .delete()
          .eq("id", myRsvp.id);
        if (error) throw error;
        onRsvpDelete(myRsvp.id);
        // Un-tapping "In" inside the cutoff is dropping out, same as tapping Out
        if (newStatus === "in" && withinCutoff) await logBail();
        return;
      }

      // 1. Save the RSVP
      if (!myRsvp) {
        const { data, error } = await supabase
          .from("rsvps")
          .insert({
            event_id: event.id,
            member_id: currentMember.id,
            group_id: event.group_id,
            status: newStatus,
            auto_rsvp: false,
            confirmed_at: newStatus === "in" ? now : null,
          })
          .select()
          .single();
        if (error) throw error;
        onRsvpChange(data as DBRsvp);
      } else {
        const { data, error } = await supabase
          .from("rsvps")
          .update({
            status: newStatus,
            updated_at: now,
            ...(newStatus === "in" && !myRsvp.confirmed_at
              ? { confirmed_at: now }
              : {}),
          })
          .eq("id", myRsvp.id)
          .select()
          .single();
        if (error) throw error;
        onRsvpChange(data as DBRsvp);
      }

      // 2. Bail: In → Out inside the cutoff window. Never outside it.
      if (myRsvp?.status === "in" && newStatus === "out" && withinCutoff) {
        await logBail();
      }

      // 3. Bail reversal (E-07): back In inside the cutoff window removes the bail
      if (newStatus === "in" && withinCutoff) {
        const existingBail = bailLog.find(
          (b) => b.member_id === currentMember.id
        );
        if (existingBail) {
          const { error } = await supabase
            .from("bail_log")
            .delete()
            .eq("id", existingBail.id);
          if (error) {
            toast.error(error, "You're back In, but the bail couldn't be removed.");
          } else {
            onBailLogRemove(existingBail.id);
          }
        }
      }
    } catch (err) {
      toast.error(err, "Couldn't save your RSVP.");
    } finally {
      setRsvpLoading(false);
    }
  }

  return (
    <div className="bg-[#0f2018] border border-[#2d5040] rounded-xl overflow-hidden">
      {/* Header row */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="text-white font-semibold text-base leading-tight">
              {event.course_name}
            </h3>
            <p className="text-white/70 text-sm mt-0.5">
              {formatDate(event.event_date)} · {formatTime(event.tee_time)}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-white/80 text-sm font-medium">
              {event.spots} spots
            </p>
            <p className={`text-xs mt-0.5 font-medium ${isFull ? "text-amber-400" : "text-white/40"}`}>
              {isFull ? "Full" : `${spotsRemaining} left`}
            </p>
            {event.greens_fee && (
              <p className="text-[#4d7a5d] text-xs mt-0.5">
                {formatMoney(event.greens_fee)} greens fee
              </p>
            )}
          </div>
        </div>

        {/* RSVP counts */}
        <div className="flex items-center gap-3 text-xs mb-4">
          <span className="text-[#4ade80]">{inCount} in</span>
          <span className="text-white/20">·</span>
          <span className="text-rose-400">{outCount} out</span>
          <span className="text-white/20">·</span>
          <span className="text-[#4d7a5d]">{pendingCount} pending</span>
        </div>

        {/* RSVP toggle */}
        <div className="flex gap-2 mb-2">
          <button
            onClick={() => handleRsvp("in")}
            disabled={rsvpLoading}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-60 ${
              myRsvp?.status === "in"
                ? "bg-[#4ade80] text-[#0f2018]"
                : "bg-[#1a3a2a] border border-[#2d5040] text-white/50 hover:border-[#4ade80]/40 hover:text-white/80"
            }`}
          >
            ✓ In
          </button>
          <button
            onClick={() => handleRsvp("out")}
            disabled={rsvpLoading}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-60 ${
              myRsvp?.status === "out"
                ? "bg-rose-500 text-white"
                : "bg-[#1a3a2a] border border-[#2d5040] text-white/50 hover:border-rose-500/40 hover:text-white/80"
            }`}
          >
            ✕ Out
          </button>
        </div>

        {/* Auto-RSVP banner */}
        {myRsvp?.auto_rsvp && (
          <p className="text-xs text-[#4ade80]/70 mt-1">
            ✓ Auto-RSVPed based on your availability
          </p>
        )}

        {/* Notes */}
        {event.notes && (
          <p className="text-white/50 text-sm italic mt-3 border-t border-[#2d5040]/50 pt-3">
            &ldquo;{event.notes}&rdquo;
          </p>
        )}
      </div>

      {/* Bail log */}
      {dedupedBailLog.length > 0 && (
        <div className="px-5 py-3 bg-[#1a1a0f]/40 border-t border-[#2d5040]/50">
          <p className="text-xs font-medium text-amber-400/80 mb-2">Bailed</p>
          <div className="flex flex-col gap-2">
            {dedupedBailLog.map((entry) => {
              const member = members.find((m) => m.id === entry.member_id);
              const name = member?.name ?? "Unknown";
              const amount = entry.amount_owed ?? 0;
              const amountStr = amount.toFixed(2);
              const encodedName = encodeURIComponent(name);
              const encodedNote = encodeURIComponent("GreenTime bail");

              return (
                <div
                  key={entry.id}
                  className="flex items-center justify-between gap-3"
                >
                  <div>
                    <span className="text-white/70 text-sm">{name}</span>
                    {amount > 0 && (
                      <span className="text-amber-400/80 text-sm ml-2">
                        {formatMoney(amount)}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    {amount > 0 && (
                      <>
                        <PayLink
                          href={`https://venmo.com/?txn=pay&audience=private&recipients=${encodedName}&amount=${amountStr}&note=${encodedNote}`}
                          label="Venmo"
                        />
                        <PayLink
                          href={`https://cash.app/$${encodedName}/${amountStr}`}
                          label="Cash"
                        />
                      </>
                    )}
                    <PayLink label="Zelle" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Admin controls */}
      {isAdmin && (
        <div className="px-5 py-3 border-t border-[#2d5040]/50 flex gap-3">
          <button
            onClick={() => onEdit(event)}
            className="text-xs text-[#4d7a5d] hover:text-white/70 transition-colors font-medium"
          >
            Edit
          </button>
          <button
            onClick={() => onCancelRequest(event)}
            className="text-xs text-rose-400/70 hover:text-rose-400 transition-colors font-medium"
          >
            Cancel event
          </button>
        </div>
      )}
    </div>
  );
}
