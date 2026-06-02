# GreenTime — Project Handoff & Context Document
Last updated: 2026-05-28

This document exists so any new Claude conversation can pick up exactly where we left off without losing context. Read this before doing anything.

---

## What is GreenTime?

GreenTime is a web app for golf friend groups. The core problem it solves: organizing a group of golfers is painful because everyone's availability lives in someone's phone, there's no central place to coordinate, and when someone bails on a booked tee time there's no accountability system.

**Core features built so far:**
- Create or join a group (crew) via a shareable 6-character invite code
- Availability calendar — each member marks their free days with morning/afternoon/evening toggles; Next.js version uses a compact 2-week horizontal scroll view
- Group overlap heat map — shows which days the most members are free simultaneously
- Tee time events — schedule a round with course, date, time, spots, greens fee, and optional notes
- Event edit — admin can edit any event field after creation
- Event cancellation — admin can cancel an event with confirmation prompt
- RSVP system — members tap In or Out on each event
- Auto-RSVP (E-01) — members with availability marked on an event date are automatically RSVPed In when the event is created; banner shows on event card for auto-RSVPs
- Profile modal — accessible from crew list header; shows initials avatar and display name; used to sign out
- Bail tracker — if someone RSVPs In then switches to Out within the cutoff window, a bail is logged publicly with one-tap Venmo/CashApp payment request links (Zelle removed)
- Nearby course search — uses OpenStreetMap/Overpass API (no API key needed, free)
- Group favorites — save courses that the whole crew sees
- Meet in the Middle — finds courses geographically central to all members. Two algorithms: Centroid (geographic average) and Minimax/Fairest for All (minimizes the longest individual drive). Each course card shows per-member drive distances as a bar chart
- Magic link authentication via Supabase Auth — passwordless email login
- User profiles — display name and home location stored once, applies across all crews
- Multi-crew support — authenticated users can be in multiple groups and switch between them
- Guest/anonymous mode — join by code with just a name, no account required
- Hamburger menu (☰) — top-right of header, opens slide-out panel with links to Suggestions, Roadmap, Changelog
- Suggestions page — authenticated users can submit feature ideas and upvote others

---

## Tech stack (LEGACY — single HTML file)

| Layer | Technology |
|---|---|
| Frontend | Single HTML file — vanilla JS, custom CSS, no framework |
| Backend/DB | Supabase (PostgreSQL + Auth) |
| Course search | OpenStreetMap Overpass API (free, no key) |
| Geocoding | Nominatim (OpenStreetMap, free, no key) |
| Auth | Supabase Magic Link (passwordless email) |
| Hosting | Vercel — https://greentime-two.vercel.app (legacy, no longer updated) |

**Important:** Legacy HTML version is no longer updated. Kept for reference only.

---

## Tech stack (ACTIVE — greentime-next)

Migration from single HTML to Next.js is complete. Active development is now in `greentime-next/`. This is the current stack:

| Layer | Technology |
|---|---|
| Frontend | Next.js (App Router) + Tailwind CSS |
| Backend/DB | Supabase (same project, same schema) |
| Auth | Supabase Auth — email+password primary, magic link secondary, guest preserved |
| Course search | OpenStreetMap Overpass API (unchanged) |
| Geocoding | Nominatim (unchanged) |
| Hosting | Vercel — https://greentime-app.vercel.app |

**Supabase project:**
- URL: `https://fhflxafuvnvafkhwniiz.supabase.co`
- Anon key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZoZmx4YWZ1dm52YWZraHduaWl6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNDQ3MjIsImV4cCI6MjA5MDgyMDcyMn0.E3e-HpSRmxM9sy2RzYmet1qbTJOXRvsDIoGqjKLFKKk`
- Keys stored in `.env.local` (not committed) and Vercel environment variables

**GitHub repo:** `https://github.com/ando27/greentime`
**Local path:** `~/greentime-next/`

**Migration sessions:**
- ✅ Session 1 — Foundation + Auth: scaffold, Tailwind, env vars, email+password auth, magic link option, guest option, profile setup, Vercel deploy
- ✅ Session 2 — Crew List + Events: crew list, create/join crew, events tab, RSVP, bail tracker, auto-RSVP
- ✅ Session 3 — Availability + Courses: availability tab, 2-week scroll calendar, morning/afternoon/evening toggles, nearby course search, group favorites, Meet in the Middle
- ✅ Session 4 — AV-02, E-07, E-09, bug fixes
- ✅ Vercel deployment — live at https://greentime-app.vercel.app

**Auth flow for Next.js version:**
- Primary: email + password (create account or sign in)
- Secondary: "Send me a magic link instead" (smaller, below primary)
- Tertiary: "Continue as guest" (text link only, very subtle — app should push account creation)
- New users: email → set password → display name + location setup → crew list
- Existing users: email → password → crew list
- Magic link path: email → check email screen → crew list

---

## Database schema (Supabase)

All tables are in the `public` schema with RLS enabled.

