export interface CourseItem {
  name: string;
  lat: number;
  lng: number;
  address?: string;
}

export interface DBGroup {
  id: string;
  name: string;
  invite_code: string;
  favorite_courses: CourseItem[] | null;
}

export interface DBMember {
  id: string;
  name: string;
  is_admin: boolean;
  user_id: string | null;
  home_lat: number | null;
  home_lng: number | null;
  home_label: string | null;
  joined_at: string;
}

export interface DBEvent {
  id: string;
  group_id: string;
  created_by: string;
  course_name: string;
  event_date: string; // 'YYYY-MM-DD'
  tee_time: string; // 'HH:MM:SS'
  spots: number;
  greens_fee: number | null;
  cutoff_hours: number;
  notes: string | null;
  created_at: string;
}

export interface DBRsvp {
  id: string;
  event_id: string;
  member_id: string;
  group_id: string;
  status: "in" | "out";
  auto_rsvp: boolean;
  confirmed_at: string | null;
  updated_at: string | null;
}

export interface DBBailLog {
  id: string;
  event_id: string;
  member_id: string;
  group_id: string;
  bailed_at: string;
  amount_owed: number | null;
}

export interface DBAvailability {
  id: string;
  member_id: string;
  group_id: string;
  avail_date: string; // 'YYYY-MM-DD'
  time_of_day: "morning" | "afternoon" | "evening";
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function formatTime(timeStr: string): string {
  const [h, min] = timeStr.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(min).padStart(2, "0")} ${ampm}`;
}

export function formatMoney(amount: number | null): string {
  if (!amount) return "";
  const n = Number(amount);
  return `$${n % 1 === 0 ? n : n.toFixed(2)}`;
}

export function isWithinCutoff(
  eventDate: string,
  teeTime: string,
  cutoffHours: number
): boolean {
  const [ey, em, ed] = eventDate.split("-").map(Number);
  const [eh, emin] = teeTime.split(":").map(Number);
  const dt = new Date(ey, em - 1, ed, eh, emin, 0);
  const hoursUntil = (dt.getTime() - Date.now()) / 3_600_000;
  return hoursUntil >= 0 && hoursUntil <= cutoffHours;
}
