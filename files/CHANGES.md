# GreenTime Dev Log
Last updated: 2026-05-28

---

## Wed May 28, 2026 — Next.js Vercel Deployment
- Pushed greentime-next/ to GitHub repo (ando27/greentime)
- Created new Vercel project, set root directory to greentime-next/
- Added Supabase env vars to Vercel
- Live at https://greentime-app.vercel.app — auth, crew, events, availability, courses all verified working

---

## Fri May 15, 2026 — AV-02 + Bug Fixes
- AV-02: GroupOverlapHeatmap built — 2-week scroll, color-coded by member overlap count, click to expand member names
- Bug fix: bail log deduplication — dedupedBailLog keeps only most recent entry per member per event
- Bug fix: availability selections now persist — allAvailability lifted into state in CrewDetail, myAvailability filtered before passing to AvailabilityCalendar
- Bug fix: heatmap now updates in real time when availability is toggled — onAvailabilityChange callback + myRowsRef pattern to avoid stale closures
- E-09: Spots remaining counter added to event cards — shows X spots left, turns amber/red when full
- E-07: Bail reversal implemented — if member RSVPs back In before cutoff, bail_log entry is deleted
- E-08: Bail lockout deprioritized — UX unclear, revisit later
- Renamed availability time slots: AM → Morning, PM → Afternoon, Eve → Twilight

---

## Thu May 14, 2026 — Session 3 Complete (Courses Tab)
- CoursesTab built: nearby search via Nominatim + Overpass, results sorted by distance
- Group favorites: add/remove, persists via groups.favorite_courses jsonb
- Fixed favorites persistence bug — favorite_courses was not being read back after save
- Saved ✓ confirmation on Add to Favorites button
- Book This shell on course cards (E-06 TODO)
- Pick from favorites disclosure in CreateEventModal
- MeetInTheMiddle component: centroid + minimax algorithms, per-member drive distance bars
- Courses tab wired into CrewDetail alongside Events, Availability, Members

---

## Wed May 13, 2026 — Next.js Migration Sessions 1-3 (partial)

### Session 1 — Foundation + Auth
- Scaffolded greentime-next with Next.js, Tailwind v4, Supabase SSR
- Email+password auth, magic link (swappable), guest mode
- /setup profile flow with Nominatim geocoding
- /auth/callback for magic link handling
- Vercel proxy rewrite for Firefox tracking protection fix
- middleware (proxy.ts) for session refresh

### Session 2 — Crew List + Events
- Full crew list with create/join modals, invite codes
- /crews/[id] with Events, Members tabs
- Event cards: RSVP toggle with deselect, auto-RSVP banner, bail tracker, admin edit/cancel
- Bail logic: in→out within cutoff_hours triggers bail_log insert
- Auto-RSVP (E-01) on event creation: bulk availability check + insert
- Profile modal from crew list header with initials avatar

### Session 3 (partial) — Availability
- Availability tab added to crew detail
- Compact 2-week horizontal scroll calendar (not full month grid)
- Morning/Afternoon/Evening pill toggles per day
- Optimistic UI, past days locked, WCAG AA contrast on pills

### UI fixes
- Header "Sign Out" and "My Crews" text lightened to white/80
- Event date/time text lightened for accessibility
- RSVP deselect: clicking active status removes RSVP row entirely
- Removed Zelle from bail payment links (Venmo + CashApp only)

---

## Wed May 13, 2026

### Hamburger Menu
- Added ☰ button to top-right of header, visible on all screens
- Slide-out menu panel with links to Suggestions, Roadmap, Changelog
- Roadmap and Changelog wired as placeholders for future build

### Suggestions Page
- Created `suggestions` and `suggestion_upvotes` Supabase tables with RLS policies
- Authenticated users can submit ideas (title + optional description)
- All authenticated users can view and upvote/toggle suggestions
- Sorted by upvote count
- Guest users can view but not submit

### E-01: Auto-RSVP on Availability Match
- When a new event is created, members with availability on that date are automatically RSVPed as "In"
- Creator is excluded from auto-RSVP
- Added `auto_rsvp boolean DEFAULT false` column to `rsvps` table
- Event cards show "✓ Auto-RSVPed based on your availability" banner — only for auto-generated RSVPs

### Next.js Migration — Scoped
- Decided to migrate from single HTML file to Next.js
- Auth plan: email+password primary, magic link secondary, guest tertiary (subtle)
- 3 sessions scoped: Foundation+Auth, Crew+Events, Courses+Availability
- SMS and other non-core features deprioritized to keep focus on tee time scheduling

---

## Earlier sessions (pre-2026-05-13)

- v5.1.0 — Vercel deploy live at greentime-two.vercel.app (legacy HTML, no longer updated)
- v5.1.0 — Event notes, event edit, event cancellation (admin)
- v5.0.1 — Fix: profile button not opening settings panel
- v5.0.0 — Magic link auth, user profiles, crew list, multi-crew support
- v4.5.0 — Meet in the Middle (centroid + minimax algorithms)
- v4.0.0 — Nearby course search (OpenStreetMap), group favorites
- v3.0.0 — Events, RSVP, bail tracker
- v2.0.0 — Supabase backend, availability calendar
- v1.0.0 — Group system, invite codes
