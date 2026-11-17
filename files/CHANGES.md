# GreenTime Dev Log
Last updated: 2026-11-16

---

## Tue Nov 17, 2026 — P3: Mobile pass

Method: an automated audit visits 17 screens at phone width and measures every button, link, input and piece of text. Before: 89 tap targets under 44px, 15 inputs under 16px, 24 pieces of text under 11px. After: zero, at both 375px and 320px wide. Screenshots were reviewed by eye as well.

### P3-1: Tab bar
- The app has four tabs (Events, Members, Availability, Courses), not six. They used to scroll sideways and "Courses" was cut off at 375px
- Now four equal columns that always fit, down to 320px, with no sideways scrolling. Bails stay on each event card and the Members tab, so no merge was needed
- Not done: a bottom navigation bar with icons. Four top tabs fit comfortably; revisit if a fifth tab is ever added

### P3-2: Tap targets and text
- Global rule in `src/app/globals.css`: on phones and touch screens every button, link and form control is at least 44px tall
- All text is at least 11px (calendar day names, slot labels, counts, badges and Meet in the Middle bar labels were 8 to 10px)
- Availability calendar rebuilt for touch: day columns widened from 60px to 84px; Morning / Afternoon / Twilight are full 44px buttons; the tiny "+1" crew badge is replaced by making the whole day header one large button
- Long names: crew name and event course name clamp to two lines; member names, bail names and course names truncate with an ellipsis instead of pushing buttons off the row
- Course cards on phones: the name gets its own line with the buttons underneath (names were being cut to about ten characters)
- Course search shows the nearest 10 with "Show 10 more", instead of one list of 60 or more
- Removed the greyed-out Zelle chip from the bail row (Zelle was removed earlier; the chip did nothing)

### P3-3: Inputs on iOS and Android
- Global rule: form text is 16px on phones, which stops iOS Safari zooming the page when a field is tapped
- Email fields ask for the email keyboard with auto-capitals and autocorrect off; the invite code field capitalises automatically; Spots and Bail cutoff get the number pad; Greens fee gets the decimal pad
- Date and time fields use the phone's native pickers and are full height
- Tall dialogs (new event, edit event, profile) scroll inside the screen and size to the visible area on phones (`dvh`), so the Save button is always reachable

### P3-4: Real-device test
- NOT done: this needs a real iPhone and a real Android phone. Everything above was checked in a phone-sized Chrome window with touch emulation, which cannot show Safari's real behaviour (input zoom, the keyboard covering fields, date pickers)

### Regression
- The full 32-check browser run against the live database passes after these changes

---

## Tue Nov 17, 2026 — P2: Security

Status: DONE and live. Code merged to `main` (commit `950e03d`) and the lock-down applied to the live database on Nov 17. See "Cutover" below for how it went.

### P2-3: Join-by-code RPC (plus create and preview)
- New database functions, applied to the live project (additive, changes no permissions): `join_group_by_code(code, display_name)`, `create_group(name)`, `get_invite_preview(code)`, and the helpers the policies use (`is_group_member`, `is_group_admin`, `owns_member`, `owns_member_in`, `shares_group_with`)
- The app now creates crews, joins by code, and shows invite pages only through these functions (`src/lib/crews.ts`). They are what let a non-member join once non-members can no longer read the tables
- Invite codes are now generated in the database, from letters and digits that can't be mistaken for each other (no I, O, 0, 1)

### P2-2: Tighten RLS
- `supabase/migrations/20261117_p2b_tighten_rls.sql`. After it runs:
  - You can only see and change data in crews you belong to
  - You can only change your own member row, availability, RSVPs and bails
  - Only crew admins can rename or delete the crew, remove members, or change who is an admin
  - Crews are created and joined only through the functions above
  - Profiles: readable by you and your crewmates, writable only by you
- Two database triggers protect things policies can't: a member can't make themselves admin or move a membership; a non-admin can't change the crew name or invite code (any member can still save crew favorites)
- Admins and an event's creator can add RSVPs for other members, which is what auto-RSVP needs
- Known gap, accepted for now: a member can remove their own bail through the database directly (the app only offers that inside the cutoff window)
- Undo script: `supabase/migrations/20261117_p2b_rollback_open_rls.sql`
- `supabase/schema.sql` now builds the tightened version for fresh projects

