# Setting up a fresh Supabase project for GreenTime

Follow these in order. About 10 minutes.

> **Status (Nov 17, 2026):** the existing project `fhflxafuvnvafkhwniiz` was kept and upgraded in place with `supabase/migrations/20261117_upgrade_existing_project.sql`. Steps 1 and 2 below are therefore already done (the URL and key did not change). Steps 3 to 5 still need doing by hand in the Supabase dashboard. Steps 1 and 2 only apply if a brand-new project is ever created.

## 1. Build the database (P0-2)

1. Open your new project at supabase.com.
2. Left sidebar: **SQL Editor** → **New query**.
3. Open `supabase/schema.sql` from this repo, copy the whole file, paste it in.
4. Click **Run**. You should see "Success. No rows returned".
5. Left sidebar: **Table Editor**. You should see 9 tables, each showing RLS as enabled:
   `groups`, `members`, `availability`, `events`, `rsvps`, `bail_log`, `user_profiles`, `suggestions`, `suggestion_upvotes`.

Running the file a second time is safe.

## 2. Copy the new URL and key (P0-3)

1. In Supabase: **Project Settings** → **Data API**. Copy the **Project URL** (looks like `https://abcdefgh.supabase.co`).
2. **Project Settings** → **API Keys**. Copy the **publishable** key (starts with `sb_publishable_`). The older **anon** key on the legacy tab also works. Never use the secret / service_role key.

### On your computer

In the project folder, create a file named exactly `.env.local` (note the leading dot) with:

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR-KEY
```

Restart `npm run dev` after changing it.

### On Vercel

1. Vercel → your GreenTime project → **Settings** → **Environment Variables**.
2. Edit (or add) `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` with the new values. Tick **Production** and **Preview** for both.
3. **Deployments** tab → the latest deployment → **⋯** → **Redeploy**. The new values only apply after a redeploy.

## 3. Tell Supabase where the app lives (P0-3)

Supabase: **Authentication** → **URL Configuration**.

- **Site URL:** `https://greentime-app.vercel.app`
- **Redirect URLs** (add both):
  - `https://greentime-app.vercel.app/**`
  - `http://localhost:3000/**`

If these are missing, magic links send people to the wrong place or fail.

## 4. Sign-in settings

Supabase: **Authentication** → **Sign In / Providers**.

- **Email** → turn **Confirm email** OFF while testing. When it is on, new accounts must click an email link before they can sign in (the app handles this, but see the email limit below).
- **Anonymous sign-ins** → turn ON if you want the "Continue as guest" button to work.

**Email limit on new projects:** Supabase's built-in email sender only delivers to email addresses that are members of your Supabase organization, and only a few per hour. Magic links to friends will not arrive until you connect your own sender (Authentication → Emails → SMTP Settings; Resend has a free tier). Password sign-in works without it when Confirm email is off.

## 5. Optional: magic links that work on any device

By default a magic link only works in the same browser that requested it (ask on laptop, open on phone = fails). To fix that, go to **Authentication** → **Emails** → **Magic Link** and change the link in the template to:

```
{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email
```

Do the same in the **Confirm signup** template. The app already supports both link styles.

For password reset emails (**Reset Password** template), the any-device version is:

```
{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password
```

## 6. Optional: one-tap test login

Skips typing your email and password while testing. Never active on the live site.

1. Make sure your account has a password (My Crews → your initial, top right → "Set a password").
2. On your computer, add to `.env.local`:
   ```
   DEV_LOGIN_EMAIL=you@example.com
   DEV_LOGIN_PASSWORD=your-password
   ```
3. For Vercel previews: Settings → Environment Variables → add both, and tick **Preview** only (not Production). Redeploy the preview.
4. The sign-in page now shows a dashed "Test login (dev only)" button.

To turn it off, delete the two variables.

## 7. Check it worked

Run the testing checklist at the bottom of `files/TODO.md`.