```
groups
  id              uuid PK
  name            text
  invite_code     text UNIQUE
  favorite_courses jsonb DEFAULT '[]'
  created_at      timestamptz

members
  id              uuid PK
  group_id        uuid FK → groups
  name            text
  is_admin        boolean
  user_id         uuid FK → auth.users (nullable — null = guest)
  home_lat        float
  home_lng        float
  home_label      text
  joined_at       timestamptz

availability
  id              uuid PK
  member_id       uuid FK → members
  group_id        uuid FK → groups
  avail_date      date
  time_of_day     text ('morning' | 'afternoon' | 'evening')
  created_at      timestamptz
  UNIQUE(member_id, avail_date, time_of_day)

events
  id              uuid PK
  group_id        uuid FK → groups
  created_by      uuid FK → members
  course_name     text
  event_date      date
  tee_time        time
  spots           int
  greens_fee      numeric(8,2)
  cutoff_hours    int DEFAULT 24
  notes           text
  created_at      timestamptz

rsvps
  id              uuid PK
  event_id        uuid FK → events
  member_id       uuid FK → members
  group_id        uuid FK → groups
  status          text ('in' | 'out')
  auto_rsvp       boolean DEFAULT false
  confirmed_at    timestamptz
  updated_at      timestamptz
  UNIQUE(event_id, member_id)

bail_log
  id              uuid PK
  event_id        uuid FK → events
  member_id       uuid FK → members
  group_id        uuid FK → groups
  bailed_at       timestamptz
  amount_owed     numeric(8,2)

user_profiles
  id              uuid PK FK → auth.users
  display_name    text
  home_lat        float
  home_lng        float
  home_label      text
  created_at      timestamptz
  updated_at      timestamptz

suggestions
  id              uuid PK
  user_id         uuid FK → auth.users
  display_name    text
  title           text
  description     text
  upvotes         integer DEFAULT 0
  created_at      timestamptz

suggestion_upvotes
  id              uuid PK
  suggestion_id   uuid FK → suggestions
  user_id         uuid FK → auth.users
  UNIQUE(suggestion_id, user_id)
```

**Supabase helper function:**
```sql
upsert_user_profile(p_display_name, p_home_lat, p_home_lng, p_home_label)
-- Creates or updates a user_profiles row for the currently authenticated user
-- Called via sb.rpc('upsert_user_profile', { ... })
```

---

## Current source

**Active codebase:** `greentime-next/` — Next.js App Router, Tailwind v4, Supabase SSR. All new development happens here.

**Legacy file:** `index.html` at `~/greentime/index.html` (v5.2.0) — single self-contained HTML file, kept for reference. No longer updated.

**To deploy updates:**
```
cd ~/greentime-next
git add . && git commit -m "description" && git push
```
Vercel auto-deploys in ~30 seconds.

---

## Priority list

### ✅ Done
- Vercel deployment + Firefox proxy fix (legacy HTML)
- All P1 bug fixes
- Event notes, edit, cancellation
- E-01: Auto-RSVP on availability match
- Hamburger menu, Suggestions page with upvoting
- Next.js migration (greentime-next) — Sessions 1–3 complete
- Availability calendar (2-week scroll, morning/afternoon/evening)
- Courses tab: nearby search (Nominatim + Overpass), group favorites, Meet in the Middle (C-01, C-02, C-03)
- E-09: Spots remaining counter on event card
- E-07: Bail reversal
- AV-02: Group overlap heatmap (14-day scroll, color by member count, click to expand)
- Bug fixes: bail log deduplication, availability persistence, heatmap real-time updates
- Next.js Vercel deployment — live at https://greentime-app.vercel.app
- Member cards expansion (home location, bail count per member)
- A-06: Set password from profile modal (magic link users + password changes)

### 🟠 Up Next

### ⬜ Backlog
- AV-03: See other members' availability
- E-06: Book from Meet in the Middle
- Roadmap page (menu placeholder exists)
- Changelog page (menu placeholder exists)
- Back-to-back tee times (E-02)
- Full profile page (P-05)
- PWA support (P-06)

### ⏸ Deprioritized / Skip for now
- SMS notifications — not a priority, may revisit later
- 18Birdies integration — API likely not public
- Handicap tracking — out of scope for now (field doesn't exist in schema)
- In-app chat — out of scope
- Admin kick members — low priority
- Venmo link on profile — low priority
- E-08: Bail lockout — UX unclear, revisit later

---

## Vision reminder
GreenTime's core purpose is scheduling tee times with friends. Keep features focused on that. Don't over-build.

---

## Known bugs & gotchas

**Firefox bounce tracker:**
Firefox Enhanced Tracking Protection classifies `supabase.co` as a bounce tracker and blocks requests. Fix: proxy Supabase through own domain in Next.js version via Vercel rewrites. Already implemented.

**Clearing cookies = logged out:**
Expected behavior.

**Race condition in enterCrew (fixed):**
loadAll() was firing before state was fully set. Fixed with 100ms delay.

**Why OpenStreetMap over Google Places:**
No API key, no billing, free forever at our scale.

**Why guest mode is preserved:**
Lowers barrier for friends who just want to see the tee time without creating an account.

**Bail cutoff logic:**
Bail is logged when: status flips from 'in' → 'out' AND current time is within `cutoff_hours` of the tee time AND no bail_log row already exists for this member + event.

**Auto-RSVP (E-01):**
Fires on event creation only. Creator is excluded. Uses `auto_rsvp: true` flag on rsvps row to distinguish from manual RSVPs. Banner shown on event card only for auto-RSVPs.

**Bail reversal (E-07):**
If member RSVPs back In before cutoff, bail_log entry is deleted. Implemented.

**Bail log deduplication:**
`dedupedBailLog` in `EventCard.tsx` reduces `bailLog` by `member_id`, keeping only the most recent entry per member per event (by `bailed_at`). Prevents duplicate bail rows showing if multiple entries somehow exist for the same member+event.

**RSVP bail logic clarification:**
Bail is only triggered when status flips from 'in' → 'out' within `cutoff_hours`. Clicking 'in' twice does not trigger a bail — this is correct behavior, no bug.

**Availability time slot labels:**
Labels were changed from AM/PM/Eve to Morning/Afternoon/Twilight. If any existing availability rows in Supabase still use 'morning'/'afternoon'/'evening' as the `time_of_day` value, the display labels are purely cosmetic — the DB values stay the same.

**Member cards:**
Members tab shows name, admin badge, home location, and bail count. Handicap is not yet implemented — a new column on the `members` table will be needed before that can be built.