### P2-1: Guests
- "Continue as guest" already used Supabase anonymous sign-in, so guests have a real identity and are covered by the same rules. It is "just enter your name": location has been optional since P0-5
- New: a guest can save their account. A "Guest account" prompt on My Crews opens the profile, where adding an email and password turns the guest into a normal account with the same crews, availability and RSVPs

### Crew settings and member management (new; were P4 quick wins and F-06)
- Reported by Justin: "I'm the admin, but I don't have an option to rename or delete a crew." The rules allowed it, but the app had no buttons for it
- New "Crew settings" card on the Members tab. Admins: rename the crew, replace the invite code (old code and links stop working), delete the crew. Everyone: leave the crew
- A crew can't be left without an admin: the only admin is told to make someone else an admin first; the only member is told to delete the crew instead
- Admins can open any other member's card to "Make admin" / "Remove admin" or "Remove from crew"
- Every destructive action asks for confirmation (shared `ConfirmDialog`) and confirms the database really changed before saying so
- New database function `regenerate_invite_code(group_id)`, admins only, applied to the live project (additive)

### Tested
- Rules: 56 checks on a local Postgres copy with an admin, a member, an outsider and a signed-out visitor, run against both the migration scripts and `schema.sql`. Every "blocked" case was confirmed blocked for the intended reason. The undo script was run too
- App: 32 checks in a real browser against the live database (still on the old open rules) with the new code: create crew, invite code, create event, join by code, wrong code, RSVP in/out, join twice, guest by invite link with just a name, guest saves account and signs in elsewhere with the email, rename, make/remove admin, remove member, replace invite code (old link dies, new one works), sole admin can't leave, member sees no admin controls, member leaves, admin deletes crew. 28 passed outright; the other 4 were the test script misreading confirmation messages, and the database confirmed those actions worked. The script has been corrected for the cutover run

