# GreenTime — Feature Tracker
Last updated: 2026-05-28

---

## Status key
⬜ Backlog · 🏗 In Progress · ✅ Done · ⏸ Skipped

---

## Events & RSVP

| # | Feature | Description | Lift | Status |
|---|---|---|---|---|
| E-01 | Auto-RSVP on availability match | If member marked available on event date, auto-RSVP them In | Low | ✅ Done |
| E-02 | Back-to-back tee times | If RSVPs exceed spots, auto-create second tee time | High | ⬜ Backlog |
| E-03 | Event notes | Free text field on event | Low | ✅ Done |
| E-04 | Event edit | Admin can edit event details after creation | Low | ✅ Done |
| E-05 | Event cancellation | Admin can cancel event with confirmation | Low | ✅ Done |
| E-06 | Book from Meet in the Middle | "Book This" button on MITM cards pre-fills event form | Low | ⬜ Backlog |
| E-07 | Bail reversal | If member bails then RSVPs back In before cutoff, remove bail_log entry | Low | ✅ Done |
| E-08 | Bail lockout | Option to lock RSVPs X hours before event instead of allowing reversal | Low | ⏸ Skipped — UX unclear, revisit later |
| E-09 | Spots remaining | Subtract "In" RSVPs from total spots, show spots left on event card | Low | ✅ Done |

---

## Courses

| # | Feature | Description | Lift | Status |
|---|---|---|---|---|
| C-01 | Nearby course search | OpenStreetMap/Overpass, no API key | Low | ✅ Done |
| C-02 | Group favorites | Save courses crew-wide | Low | ✅ Done |
| C-03 | Meet in the Middle | Centroid + Minimax algorithms | Medium | ✅ Done |
| C-04 | Google Places upgrade | Better course coverage than OSM | Medium | ⬜ Backlog |

---

## Auth & Profiles

| # | Feature | Description | Lift | Status |
|---|---|---|---|---|
| A-01 | Magic link auth | Passwordless email login | Low | ✅ Done |
| A-02 | Email + password auth | Standard signup/login, primary in Next.js version | Medium | ✅ Done |
| A-03 | Guest mode | Join by code, no account | Low | ✅ Done |
| A-04 | User profiles | Display name + home location | Low | ✅ Done |
| A-05 | Multi-crew support | Be in multiple groups | Low | ✅ Done |
| A-06 | Set password from profile | Magic link users can add a password | Low | ✅ Done |

---

## App Pages

| # | Feature | Description | Lift | Status |
|---|---|---|---|---|
| P-01 | Suggestions page | Submit + upvote feature ideas | Low | ✅ Done |
| P-02 | Roadmap page | Hardcoded, manually updated | Low | ⬜ Backlog |
| P-03 | Changelog page | Hardcoded version history | Low | ⬜ Backlog |
| P-04 | Hamburger menu | Global nav to app pages | Low | ✅ Done |
| P-05 | Full profile page | Replace profile modal with full /profile page (name, location, stats) | Low | ⬜ Backlog |
| P-06 | PWA support | manifest.json + service worker, Add to Home Screen | Low | ⬜ Backlog |

---

## Availability

| # | Feature | Description | Lift | Status |
|---|---|---|---|---|
| AV-01 | Availability calendar | 2-week scroll, morning/afternoon/evening toggles | Low | ✅ Done |
| AV-02 | Group overlap heatmap | Shows which days most members are free | Medium | ✅ Done |
| AV-03 | Other members' availability | See crew availability, not just your own | Low | ⬜ Backlog |

---

## Infrastructure

| # | Feature | Description | Lift | Status |
|---|---|---|---|---|
| X-01 | Next.js migration | Migrate from single HTML to Next.js | High | ✅ Done (greentime-next) |
| X-02 | Env vars for Supabase keys | Move keys out of HTML | Low | ✅ Done |
| X-03 | Firefox fix | Proxy Supabase through Vercel rewrites | Low | ✅ Done |
| X-04 | Next.js Vercel deployment | Deploy greentime-next to Vercel | Low | ✅ Done — https://greentime-app.vercel.app |
| X-05 | Real-time updates | Supabase subscriptions, no refresh needed | Medium | ⬜ Backlog |

---

## Skipped / Won't Do

| Feature | Reason |
|---|---|
| SMS notifications | Not a priority. May revisit much later |
| 18Birdies integration | API not public |
| Handicap tracking | Out of scope |
| In-app chat | Out of scope — group texts handle this |
| In-app payments | Too complex — Venmo/Zelle links sufficient |
| Admin kick members | Low priority |
| Venmo link on profile | Low priority |
