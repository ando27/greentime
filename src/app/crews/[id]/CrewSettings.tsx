"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import ConfirmDialog from "@/components/ConfirmDialog";
import type { DBGroup, DBMember } from "./types";

interface Props {
  group: DBGroup;
  currentMember: DBMember;
  members: DBMember[];
}

type Pending = "newCode" | "delete" | "leave" | null;

const cardBtn =
  "text-xs font-semibold px-3.5 py-2.5 rounded-lg border border-[#2d5040] text-[#4d7a5d] hover:border-[#4d7a5d] hover:text-white/60 transition-colors disabled:opacity-50";

/**
 * Crew settings on the Members tab.
 *   Admins: rename the crew, get a new invite code, delete the crew.
 *   Everyone: leave the crew.
 * The database enforces the same rules (see supabase/schema.sql section 7),
 * so these buttons are a convenience, not the security.
 */
export default function CrewSettings({ group, currentMember, members }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();

  const isAdmin = currentMember.is_admin;
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(group.name);
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);

  // Leaving rules: a crew should never be left without an admin
  const otherMembers = members.filter((m) => m.id !== currentMember.id);
  const otherAdmins = otherMembers.filter((m) => m.is_admin);
  const leaveBlockedReason =
    otherMembers.length === 0
      ? "You're the only member. Delete the crew instead."
      : isAdmin && otherAdmins.length === 0
        ? "You're the only admin. Make another member an admin first, then you can leave."
        : null;

  async function handleRename(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed === group.name) {
      setRenaming(false);
      setName(group.name);
      return;
    }
    if (trimmed.length > 80) {
      toast.error("Crew name must be 80 characters or fewer.");
      return;
    }
    setBusy(true);
    // .select() returns the changed row, so a blocked update can't pass silently
    const { data, error } = await supabase
      .from("groups")
      .update({ name: trimmed })
      .eq("id", group.id)
      .select("id")
      .maybeSingle();
    setBusy(false);

    if (error) return toast.error(error, "Couldn't rename the crew.");
    if (!data) return toast.error("Couldn't rename the crew. Only admins can do that.");

    toast.success(`Crew renamed to ${trimmed}`);
    setRenaming(false);
    router.refresh();
  }

  async function handleNewCode() {
    setBusy(true);
    const { data, error } = await supabase.rpc("regenerate_invite_code", {
      p_group_id: group.id,
    });
    setBusy(false);
    setPending(null);

    if (error) return toast.error(error, "Couldn't change the invite code.");
    toast.success(`New invite code: ${data}`);
    router.refresh();
  }

  async function handleDelete() {
    setBusy(true);
    // Deleting the crew also removes its members, events, RSVPs, availability
    // and bails (database cascade)
    const { data, error } = await supabase
      .from("groups")
      .delete()
      .eq("id", group.id)
      .select("id");
    if (error || !data || data.length === 0) {
      setBusy(false);
      setPending(null);
      return toast.error(
        error ?? "Couldn't delete the crew. Only admins can do that.",
        "Couldn't delete the crew."
      );
    }
    toast.success(`${group.name} deleted`);
    router.push("/crews");
    router.refresh();
  }

  async function handleLeave() {
    setBusy(true);
    const { data, error } = await supabase
      .from("members")
      .delete()
      .eq("id", currentMember.id)
      .select("id");
    if (error || !data || data.length === 0) {
      setBusy(false);
      setPending(null);
      return toast.error(error ?? "Couldn't leave the crew.", "Couldn't leave the crew.");
    }
    toast.success(`You left ${group.name}`);
    router.push("/crews");
    router.refresh();
  }

  return (
    <div className="bg-[#0f2018] border border-[#2d5040] rounded-xl p-4 flex flex-col gap-4">
      <p className="text-xs text-[#4d7a5d] font-medium uppercase tracking-wider">
        Crew settings
      </p>

      {isAdmin && (
        <>
          {/* Rename */}
          {renaming ? (
            <form onSubmit={handleRename} className="flex flex-col gap-3">
              <label htmlFor="crewRename" className="sr-only">
                Crew name
              </label>
              <input
                id="crewRename"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                autoFocus
                className="w-full rounded-lg bg-[#1a3a2a] border border-[#2d5040] text-white px-4 py-3 text-base sm:text-sm outline-none focus:border-[#4ade80] focus:ring-1 focus:ring-[#4ade80] transition-colors"
              />
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setRenaming(false);
                    setName(group.name);
                  }}
                  className="flex-1 border border-[#2d5040] text-white/50 text-sm font-medium py-3 rounded-lg hover:border-[#4d7a5d] hover:text-white/70 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy || !name.trim()}
                  className="flex-1 bg-[#4ade80] text-[#0f2018] font-semibold text-sm py-3 rounded-lg hover:bg-[#6ee7a0] transition-all disabled:opacity-50"
                >
                  {busy ? "Saving…" : "Save name"}
                </button>
              </div>
            </form>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-white/80 text-sm truncate">{group.name}</p>
                <p className="text-xs text-[#4d7a5d]">Crew name</p>
              </div>
              <button onClick={() => setRenaming(true)} className={cardBtn + " shrink-0"}>
                Rename
              </button>
            </div>
          )}

          {/* New invite code */}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-white/80 text-sm">New invite code</p>
              <p className="text-xs text-[#4d7a5d]">
                Stops the current code and links from working.
              </p>
            </div>
            <button onClick={() => setPending("newCode")} className={cardBtn + " shrink-0"}>
              Replace
            </button>
          </div>
        </>
      )}

      {/* Leave */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-white/80 text-sm">Leave crew</p>
          <p className="text-xs text-[#4d7a5d]">
            {leaveBlockedReason ?? "Removes your availability and RSVPs here."}
          </p>
        </div>
        <button
          onClick={() => setPending("leave")}
          disabled={leaveBlockedReason !== null}
          className={cardBtn + " shrink-0"}
        >
          Leave
        </button>
      </div>

      {/* Delete */}
      {isAdmin && (
        <div className="flex items-center justify-between gap-3 pt-4 border-t border-[#2d5040]/60">
          <div className="min-w-0">
            <p className="text-rose-400 text-sm">Delete crew</p>
            <p className="text-xs text-[#4d7a5d]">
              Removes the crew for everyone. Cannot be undone.
            </p>
          </div>
          <button
            onClick={() => setPending("delete")}
            className="shrink-0 text-xs font-semibold px-3.5 py-2.5 rounded-lg border border-rose-500/40 text-rose-400 hover:bg-rose-500/10 transition-colors"
          >
            Delete
          </button>
        </div>
      )}

      {pending === "newCode" && (
        <ConfirmDialog
          title="Replace the invite code?"
          message="The current code and any invite links you've already shared will stop working. People already in the crew are not affected."
          confirmLabel="Replace code"
          busyLabel="Replacing…"
          busy={busy}
          danger={false}
          onConfirm={handleNewCode}
          onCancel={() => setPending(null)}
        />
      )}
      {pending === "leave" && (
        <ConfirmDialog
          title={`Leave ${group.name}?`}
          message="Your availability, RSVPs and bail history in this crew will be removed. You can rejoin later with an invite."
          confirmLabel="Leave crew"
          busyLabel="Leaving…"
          busy={busy}
          onConfirm={handleLeave}
          onCancel={() => setPending(null)}
        />
      )}
      {pending === "delete" && (
        <ConfirmDialog
          title={`Delete ${group.name}?`}
          message={
            <>
              This removes the crew for all {members.length}{" "}
              {members.length === 1 ? "member" : "members"}, with every event,
              RSVP, availability and bail. This cannot be undone.
            </>
          }
          confirmLabel="Delete crew"
          busyLabel="Deleting…"
          busy={busy}
          onConfirm={handleDelete}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}
