"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import CreateCrewModal from "./CreateCrewModal";
import JoinCrewModal from "./JoinCrewModal";
import ProfileModal from "./ProfileModal";

export interface Crew {
  groupId: string;
  name: string;
  isAdmin: boolean;
  memberCount: number;
}

export interface UserProfile {
  displayName: string;
  homeLat: number | null;
  homeLng: number | null;
  homeLabel: string | null;
}

interface Props {
  userId: string;
  initialCrews: Crew[];
  profile: UserProfile;
}

function GolfFlagIcon() {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
    >
      <line
        x1="13"
        y1="6"
        x2="13"
        y2="34"
        stroke="#2d5040"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="M13 6 L31 14 L13 22 Z" fill="#2d5040" />
    </svg>
  );
}

function CrewCard({ crew }: { crew: Crew }) {
  return (
    <Link
      href={`/crews/${crew.groupId}`}
      className="group block bg-[#0f2018] border border-[#2d5040] rounded-xl p-5 hover:border-[#4d7a5d] transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-white font-semibold text-base truncate">
              {crew.name}
            </h3>
            {crew.isAdmin && (
              <span className="shrink-0 text-[10px] font-semibold tracking-wider uppercase px-1.5 py-0.5 rounded bg-[#4ade80]/10 border border-[#4ade80]/25 text-[#4ade80]">
                Admin
              </span>
            )}
          </div>
          <p className="text-[#4d7a5d] text-sm">
            {crew.memberCount}{" "}
            {crew.memberCount === 1 ? "member" : "members"}
          </p>
        </div>
        <span className="text-[#4ade80] text-sm font-medium group-hover:translate-x-0.5 transition-transform shrink-0 mt-0.5">
          Enter →
        </span>
      </div>
    </Link>
  );
}

export default function CrewsClient({ userId, initialCrews, profile }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [modal, setModal] = useState<"create" | "join" | null>(null);
  const [profileState, setProfileState] = useState<UserProfile>(profile);
  const [showProfile, setShowProfile] = useState(false);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="min-h-screen bg-[#1a3a2a]">
      {/* Header */}
      <header className="border-b border-[#2d5040]/50 px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-[#4ade80] flex items-center justify-center shadow shadow-[#4ade80]/20">
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
                <path
                  d="M10 3C6.686 3 4 5.686 4 9c0 2.21 1.197 4.14 2.98 5.19L10 17l3.02-2.81A5.994 5.994 0 0 0 16 9c0-3.314-2.686-6-6-6Z"
                  fill="#0f2018"
                />
                <circle cx="10" cy="9" r="2" fill="#4ade80" />
              </svg>
            </div>
            <span
              className="text-white text-lg tracking-tight"
              style={{ fontFamily: "var(--font-instrument-serif)" }}
            >
              GreenTime
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-white/60 text-sm hidden sm:block">
              {profileState.displayName}
            </span>
            <button
              onClick={() => setShowProfile(true)}
              className="w-8 h-8 rounded-full bg-[#4ade80] flex items-center justify-center text-[#0f2018] font-bold text-sm hover:bg-[#6ee7a0] transition-colors shrink-0"
              aria-label="Edit profile"
            >
              {profileState.displayName.charAt(0).toUpperCase()}
            </button>
            <button
              onClick={handleSignOut}
              className="text-xs text-white/80 border border-[#2d5040] px-3 py-1.5 rounded-lg hover:border-[#4d7a5d] hover:text-white/60 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-lg mx-auto px-4 py-8">
        {initialCrews.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center text-center gap-6 pt-12">
            <GolfFlagIcon />
            <div>
              <h2 className="text-white font-semibold text-lg mb-1">
                No crews yet
              </h2>
              <p className="text-[#4d7a5d] text-sm max-w-xs">
                Create a crew to start organizing tee times with your regular
                playing partners, or join one with an invite code.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setModal("create")}
                className="bg-[#4ade80] text-[#0f2018] font-semibold text-sm px-5 py-2.5 rounded-lg hover:bg-[#6ee7a0] active:scale-[0.98] transition-all"
              >
                + Create Crew
              </button>
              <button
                onClick={() => setModal("join")}
                className="border border-[#4ade80] text-[#4ade80] font-semibold text-sm px-5 py-2.5 rounded-lg hover:bg-[#4ade80]/10 active:scale-[0.98] transition-all"
              >
                Join a Crew
              </button>
            </div>
          </div>
        ) : (
          /* Crew list */
          <>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-white font-semibold text-lg">My Crews</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setModal("create")}
                  className="bg-[#4ade80] text-[#0f2018] font-semibold text-xs px-3.5 py-2 rounded-lg hover:bg-[#6ee7a0] active:scale-[0.98] transition-all"
                >
                  + Create
                </button>
                <button
                  onClick={() => setModal("join")}
                  className="border border-[#2d5040] text-white/60 font-semibold text-xs px-3.5 py-2 rounded-lg hover:border-[#4d7a5d] hover:text-white/80 active:scale-[0.98] transition-all"
                >
                  Join
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              {initialCrews.map((crew) => (
                <CrewCard key={crew.groupId} crew={crew} />
              ))}
            </div>
          </>
        )}
      </main>

      {/* Modals */}
      {modal === "create" && (
        <CreateCrewModal
          userId={userId}
          profile={profile}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "join" && (
        <JoinCrewModal
          userId={userId}
          profile={profile}
          onClose={() => setModal(null)}
        />
      )}
      {showProfile && (
        <ProfileModal
          userId={userId}
          initialProfile={profileState}
          onClose={() => setShowProfile(false)}
          onSuccess={(updated) => {
            setProfileState(updated);
            setShowProfile(false);
          }}
        />
      )}
    </div>
  );
}
