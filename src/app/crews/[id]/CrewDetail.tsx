"use client";

import { useState, useCallback, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import EventCard from "./EventCard";
import MyCrewLocation from "./MyCrewLocation";
import CrewSettings from "./CrewSettings";
import ConfirmDialog from "@/components/ConfirmDialog";
import CreateEventModal from "./CreateEventModal";
import EditEventModal from "./EditEventModal";
import AvailabilityCalendar from "./AvailabilityCalendar";
import CoursesTab from "./CoursesTab";
import MeetInTheMiddle from "./MeetInTheMiddle";
import GroupOverlapHeatmap from "./GroupOverlapHeatmap";
import {
  todayStr,
  formatDate,
  type DBGroup,
  type DBMember,
  type DBEvent,
  type DBRsvp,
  type DBBailLog,
  type DBAvailability,
  type CourseItem,
} from "./types";

interface Props {
  group: DBGroup;
  currentMember: DBMember;
  initialMembers: DBMember[];
  initialEvents: DBEvent[];
  initialRsvps: DBRsvp[];
  initialBailLog: DBBailLog[];
  allAvailability: DBAvailability[];
  favoriteCourses: CourseItem[];
}

type Tab = "events" | "members" | "availability" | "courses";

// False while the page is being built on the server, true in the browser.
const subscribeNoop = () => () => {};
function useIsBrowser(): boolean {
  return useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false
  );
}

function CalendarIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
      <rect
        x="4"
        y="7"
        width="28"
        height="24"
        rx="3"
        stroke="#2d5040"
        strokeWidth="2"
      />
      <path
        d="M4 15h28M12 4v6M24 4v6"
        stroke="#2d5040"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function CrewDetail({
  group,
  currentMember,
  initialMembers,
  initialEvents,
  initialRsvps,
  initialBailLog,
  allAvailability,
  favoriteCourses,
}: Props) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const isBrowser = useIsBrowser();
  const [tab, setTab] = useState<Tab>("events");
  const [events, setEvents] = useState<DBEvent[]>(initialEvents);
  const [rsvps, setRsvps] = useState<DBRsvp[]>(initialRsvps);
  const [bailLog, setBailLog] = useState<DBBailLog[]>(initialBailLog);
  const [availabilityState, setAvailabilityState] = useState<DBAvailability[]>(allAvailability);
  const [showCreate, setShowCreate] = useState(false);
  const [createCourseName, setCreateCourseName] = useState<string | null>(null);
  const [editEvent, setEditEvent] = useState<DBEvent | null>(null);
  const [cancelTarget, setCancelTarget] = useState<DBEvent | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);

  const myAvailability = availabilityState.filter(
    (a) => a.member_id === currentMember.id
  );

  const today = todayStr();
  const upcoming = [...events]
    .filter((e) => e.event_date >= today)
    .sort(
      (a, b) =>
        a.event_date.localeCompare(b.event_date) ||
        a.tee_time.localeCompare(b.tee_time)
    );
  const past = [...events]
    .filter((e) => e.event_date < today)
    .sort(
      (a, b) =>
        b.event_date.localeCompare(a.event_date) ||
        b.tee_time.localeCompare(a.tee_time)
    );

  const handleRsvpChange = useCallback((rsvp: DBRsvp) => {
    setRsvps((prev) => {
      const idx = prev.findIndex((r) => r.id === rsvp.id);
      return idx === -1 ? [...prev, rsvp] : prev.map((r) => (r.id === rsvp.id ? rsvp : r));
    });
  }, []);

  const handleRsvpDelete = useCallback((rsvpId: string) => {
    setRsvps((prev) => prev.filter((r) => r.id !== rsvpId));
  }, []);

  const handleBailLogAdd = useCallback((entry: DBBailLog) => {
    setBailLog((prev) => [...prev, entry]);
  }, []);

  const handleBailLogRemove = useCallback((entryId: string) => {
    setBailLog((prev) => prev.filter((b) => b.id !== entryId));
  }, []);

  const handleAvailabilityChange = useCallback((updatedRows: DBAvailability[]) => {
    setAvailabilityState((prev) => [
      ...prev.filter((a) => a.member_id !== currentMember.id),
      ...updatedRows,
    ]);
  }, [currentMember.id]);

  const handleEdit = useCallback((event: DBEvent) => {
    setEditEvent(event);
  }, []);

  const handleBookCourse = useCallback((courseName: string) => {
    setCreateCourseName(courseName);
    setShowCreate(true);
  }, []);

  const handleCreateClose = useCallback(() => {
    setShowCreate(false);
    setCreateCourseName(null);
  }, []);

  const handleCancelRequest = useCallback((event: DBEvent) => {
    setCancelTarget(event);
  }, []);

  function handleCreateSuccess(event: DBEvent, newRsvps: DBRsvp[]) {
    setEvents((prev) => [...prev, event]);
    setRsvps((prev) => [...prev, ...newRsvps]);
    setShowCreate(false);
    setCreateCourseName(null);
    setTab("events");
  }

  function handleEditSuccess(updated: DBEvent) {
    setEvents((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    setEditEvent(null);
  }

  async function handleConfirmCancel() {
    if (!cancelTarget || cancelLoading) return;
    setCancelLoading(true);
    const id = cancelTarget.id;

    // Deleting the event also removes its RSVPs and bails (database cascade).
    // .select() lets us confirm a row was really deleted: a blocked delete
    // returns no error, just zero rows.
    const { data: deleted, error } = await supabase
      .from("events")
      .delete()
      .eq("id", id)
      .select("id");
    setCancelLoading(false);

    if (error) {
      toast.error(error, "Couldn't cancel the event.");
      return;
    }
    if (!deleted || deleted.length === 0) {
      toast.error(
        "Couldn't cancel the event. It may already be gone, or you may not have permission."
      );
      return;
    }

    setEvents((prev) => prev.filter((e) => e.id !== id));
    setRsvps((prev) => prev.filter((r) => r.event_id !== id));
    setBailLog((prev) => prev.filter((b) => b.event_id !== id));
    setCancelTarget(null);
    toast.success("Event cancelled");
  }

  async function handleSignOut() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error(error, "Couldn't sign out.");
      return;
    }
    router.push("/login");
    router.refresh();
  }

  // Everything on this screen depends on "today" (upcoming vs past, greyed
  // days, the bail window). The server runs in UTC, so only draw it in the
  // browser, where the clock and time zone are the user's own.
  if (!isBrowser) {
    return (
      <div className="min-h-screen bg-[#1a3a2a] flex items-center justify-center">
        <div
          className="w-6 h-6 border-2 border-[#4ade80]/30 border-t-[#4ade80] rounded-full animate-spin"
          role="status"
          aria-label="Loading crew"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1a3a2a]">
      {/* Top nav */}
      <header className="border-b border-[#2d5040]/50 px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <Link
            href="/crews"
            className="inline-flex items-center gap-1.5 text-white/80 hover:text-white/70 text-sm transition-colors"
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
            My Crews
          </Link>
          <button
            onClick={handleSignOut}
            className="text-xs text-white/80 border border-[#2d5040] px-3 py-1.5 rounded-lg hover:border-[#4d7a5d] hover:text-white/60 transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Crew name + tabs */}
      <div className="max-w-lg mx-auto px-4 pt-7 pb-0">
        <h1
          className="text-3xl text-white mb-5"
          style={{ fontFamily: "var(--font-instrument-serif)" }}
        >
          {group.name}
        </h1>

        <div className="flex gap-1 border-b border-[#2d5040]/50 mb-6 overflow-x-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
          {(["events", "members", "availability", "courses"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
                tab === t
                  ? "border-[#4ade80] text-[#4ade80]"
                  : "border-transparent text-[#4d7a5d] hover:text-white/60"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <main className="max-w-lg mx-auto px-4 pb-16">
        {tab === "events" && (
          <EventsTab
            upcoming={upcoming}
            past={past}
            rsvps={rsvps}
            bailLog={bailLog}
            members={initialMembers}
            currentMember={currentMember}
            isAdmin={currentMember.is_admin}
            onRsvpChange={handleRsvpChange}
            onRsvpDelete={handleRsvpDelete}
            onBailLogAdd={handleBailLogAdd}
            onBailLogRemove={handleBailLogRemove}
            onEdit={handleEdit}
            onCancelRequest={handleCancelRequest}
            onCreateClick={() => setShowCreate(true)}
          />
        )}

        {tab === "members" && (
          <MembersTab
            group={group}
            members={initialMembers}
            currentMember={currentMember}
            inviteCode={group.invite_code}
            bailLog={bailLog}
          />
        )}

        {tab === "availability" && (
          <div className="flex flex-col gap-8">
            <section>
              <h2 className="text-white/80 text-sm font-semibold uppercase tracking-wider mb-3">
                Group Availability
              </h2>
              <GroupOverlapHeatmap
                members={initialMembers}
                groupId={group.id}
                allAvailability={availabilityState}
              />
            </section>
            <div className="h-px bg-[#2d5040]/50" />
            <section>
              <h2 className="text-white/80 text-sm font-semibold uppercase tracking-wider mb-3">
                Your Availability
              </h2>
              <AvailabilityCalendar
                currentMember={currentMember}
                groupId={group.id}
                initialAvailability={myAvailability}
                members={initialMembers}
                allAvailability={availabilityState}
                onAvailabilityChange={handleAvailabilityChange}
              />
            </section>
          </div>
        )}

        {tab === "courses" && (
          <div className="flex flex-col gap-10">
            <CoursesTab
              currentMember={currentMember}
              groupId={group.id}
              initialFavorites={favoriteCourses}
              onBookCourse={handleBookCourse}
            />
            <div className="h-px bg-[#2d5040]/50" />
            <MeetInTheMiddle
              members={initialMembers}
              groupId={group.id}
              isAdmin={currentMember.is_admin}
              onBookCourse={handleBookCourse}
            />
          </div>
        )}
      </main>

      {/* Modals */}
      {showCreate && (
        <CreateEventModal
          groupId={group.id}
          currentMemberId={currentMember.id}
          members={initialMembers}
          favorites={favoriteCourses}
          initialCourseName={createCourseName ?? undefined}
          onClose={handleCreateClose}
          onSuccess={handleCreateSuccess}
        />
      )}
      {editEvent && (
        <EditEventModal
          event={editEvent}
          onClose={() => setEditEvent(null)}
          onSuccess={handleEditSuccess}
        />
      )}

      {/* Cancel confirmation */}
      {cancelTarget && (
        <div
          className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 px-4 pb-4 sm:pb-0"
          onClick={(e) =>
            e.target === e.currentTarget && setCancelTarget(null)
          }
        >
          <div className="bg-[#0f2018] border border-[#2d5040] rounded-2xl p-7 w-full max-w-sm shadow-2xl">
            <h2 className="text-white font-semibold text-lg mb-2">
              Cancel this event?
            </h2>
            <p className="text-white/50 text-sm mb-6">
              Cancel{" "}
              <span className="text-white/80">{cancelTarget.course_name}</span>{" "}
              on{" "}
              <span className="text-white/80">
                {formatDate(cancelTarget.event_date)}
              </span>
              ? All RSVPs will be removed. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setCancelTarget(null)}
                className="flex-1 border border-[#2d5040] text-white/50 text-sm font-medium py-3 rounded-lg hover:border-[#4d7a5d] hover:text-white/70 transition-colors"
              >
                Keep it
              </button>
              <button
                onClick={handleConfirmCancel}
                disabled={cancelLoading}
                className="flex-1 bg-rose-500 text-white font-semibold text-sm py-3 rounded-lg hover:bg-rose-400 active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {cancelLoading ? "Cancelling…" : "Cancel Event"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function EventsTab({
  upcoming,
  past,
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
  onCreateClick,
}: {
  upcoming: DBEvent[];
  past: DBEvent[];
  rsvps: DBRsvp[];
  bailLog: DBBailLog[];
  members: DBMember[];
  currentMember: DBMember;
  isAdmin: boolean;
  onRsvpChange: (r: DBRsvp) => void;
  onRsvpDelete: (rsvpId: string) => void;
  onBailLogAdd: (b: DBBailLog) => void;
  onBailLogRemove: (entryId: string) => void;
  onEdit: (e: DBEvent) => void;
  onCancelRequest: (e: DBEvent) => void;
  onCreateClick: () => void;
}) {
  const cardProps = (event: DBEvent) => ({
    event,
    rsvps: rsvps.filter((r) => r.event_id === event.id),
    bailLog: bailLog.filter((b) => b.event_id === event.id),
    members,
    currentMember,
    isAdmin,
    onRsvpChange,
    onRsvpDelete,
    onBailLogAdd,
    onBailLogRemove,
    onEdit,
    onCancelRequest,
  });

  return (
    <>
      {upcoming.length === 0 && past.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center text-center gap-5 pt-10">
          <CalendarIcon />
          <div>
            <p className="text-white font-semibold mb-1">No upcoming events</p>
            <p className="text-[#4d7a5d] text-sm max-w-xs">
              {isAdmin
                ? "Create the first event for your crew."
                : "Ask an admin to schedule a round."}
            </p>
          </div>
          {isAdmin && (
            <button
              onClick={onCreateClick}
              className="bg-[#4ade80] text-[#0f2018] font-semibold text-sm px-5 py-2.5 rounded-lg hover:bg-[#6ee7a0] active:scale-[0.98] transition-all"
            >
              + Create Event
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white/80 text-sm font-semibold uppercase tracking-wider">
              Upcoming
            </h2>
            {isAdmin && (
              <button
                onClick={onCreateClick}
                className="bg-[#4ade80] text-[#0f2018] font-semibold text-xs px-3.5 py-2 rounded-lg hover:bg-[#6ee7a0] active:scale-[0.98] transition-all"
              >
                + Create Event
              </button>
            )}
          </div>

          {upcoming.length === 0 ? (
            <p className="text-[#4d7a5d] text-sm mb-6">No upcoming events.</p>
          ) : (
            <div className="flex flex-col gap-3 mb-8">
              {upcoming.map((e) => (
                <EventCard key={e.id} {...cardProps(e)} />
              ))}
            </div>
          )}

          {past.length > 0 && (
            <>
              <div className="flex items-center gap-3 mb-4">
                <div className="h-px flex-1 bg-[#2d5040]/60" />
                <span className="text-[#4d7a5d] text-xs font-semibold uppercase tracking-wider">
                  Past
                </span>
                <div className="h-px flex-1 bg-[#2d5040]/60" />
              </div>
              <div className="flex flex-col gap-3 opacity-70">
                {past.map((e) => (
                  <EventCard key={e.id} {...cardProps(e)} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}

function MembersTab({
  group,
  members,
  currentMember,
  inviteCode,
  bailLog,
}: {
  group: DBGroup;
  members: DBMember[];
  currentMember: DBMember;
  inviteCode: string;
  bailLog: DBBailLog[];
}) {
  const toast = useToast();
  const router = useRouter();
  const supabase = createClient();
  const [removeTarget, setRemoveTarget] = useState<DBMember | null>(null);
  const [memberBusy, setMemberBusy] = useState(false);

  // Admin: make someone an admin, or take it away
  async function handleToggleAdmin(member: DBMember) {
    setMemberBusy(true);
    const { data, error } = await supabase
      .from("members")
      .update({ is_admin: !member.is_admin })
      .eq("id", member.id)
      .select("id")
      .maybeSingle();
    setMemberBusy(false);

    if (error) return toast.error(error, "Couldn't change that member.");
    if (!data) return toast.error("Couldn't change that member. Only admins can do that.");
    toast.success(
      member.is_admin
        ? `${member.name} is no longer an admin`
        : `${member.name} is now an admin`
    );
    router.refresh();
  }

  // Admin: remove a member (their availability and RSVPs go with them)
  async function handleRemoveMember() {
    if (!removeTarget) return;
    setMemberBusy(true);
    const { data, error } = await supabase
      .from("members")
      .delete()
      .eq("id", removeTarget.id)
      .select("id");
    setMemberBusy(false);

    if (error || !data || data.length === 0) {
      toast.error(
        error ?? "Couldn't remove that member. Only admins can do that.",
        "Couldn't remove that member."
      );
      setRemoveTarget(null);
      return;
    }
    toast.success(`${removeTarget.name} removed from the crew`);
    setRemoveTarget(null);
    router.refresh();
  }

  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Count bails per member from the already-loaded bail log
  const bailCounts: Record<string, number> = {};
  for (const b of bailLog) {
    bailCounts[b.member_id] = (bailCounts[b.member_id] ?? 0) + 1;
  }

  function handleCopy() {
    navigator.clipboard
      .writeText(inviteCode)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => toast.error(`Couldn't copy. The code is ${inviteCode}`));
  }

  // The share link always uses the address the app is being viewed at
  // (window.location.origin), so it is a real https:// link to this site,
  // never a file path or "null".
  function inviteLink(): string {
    return `${window.location.origin}/join/${inviteCode}`;
  }

  async function handleShareLink() {
    const link = inviteLink();

    // Phones: open the share sheet (Messages, WhatsApp, ...)
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "Join my GreenTime crew",
          text: "Join my crew on GreenTime:",
          url: link,
        });
        return;
      } catch (err) {
        // User closed the share sheet: nothing to do
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Otherwise fall through to copying
      }
    }

    try {
      await navigator.clipboard.writeText(link);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
      toast.success("Invite link copied");
    } catch {
      toast.error(`Couldn't copy. The link is ${link}`);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Invite: share link + code */}
      <div className="bg-[#0f2018] border border-[#2d5040] rounded-xl p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-[#4d7a5d] font-medium uppercase tracking-wider mb-0.5">
              Invite code
            </p>
            <p className="text-white font-mono text-lg tracking-widest font-semibold">
              {inviteCode}
            </p>
          </div>
          <button
            onClick={handleCopy}
            className={`text-xs font-semibold px-3.5 py-2.5 rounded-lg border transition-all ${
              copied
                ? "border-[#4ade80] text-[#4ade80] bg-[#4ade80]/10"
                : "border-[#2d5040] text-[#4d7a5d] hover:border-[#4d7a5d] hover:text-white/60"
            }`}
          >
            {copied ? "Copied!" : "Copy code"}
          </button>
        </div>
        <button
          onClick={handleShareLink}
          className="w-full bg-[#4ade80] text-[#0f2018] font-semibold text-sm py-3 rounded-lg hover:bg-[#6ee7a0] active:scale-[0.98] transition-all"
        >
          {linkCopied ? "Link copied!" : "Share invite link"}
        </button>
        <p className="text-xs text-[#4d7a5d]">
          Anyone with the link can join after signing in.
        </p>
      </div>

      {/* Your own location for this crew */}
      <MyCrewLocation member={currentMember} />

      {/* Member list */}
      <div className="flex flex-col gap-2">
        {members.map((m) => {
          const bails = bailCounts[m.id] ?? 0;
          const isExpanded = expandedId === m.id;
          const isMe = m.id === currentMember.id;
          // Admins can manage everyone except themselves (use Leave for that)
          const canManage = currentMember.is_admin && !isMe;
          const hasDetail = !!m.home_label || bails > 0 || canManage;

          return (
            <div
              key={m.id}
              className="bg-[#0f2018] border border-[#2d5040] rounded-xl hover:border-[#4d7a5d] transition-colors"
            >
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : m.id)}
                aria-expanded={isExpanded}
                className="w-full text-left px-4 py-3.5 flex items-center justify-between gap-3"
              >
                <span className="text-white text-sm font-medium truncate">
                  {m.name}
                  {isMe && <span className="text-[#4d7a5d] font-normal"> (you)</span>}
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  {m.is_admin && (
                    <span className="text-[10px] font-semibold tracking-wider uppercase px-1.5 py-0.5 rounded bg-[#4ade80]/10 border border-[#4ade80]/25 text-[#4ade80]">
                      Admin
                    </span>
                  )}
                  {hasDetail && (
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="none"
                      className={`text-[#4d7a5d] transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    >
                      <path
                        d="M2 4.5l4 4 4-4"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </span>
              </button>

              {isExpanded && hasDetail && (
                <div className="mx-4 pb-3 pt-2 border-t border-[#2d5040]/60 flex flex-col gap-1">
                  {m.home_label && (
                    <p className="text-[#4d7a5d] text-xs">📍 {m.home_label}</p>
                  )}
                  {bails > 0 && (
                    <p className="text-white/50 text-xs">
                      🚩 {bails} {bails === 1 ? "bail" : "bails"}
                    </p>
                  )}
                  {canManage && (
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => handleToggleAdmin(m)}
                        disabled={memberBusy}
                        className="flex-1 text-xs font-semibold px-3 py-2.5 rounded-lg border border-[#2d5040] text-[#4d7a5d] hover:border-[#4d7a5d] hover:text-white/60 transition-colors disabled:opacity-50"
                      >
                        {m.is_admin ? "Remove admin" : "Make admin"}
                      </button>
                      <button
                        onClick={() => setRemoveTarget(m)}
                        disabled={memberBusy}
                        className="flex-1 text-xs font-semibold px-3 py-2.5 rounded-lg border border-rose-500/40 text-rose-400 hover:bg-rose-500/10 transition-colors disabled:opacity-50"
                      >
                        Remove from crew
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Rename, new code, leave, delete */}
      <CrewSettings group={group} currentMember={currentMember} members={members} />

      {removeTarget && (
        <ConfirmDialog
          title={`Remove ${removeTarget.name}?`}
          message="Their availability, RSVPs and bail history in this crew will be removed. They can rejoin with an invite."
          confirmLabel="Remove"
          busyLabel="Removing…"
          busy={memberBusy}
          onConfirm={handleRemoveMember}
          onCancel={() => setRemoveTarget(null)}
        />
      )}
    </div>
  );
}
