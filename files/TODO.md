# GreenTime: TODO

Last updated: 2026-11-16
Read `files/CLAUDE.md` first. Work top to bottom. Each numbered item should be its own commit with an entry in `files/CHANGES.md`.

Status key: ⬜ open · 🟨 in progress · ✅ done

## P0: Fix sign-in, profiles, and groups

Code is done and on branch `p0-p1-fixes`. The existing Supabase project was kept and upgraded in place on Nov 17 (data preserved, keys unchanged). Still needed from Justin: steps 3 to 5 in `files/SUPABASE_SETUP.md` (URLs and sign-in settings), then run the testing checklist below.

- ✅ P0-1 · Audit the repo (Repo map in `files/CLAUDE.md`)
- ✅ P0-2 · Consolidated schema file (`supabase/schema.sql`) — applied to the live project via `supabase/migrations/20261117_upgrade_existing_project.sql`
- ✅ P0-3 · Supabase keys and URLs (`files/SUPABASE_SETUP.md`) — keys unchanged (project reused); Justin still has to check Site URL / Redirect URLs in the dashboard
- ✅ P0-4 · Fix the auth state handling
- ✅ P0-5 · Profile lookup and first-run setup
- ✅ P0-6 · Crew list loading
- ✅ P0-7 · Home location saving
- ✅ P0-8 · Error surfacing everywhere
- ✅ P0-9 · Duplicate member guard (was F-10)

## P1: Bugs to fix right after P0

- ✅ P1-1 · Timezone date bug
- ✅ P1-2 · Bail window timezone check
- ✅ P1-3 · Nominatim usage rules
- ✅ P1-4 · Overpass reliability — code done; confirm course search works on the deployed site (could not reach Overpass from the build sandbox)
- ⬜ P1-5 · Invite link URL. Note: the app currently shares only the 6-character code (Members tab → Copy). There is no share link yet, so this item means adding one: a "Copy invite link" button using `window.location.origin`, plus a `/join/CODE` page. Groundwork already in place: the proxy protects `/join` and remembers it through sign-in (`next` param), and `joinCrewByCode` in `src/lib/crews.ts` is ready to reuse.

## P2: Security (before inviting real users)

- ⬜ P2-1 · Anonymous sign-ins for guests. Note: "Continue as guest" already uses Supabase anonymous sign-in; it just needs enabling in Authentication → Sign In / Providers. Remaining work: a lighter "just enter your name" path and linking an email later.
- ⬜ P2-2 · Tighten RLS. Members-only read/write per group; own member row, availability, RSVPs only; admin-only group edits and member removal; `user_profiles` readable by crewmates, writable by owner (the write half is already done in P0-2).
- ⬜ P2-3 · Join-by-code RPC. Security-definer `join_group_by_code(code, display_name)` that finds the group and inserts the member row in one step. Swap it into `joinCrewByCode`.

## P3: Mobile pass

- ⬜ P3-1 · Tab bar (the Next.js app has 4 tabs today: events, members, availability, courses)
- ⬜ P3-2 · Tap targets and text. Buttons at least 44px tall, calendar count text at least 11px, long names truncate.
- ⬜ P3-3 · Inputs on iOS and Android. Date/time inputs, email keyboard, inputs at 16px+ so the page doesn't zoom.
- ⬜ P3-4 · Real-device test on an iPhone and an Android phone.

## P4: Features

Quick wins
- ✅ F-04 · Book from Meet in the Middle (shipped as E-06 in June)
- ⬜ Edit and delete events: admin-only today; extend to the event creator
- ⬜ Leave a crew for signed-in users. Delete a crew and regenerate invite code for admins.
- ⬜ F-06 · Remove a member (admin only, with confirm)
- ⬜ Realtime: Supabase Realtime subscriptions on rsvps, events, availability, bail_log

Bail system
- ⬜ Venmo and Cash App handle on the profile so payment links prefill the recipient
- ⬜ Payment links go to the event organizer
- ⬜ "Mark as paid" status on each bail (new `paid_at` column)

Scheduling
- ⬜ "Suggest a tee time" button on best upcoming days
- ⬜ Add to calendar (.ics download) for events you're In on
- ⬜ Waitlist when an event is full; promote the first person when someone drops
- ⬜ Event comment thread (notes already exist)

Polish
- ⬜ Loading, empty, and error states on every screen (crew list and crew screen done in P0)
- ⬜ Show course phone and website from OSM tags when available
- ⬜ PWA: manifest, app icon, installable
- ⬜ F-07 · Email notifications (Supabase Edge Functions plus Resend)
- ⬜ F-09 · Google Places API, only if OSM course coverage proves too thin

Design and branding
- ⬜ D-01 · App icon (32, 192, 512px plus SVG)
- ⬜ D-02 · Name and slogan. Candidates: TeeUp, The Loop, FourUp, StandingTee, RoundUp, TeeSheet. Slogans: "Stop texting your foursome," "Tee times, sorted," "Book it. Play it. Don't bail."
- ⬜ D-03 · Mobile responsiveness: covered by P3

## Testing checklist (run after P0, and again after P2)

- [ ] Sign in with magic link on desktop; refresh the page and stay signed in
- [ ] Sign in on phone with the same email; profile and crews appear
- [ ] First-time sign-in shows the name setup screen once, never again
- [ ] Set home location from profile; it shows in every crew and in Meet in the Middle
- [ ] Create a crew, share the invite code, join from another account
- [ ] Join a crew you're already in; no duplicate member row
- [ ] Guest joins by code (needs Anonymous sign-ins enabled in Supabase)
- [ ] Mark availability after 7pm; dates are correct (no off-by-one)
- [ ] RSVP In then Out inside the cutoff; exactly one bail logged
- [ ] RSVP In then Out outside the cutoff; no bail logged
- [ ] Favorite a course; another member sees it
- [ ] Course search and Meet in the Middle with 2+ locations; courses and distance bars load
- [ ] Switch between two crews; data never mixes
- [ ] Every screen usable at 375px wide
- [ ] Turn off Wi-Fi mid-action; a visible error appears instead of silent failure
