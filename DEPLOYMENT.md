# PowerBuild Tracker — Deployment Guide

## Prerequisites
- Node.js 20+
- A free [Supabase](https://supabase.com) account
- A free [Vercel](https://vercel.com) account

---

## Step 1 — Create Supabase project

1. Go to [supabase.com](https://supabase.com) → New project
2. Choose a region close to you
3. Set a strong database password (save it)
4. Wait for the project to spin up (~1 min)

---

## Step 2 — Run the database migrations

In Supabase → **SQL Editor**, run these files **in order**:

```
supabase/migrations/001_schema.sql    ← tables + triggers
supabase/migrations/002_rls.sql       ← row level security policies
supabase/migrations/003_energy_rating.sql ← optional workout energy rating
supabase/migrations/004_qr_login.sql  ← server-only phone-to-desktop QR login requests
```

Paste each file's contents and click **Run**.

---

## Step 3 — Seed data (optional but recommended)

1. Go to Supabase → **Authentication** → **Users**
2. Create 3 users manually:
   - `admin@powerbuild.app` (you)
   - `alex@powerbuild.app`
   - `jordan@powerbuild.app`
3. Copy each user's UUID from the Users table
4. Open `supabase/seed.sql` and **replace the placeholder UUIDs**:
   - `00000000-0000-0000-0000-000000000001` → your admin UUID
   - `00000000-0000-0000-0000-000000000002` → alex's UUID
   - `00000000-0000-0000-0000-000000000003` → jordan's UUID
5. Run the updated `seed.sql` in the SQL Editor
6. Back in Authentication → Users, set your user's role:
   ```sql
   UPDATE profiles SET role = 'admin' WHERE email = 'admin@powerbuild.app';
   ```

---

## Step 4 — Local development

```bash
# Create .env.local and fill in your Supabase URL and anon key
# (Supabase → Settings → API)
# For phone-to-desktop QR sign-in, also set SUPABASE_SERVICE_ROLE_KEY
# in .env.local. It is server-only: never prefix it with NEXT_PUBLIC.

# Install dependencies
npm install

# Run dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Step 5 — Deploy to Vercel (free)

### Option A — CLI
```bash
npm i -g vercel
vercel login
vercel --prod
```

### Option B — GitHub
1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) → New Project → Import from GitHub
3. In **Environment Variables**, add:
   ```
   NEXT_PUBLIC_SUPABASE_URL     = https://your-ref.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY = your-anon-key
   NEXT_PUBLIC_APP_URL           = https://personal-workout-tracker-chi.vercel.app
   SUPABASE_SERVICE_ROLE_KEY     = your-server-only-service-role-key
   ```
4. Click **Deploy**

---

## Step 6 — Set production URL in Supabase

For this Vercel project, use `https://personal-workout-tracker-chi.vercel.app`
as the production origin. Deployment-specific URLs can require Vercel login even
when the production project domain is public.

1. Supabase → Authentication → URL Configuration
2. Set **Site URL** to `https://personal-workout-tracker-chi.vercel.app`
3. Add to **Redirect URLs**: `https://personal-workout-tracker-chi.vercel.app/**`

---

## Step 7 — Post-deploy checklist

- [ ] Production URL reaches the tracker (not Vercel Authentication). If Vercel Deployment Protection is enabled, decide whether to grant access or change its production setting in Vercel; the tracker itself already requires sign-in.
- [ ] The Supabase project URL resolves and the project is active
- [ ] Supabase Auth → URL Configuration contains the exact production origin and callback URL
- [ ] Can sign in with admin account
- [ ] Can request and resend a sign-in link, confirmation email (for unconfirmed users), and reset link
- [ ] Phone already signed in can scan a desktop QR, confirm the matching code, and approve desktop sign-in
- [ ] Dashboard shows next session card
- [ ] Can tap "Start Workout" and log sets
- [ ] Marking a set complete saves correctly
- [ ] Finishing a workout advances session index
- [ ] Analytics page loads charts
- [ ] Admin can see all members at `/admin`
- [ ] PWA install prompt appears on mobile (Chrome/Safari)
- [ ] App icon appears on home screen after install

---

## Free tier limits (Supabase free)

| Resource      | Free limit    | Expected usage (6 users) |
|---------------|---------------|--------------------------|
| DB storage    | 500 MB        | < 10 MB                  |
| Auth users    | 50k MAU       | 6 users                  |
| API requests  | 500k/month    | < 50k/month              |
| Edge Functions| 500k invocations | Not used (server actions) |

You will never hit free limits with a private 5–6 user group.

---

## Adding a new member

Public signup is disabled. Create or invite the user in Supabase Auth, then go to
`/admin/members` to assign a program. They can sign in by password or email link
after their account is confirmed.

## Phone-to-desktop QR sign-in

This is **not** a QR code that merely opens the login page. The phone must already
be signed in to the same tracker origin. The user compares the six-digit code
on both screens and explicitly approves the desktop session on the phone.

Setup:

1. Run `supabase/migrations/004_qr_login.sql` in the **same active Supabase project**
   used by the deployed app.
2. Add `SUPABASE_SERVICE_ROLE_KEY` to Vercel Production environment variables and
   `.env.local` for local testing. Get it from the project's API settings. Do not
   put it in client code, Git, or a `NEXT_PUBLIC_` variable. Redeploy after setting it.
3. Open the production `/login` page on a signed-out desktop; choose **Sign in with
   phone QR**. On an already signed-in phone, scan the code, check that the codes
   match, and tap **Approve desktop sign-in**. The desktop should enter the app.

Each QR request expires after five minutes and can be consumed once. The QR URL
contains only an approval secret; the desktop's polling secret is separate. Old
expired rows can be removed periodically with
`DELETE FROM qr_login_requests WHERE expires_at < NOW() - INTERVAL '1 day';`.

---

## Updating the app

```bash
git add .
git commit -m "your changes"
git push  # Vercel auto-deploys on push to main
```

---

## Moving to Cloudflare Pages (if needed)

1. The app is standard Next.js with no Vercel-specific features
2. Run: `npm run build` — confirm it builds cleanly
3. Follow Cloudflare Pages → Next.js deployment guide
4. Keep the same env vars