### Cutover (done Nov 17)
1. Merged `p2-security` to `main`; Vercel production deployment succeeded
2. Applied `20261117_p2b_tighten_rls.sql` to the live database. The first attempt timed out waiting on Supabase's confirmation prompt and changed nothing; the second was approved by Justin and applied
3. Re-ran the browser checks against the locked-down live database straight away: 32 of 32 passed, 0 page errors
4. Then tried to get around the rules by talking to the database directly as a regular member: 11 of 11 attempts blocked (can't see other crews, members or profiles; can't rename or delete a crew; can't create a crew by writing to the table; can't make themselves admin; can't remove the admin; signed-out visitors get nothing)
5. Supabase security check afterwards: warnings only, all expected by design (guests are anonymous sign-ins; the create/join functions are meant to be callable by signed-in users). One worth doing by hand: turn on leaked password protection in Authentication settings
6. Test data removed: the "ZZ P2 Test" crews and throwaway guest accounts. Kept on purpose for future testing: "ZZ Claude Test Crew" and the two "ZZTest (Claude)" accounts
- The undo script was not needed

---

## Tue Nov 17, 2026 — Console error check, forgot password, invite link (P1-5)

Tested for real this time: the app ran against the live Supabase project in a browser, signed in as the two "ZZTest (Claude)" accounts (their passwords were reset to a random value for this; no real account was touched).

### Sign-in library console error ("Navigator LockManager lock ... immediately failed")
- Seen once in Justin's Firefox console on a Vercel preview. Could NOT be reproduced in Chrome, in dev or production builds, through sign-in, tab switches, hide/show of the tab, and reloads (0 page errors)
- It comes from the Supabase library's background "is my session about to expire?" check finding the session busy and skipping that round. The library is written to ignore that case; sign-in and staying signed in were unaffected in every test
- Action taken: updated `@supabase/supabase-js` from 2.105 to 2.119 (latest, same major version) and re-ran the full test. Not confirmed fixed in Firefox, since Firefox isn't available in the test environment. Treat as console noise unless someone is actually signed out unexpectedly

### Forgot password (new)
- "Forgot password?" link on the sign-in page → `/forgot-password` (enter email, get a reset link) → the link signs you in through `/auth/callback` and lands on `/reset-password` (choose a new password)
- The "check your email" message is the same whether or not the account exists, so the form can't be used to discover who has an account
- `/reset-password` opened without a valid link explains why and offers to send a new one
- Shared `AuthCard` component for the small signed-out screens
- Tested against the live project: short and mismatched passwords rejected; new password saved; old password stops working; new password signs in; request accepted by Supabase
- NOT tested: the email itself and clicking its link (no way to receive mail in the test environment). Until an email sender is connected in Supabase, reset emails only reach Supabase team addresses. Like magic links, the default link only works in the browser that requested it

### P1-5: Invite link URL
- Finding: the app had no share link at all, only the 6-character code. So this item was built rather than fixed
- Members tab: new "Share invite link" button. The link is built from `window.location.origin`, so it is always the real `https://` address of the site being viewed, never a file path or `null`. On phones it opens the share sheet; elsewhere it copies the link
- New page `/join/CODE`: shows the crew name and a "Join crew" button. Joining happens on the button press, not just by opening the link, so link previews can't add anyone
- Signed-out visitors are sent to sign-in (or create account, or guest) and brought back to the invite afterwards, including through first-time profile setup
- Already a member → goes straight into the crew. Unknown or malformed code → a clear message
- Uses the same `joinCrewByCode` as the join dialog, so the duplicate-member guard applies
- Tested against the live project with two accounts: link copied correctly; signed-out visitor → sign in → back on the invite → join → in the crew; second visit goes straight in; bad codes handled; exactly one member row created

---

## Mon Nov 16, 2026 — P0 (sign-in, profiles, groups) + P1 (bugs)

One entry per TODO item, each its own commit.

### P0-1: Repo audit
- Mapped the codebase and added a "Repo map" section to `files/CLAUDE.md` (router, Supabase clients, auth handling, where each feature lives)
- Finding: this app is server-rendered with cookie sessions, so there was no `onAuthStateChange` deadlock to remove. The real causes of the P0 symptoms are listed under each item below

### P0-2: Consolidated schema file
- New `supabase/schema.sql` rebuilds the whole database from an empty project in one run (safe to run twice)
- All 9 tables (the 7 core tables plus `suggestions` and `suggestion_upvotes`) with constraints, foreign keys with cascade deletes, and value checks
- New unique constraints: `members (group_id, user_id)` and `bail_log (event_id, member_id)`
- `upsert_user_profile` RPC now returns the saved row
- RLS on for every table with select/insert/update/delete policies written out. Open to any signed-in user (guests included), nothing for signed-out visitors; `user_profiles` is write-your-own-row only. P2 tightens the rest
- Indexes on `members.user_id`, `members.group_id`, and `group_id` on every child table
- Verified by running it twice against a local Postgres 16 with stand-in `auth` objects: duplicate member rejected, other users' profiles not writable, signed-out role denied

### P0-3: New Supabase keys and URLs
- New `files/SUPABASE_SETUP.md`: exact steps for running the schema, copying the URL and key into `.env.local` and Vercel, and setting Site URL / Redirect URLs
- Removed the old project's URL and key from the repo: deleted the stray `env.local` file (wrong name, never loaded), removed the hardcoded Supabase rewrite in `next.config.ts` (unused), and removed them from `files/CLAUDE.md`. Added `.env.example`
- Missing keys now give a clear "Supabase is not configured" message instead of a cryptic crash
- Confirmed `signInWithOtp` and `signUp` pass `emailRedirectTo` built from the current origin
- `/auth/callback` now also accepts `token_hash` links (work from any device, needs the optional email template change in the setup doc) and reports expired or already-used links
- `/login` now shows a message when a sign-in link fails. Before, it silently landed back on the sign-in form

### P0-4: Auth state handling
- One shared Supabase browser client (`src/lib/supabase/client.ts`) used by every component
- New `AuthListener` in the root layout: calls `getSession()` on load and handles `INITIAL_SESSION`, `SIGNED_IN`, `TOKEN_REFRESHED`, and `SIGNED_OUT`. Nothing is awaited inside the `onAuthStateChange` callback (follow-up work uses `setTimeout(..., 0)`), so the supabase-js deadlock cannot happen. Signing out in one tab now signs out the others
- Fixed: redirects from the proxy dropped freshly refreshed session cookies, which could leave the browser holding an expired token (looks like being randomly signed out)
- Fixed: creating an account while "Confirm email" is on sent the user to `/setup` with no session, which bounced them to the sign-in page with no explanation. They now see a "Check your email" screen. This is a likely cause of "the profile didn't stick"
- Page refresh keeps you signed in (session is in cookies, refreshed by the proxy on every request)

### P0-5: Profile lookup and first-run setup
- Root cause found: every profile lookup used `.single()`, and any failure (missing row OR a network/database error) was treated as "no profile", which re-showed the setup screen to people who already had one
- All lookups now use `.maybeSingle()` through one helper (`src/lib/profile.ts`). Missing row → setup screen. Lookup failed → an error screen with "Try again", never the setup screen
- Setup screen checks for an existing profile on load and skips itself, so it only ever shows once
- After `upsert_user_profile`, the row is re-read and compared with what was entered before moving on. If it didn't save, the user is told
- Home location is now optional at setup (it can be added later from the profile), so a location-search outage can't block account creation
- New `src/lib/errors.ts` turns Supabase/network errors into readable messages

### P0-6: Crew list loading
- Crews load with `members.select('*, groups(*)').eq('user_id', user.id)` through one helper (`src/lib/crews.ts`), used on the server for the first paint and in the browser for refreshes
- Root cause found: a failed crew query was treated as "you have no crews" (errors were never checked), and the list only ever came from the server, so coming back to it could show an old copy
- Added a loading state, the empty state, and an error state with "Try again". If a refresh fails while crews are already showing, a small banner appears instead of wiping the list
- The list refreshes when the screen opens and after creating or joining a crew
- Create/Join now use the latest profile (name and location) even if it was edited moments earlier on the same screen

### P0-8: Error surfacing everywhere
- New shared helper: `useToast()` from `src/components/Toast.tsx` (`toast.error(err, fallback)` and `toast.success(msg)`), mounted once in the root layout. `friendlyError()` in `src/lib/errors.ts` makes messages readable ("Can't reach the server. Check your connection", "You're offline", "You don't have permission")
- Every Supabase call now checks `error` and shows it. Previously silent: RSVP in/out/remove, bail log and bail reversal, availability toggles, favorite add/remove, event cancel, auto-RSVP on event create, sign out, invite-code uniqueness check
- RSVP failures used to be swallowed by an empty `catch` ("silently fail"). They now show a toast and the buttons stay as they were
- Cancel event now confirms a row was actually deleted (a blocked delete returns no error, just zero rows) and relies on the database cascade for RSVPs and bails
- Small behavior change: un-tapping "In" inside the cutoff window now logs a bail, the same as tapping "Out". Before, it was a way to drop out without a bail
- Done out of order (before P0-7) because P0-7's "saved" confirmation uses the toast

### P0-7: Home location saving
- Every location write checks `error` and shows it. Writes also ask the database to return the changed rows, so a blocked update (no error, zero rows) is caught instead of passing silently. That silent case is the likely cause of "home location not saving"
- Saving from the profile updates `user_profiles` (re-read to confirm) and every `members` row for the user, then shows a confirmation with the saved label and how many crews were updated
- New: "Your location in this crew" on the Members tab updates only that one member row and confirms with the saved label
- Fixed: a profile with a location on the equator/prime meridian (lat or lng of 0) was treated as having no location
- Location search box extracted into one shared component (`src/components/LocationInput.tsx`) used by setup, profile, and the crew screen, with "Searching…", "No places found", and "not responding, try again" states. The old code swallowed search errors

### P0-9: Duplicate member guard (was F-10)
- Joining a crew you're already in no longer shows an error. It reuses your existing member row and opens the crew
- If that existing row has no home location but your profile does, the location is copied over
- If two joins race (double tap, two tabs), the new `members (group_id, user_id)` unique constraint blocks the second row and the app recovers by reusing the first
- Join logic moved to one function (`joinCrewByCode` in `src/lib/crews.ts`), shared by the join dialog and invite links

### P1-1: Timezone date bug
- Two real UTC leaks found and fixed:
  1. The event form's earliest-allowed date used `toISOString()` (UTC). After about 7pm Eastern you could not create an event for today
  2. The crew screen was first drawn on the server, which runs in UTC, so "today", upcoming vs past, and greyed-out days could be a day ahead in the evening. The crew screen now draws only in the browser, using the device's own clock
- One shared `toYMD()` helper built from local date parts (`getFullYear`, `getMonth`, `getDate`). The duplicate copies in the availability calendar and heat map now use it
- Verified: 8:30pm in New York and Los Angeles gives today's date (the old way gave tomorrow)

### P1-2: Bail window timezone check
- Confirmed the tee time is read as local time. It is built from number parts (`new Date(y, m, d, h, min)`), not by parsing a `date + 'T' + time` string, so there is no UTC surprise. Pulled into a named `teeOffDate()` helper with the rule written down
- Tested in four time zones: 25h before tee-off = no bail, 24h and 23h and 1 minute before = bail, 1 minute after tee-off = no bail
- Bail logging hardened (shipped with P0-8): the RSVP is saved first, then the bail; a failed bail write is reported; the database allows only one bail per member per event, and the app loads the existing one if it hits that limit
- Note: "local" means the phone or computer of the person tapping. Fine for a crew in one time zone

### P1-3: Nominatim usage rules
- Location search now goes through our own server route (`/api/nominatim`), which sends a proper identifying `User-Agent` and `Referer` on every request. A browser can't set `User-Agent` itself, and the old Vercel rewrite sent no identification
- Max one request per second, enforced in three places: the input waits 600ms after the last keystroke (debounce), the browser spaces searches at least 1.1s apart and drops ones made stale by further typing, and the server route queues requests 1.1s apart
- Results are cached (in the browser for the session, on Vercel's edge for a day), so repeat searches don't hit Nominatim at all
- "Searching…" state, a clear "No places found" message, and a "not responding, try again" message, in the shared location box and in course search
- Course search from your saved home location skips the lookup entirely (coordinates are already known)

### P1-4: Overpass reliability
- Course search now goes through our own server route (`/api/overpass`) instead of a plain rewrite to overpass-api.de
- 12 second timeout per attempt. If a server times out or errors, it retries on a backup: overpass-api.de → overpass.kumi.systems → maps.mail.ru. If all fail, the user sees "Course search is unavailable right now" instead of hanging
- Sends an identifying `User-Agent`, which is the likely fix for the HTTP 406 errors seen in June
- Results cached per rounded lat/lng (2 decimals, about 1 km) and radius: in the browser for the session and on Vercel's edge for a day. Meet in the Middle with two members (both midpoints identical) now makes one request instead of two
- The route builds the query itself from lat/lng/radius, so it can only be used to look up golf courses
- Course search and Meet in the Middle share one fetch-and-parse function (`fetchGolfCourses` in `src/lib/geo.ts`) instead of two copies
- NOT verified against live Overpass: the build sandbox couldn't reach any Overpass server. Verified here: bad input is rejected, and when every server fails the route falls through all three and returns a clean error in about 16s. Test course search on the deployed site

### Database upgraded in place (Nov 17)
- Decision: reuse the existing Supabase project (`fhflxafuvnvafkhwniiz`) instead of creating a new one. It still held real data (7 crews, 10 members, 6 profiles, 8 accounts), so nothing was dropped
- Applied `supabase/migrations/20261117_upgrade_existing_project.sql` through the Supabase connector. It brings the live database in line with `supabase/schema.sql`. Row counts were identical before and after
- What the old database was missing, which explains several "silent" failures: no delete policy on `members`, `bail_log` or `groups` (so bail reversal never actually removed the bail); no update policy on `availability` or `bail_log`; no unique constraint on `members (group_id, user_id)` or `bail_log (event_id, member_id)`; policies were open to signed-out visitors
- Now: 4 explicit policies per table for signed-in users only, both unique constraints, required columns marked required, indexes added, `upsert_user_profile` returns the saved row
- Because the project is reused, the URL and key in Vercel do not change
- Supabase security check afterwards: warnings only. One worth doing by hand: turn on leaked password protection (Authentication settings)

### Test login (dev only)
- New "Test login (dev only)" button on the sign-in page: one tap signs in as the account named in `DEV_LOGIN_EMAIL` / `DEV_LOGIN_PASSWORD` (`src/app/api/dev-login/route.ts`)
- It is a shortcut for typing that account's email and password, not a bypass: the account has normal permissions
- Always off on the live site (Vercel production), even if the variables are set there. Off unless both variables are set. The password stays on the server and is never sent to the browser
- Verified the switch: on with variables set, 404 in production, 404 with variables unset, and a wrong password shows an error on the sign-in page. The successful sign-in itself was not tested (no real credentials available here)

### P1-4 follow-up: course search failed on the real deployment
- Found in Justin's preview testing: course search showed "Course search is unavailable right now". Every Overpass server refused or timed out when asked from Vercel. The most likely reason is that the public Overpass servers turn away requests from cloud hosts; this is an inference, the exact responses weren't visible
- Fix: the browser now asks Overpass directly first (main server, then a mirror, 10s timeout each), the same way the original single-page app did. Our own `/api/overpass` route is now the backup, tried third
- The route's error now includes what each server answered (`detail`), so the next failure can be diagnosed from the browser console
- Shared query/parse code moved to `src/lib/overpass.ts`
- Tested with simulated servers: main works; main down then mirror; both down then our server; everything down gives the readable error; a hung server is abandoned after 10s; failures aren't cached. NOT tested against the real Overpass servers (unreachable from the build sandbox), so this needs one more course search on the preview

### P1-4 follow-up 2: the real cause, from Justin's browser console
- Console output showed `overpass-api.de` answering **406** both in the browser and from Vercel, the old mirror `overpass.kumi.systems` timing out, and `maps.mail.ru` answering 504
- 406 is overpass-api.de's deliberate "you are blocked" answer. Since April 2026 it turns away cloud hosts and hosted-app domains (see Overpass-API issue #791 and the OSM wiki usage policy). `overpass.kumi.systems` has been renamed `overpass.private.coffee`. So the earlier guess ("missing User-Agent") was wrong: a good User-Agent does not get a Vercel-hosted app unblocked
- Fix: stopped using overpass-api.de entirely. Server order for North America is now `ovp.dresel.systems/api-na` (free, no key, allows browser requests, asks only for an identifying User-Agent/Referer), then `overpass.private.coffee`. Elsewhere: private.coffee, then the Dresel Europe server
- New last resort: if every Overpass server fails, courses come from Nominatim instead (`/api/nominatim?golf=1`). It returns at most 40 courses, so it is a safety net, not the main path
- Full order: two Overpass servers from the browser → `/api/overpass` from Vercel → Nominatim. One at a time, never in parallel
- Verified against the live services this time: `/api/overpass` returned 197 courses for a 30-mile Chicago search in 4.6s; a real browser page fetched the Dresel server cross-origin successfully; the Nominatim fallback returned 32 courses; ordinary location search still works. Not yet confirmed from the Vercel preview itself

### Not verified end to end
- No Supabase project was available during this work (the new one isn't set up yet), so sign-in, profile, crew, RSVP and location flows were checked by type-check, lint, production build and reading the code, not by clicking through. Run the checklist in `files/TODO.md` after the Supabase setup
- P1-5 (invite link) not started; notes are in `files/TODO.md`

---

## Fri Jun 12, 2026 — E-06 + AV-03

### E-06: Book from course cards
- "Book This" wired on all three course card types: Meet in the Middle results, nearby search results, and crew favorites
- Clicking it opens CreateEventModal with the course name pre-filled (new `initialCourseName` prop); date, time, spots, fee, notes behave as before
- Admin-only: Book This is hidden entirely for non-admin members on every card type
- After creating an event (from any entry point), the UI switches to the Events tab so the new event is immediately visible
- Prefill is cleared when the modal closes — the generic "+ Create Event" button still opens a blank form

### AV-03: See other members' availability
- "Your Availability" calendar days now show a "+N" badge when N other members have marked availability that day (own availability excluded from the count)
- Clicking the badge expands a read-only detail panel below the calendar listing each available member with their Morning/Afternoon/Twilight slots; clicking again collapses it
- Built entirely from the `allAvailability` state already lifted into CrewDetail — no new client-side queries (avoids the RLS empty-result trap from the member cards bail count bug)
- Own availability toggles unchanged; legend gained a "+n Crew free" entry

### Verified
- End-to-end via Playwright against local dev server with two accounts (admin + non-admin member): badge counts, slot detail, admin gating, prefill from all three card types, tab switch after create, auto-RSVP still firing
- Note: overpass-api.de was returning 406 during testing; verification rerouted /api/overpass to the maps.mail.ru mirror at the network layer (no app code change). Worth watching in production.
- Note: anonymous (guest) sign-in is currently disabled in the Supabase project settings — the "Continue as guest" button on /login fails with "Anonymous sign-ins are disabled" (pre-existing, unrelated to these features)

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
