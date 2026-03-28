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
# Copy env file
cp .env.local.example .env.local

# Fill in your Supabase URL and anon key
# (Supabase → Settings → API)

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
   NEXT_PUBLIC_APP_URL           = https://your-app.vercel.app
   ```
4. Click **Deploy**

---

## Step 6 — Set production URL in Supabase

1. Supabase → Authentication → URL Configuration
2. Set **Site URL** to `https://your-app.vercel.app`
3. Add to **Redirect URLs**: `https://your-app.vercel.app/**`

---

## Step 7 — Post-deploy checklist

- [ ] Can sign in with admin account
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

1. Tell them to sign up at `https://your-app.vercel.app/signup`
2. Go to `/admin/members` → click their name
3. Assign a program

Or create them in Supabase Auth yourself and send them the link.

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
