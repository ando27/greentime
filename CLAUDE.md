@AGENTS.md

## Core features built so far

- Auth (Supabase email/password), crew creation & join via invite code
- Events tab — create/edit/cancel events, RSVP, bail log, auto-RSVP from availability
- Availability tab — 14-day rolling calendar, per-slot toggles persisted to Supabase; GroupOverlapHeatmap shows crew overlap by day (color-coded, click to expand member names); allAvailability lifted into state in CrewDetail so heatmap updates in real time
- Members tab — member list, invite code copy
- Courses tab — nearby course search (OpenStreetMap/Overpass), group favorites with persist fix, Meet in the Middle (centroid + minimax with per-member drive distance bars), Book This shell (E-06 TODO), Pick from favorites in event creation

## Priority list

### Done
- C-01 Nearby course search
- C-02 Group favorites
- C-03 Meet in the Middle
- Session 3 remaining (courses)
- AV-02 Group overlap heatmap
- E-09 Spots remaining counter
- E-07 Bail reversal
- Bug fixes: bail log dedup, availability persistence, heatmap real-time updates

### Up next
- E-06 Book This — pre-fill CreateEventModal with course from CoursesTab / MeetInTheMiddle
