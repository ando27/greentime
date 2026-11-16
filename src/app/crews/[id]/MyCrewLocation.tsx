"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import LocationInput from "@/components/LocationInput";
import { useToast } from "@/components/Toast";
import type { HomeLocation } from "@/lib/profile";
import type { DBMember } from "./types";

/**
 * Lets a member set their starting location for THIS crew only.
 * Updates just their own member row. (Saving from the profile, on the crew
 * list screen, sets it for every crew at once.)
 */
export default function MyCrewLocation({ member }: { member: DBMember }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();

  const [editing, setEditing] = useState(false);
  const [picked, setPicked] = useState<HomeLocation | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!picked || saving) return;
    setSaving(true);

    // .select() returns the changed row, so a blocked update can't pass silently
    const { data, error } = await supabase
      .from("members")
      .update({
        home_lat: picked.lat,
        home_lng: picked.lng,
        home_label: picked.label,
      })
      .eq("id", member.id)
      .select("id, home_label")
      .maybeSingle();

    setSaving(false);

    if (error) {
      toast.error(error, "Couldn't save your location.");
      return;
    }
    if (!data || data.home_label !== picked.label) {
      toast.error("Your location didn't save. Please try again.");
      return;
    }

    toast.success(`Saved for this crew: ${picked.label}`);
    setEditing(false);
    setPicked(null);
    router.refresh(); // reload members so Meet in the Middle sees it
  }

  return (
    <div className="bg-[#0f2018] border border-[#2d5040] rounded-xl p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-[#4d7a5d] font-medium uppercase tracking-wider mb-0.5">
            Your location in this crew
          </p>
          <p className="text-white/80 text-sm truncate">
            {member.home_label ? `📍 ${member.home_label}` : "Not set"}
          </p>
        </div>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="shrink-0 text-xs font-medium px-3.5 py-2.5 rounded-lg border border-[#2d5040] text-[#4d7a5d] hover:border-[#4d7a5d] hover:text-white/60 transition-colors"
          >
            {member.home_label ? "Change" : "Set"}
          </button>
        )}
      </div>

      {editing && (
        <div className="mt-3 flex flex-col gap-3">
          <LocationInput
            id="crewLocation"
            value={picked}
            onChange={(location) => setPicked(location)}
            autoFocus
          />
          <p className="text-xs text-[#4d7a5d]">
            Changes this crew only. To change it everywhere, edit your profile
            on the My Crews screen.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => {
                setEditing(false);
                setPicked(null);
              }}
              className="flex-1 border border-[#2d5040] text-white/50 text-sm font-medium py-3 rounded-lg hover:border-[#4d7a5d] hover:text-white/70 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!picked || saving}
              className="flex-1 bg-[#4ade80] text-[#0f2018] font-semibold text-sm py-3 rounded-lg hover:bg-[#6ee7a0] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
