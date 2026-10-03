# PowerBuild deployment and testing

PowerBuild currently uses Supabase Free, Vercel Hobby, and Ollama on the owner's Mac. The stable testing URL is https://personal-workout-tracker-chi.vercel.app. No paid AI API, billing integration, or plan upgrade is required for this setup.

Vercel Hobby allows personal, non-commercial use. Choose hosting that permits commercial use before charging coaches. Free services have usage and availability limits; a Mac and a temporary tunnel cannot provide guaranteed 24/7 service. Check the current [Vercel Hobby terms](https://vercel.com/docs/plans/hobby) and [Supabase plan limits](https://supabase.com/pricing).

## Backend and account setup

For a fresh database, run the numbered files under `supabase/migrations/` in order, from 001 through 012. For an existing database, apply only missing migrations after reviewing its migration history and backup. Never rerun a migration merely because its filename appears in this guide.

Migration 011 separates the platform operator from coach businesses and replaces global administrator permissions. An unambiguous existing single administrator is bootstrapped as the initial operator; multiple existing administrators require an explicit database-owner grant. A browser role field or signup metadata cannot grant platform access. Migration 012 adds atomic workout start/finish and immutable recorded prescriptions.

Keep **Authentication → Sign In / Providers → Allow new users to sign up** disabled during invite-only testing. The app's `/signup` route redirects to login, but that alone does not disable Supabase public signup.

1. The PowerBuild owner invites a coach through Supabase **Authentication → Users**. After the account is confirmed, the owner adds the verified email and business from `/platform`.
2. The owner invites a client through Supabase Auth. After confirmation, the coach adds that existing account from `/admin/business`.
3. Coaches manage their own clients, exercise library, drafts and assignments. The owner's business dashboard shows aggregate operational information; other businesses' client conversations and health records are excluded.

An account currently belongs to one business. The app does not yet send invitation emails itself or move an account between businesses. Supabase invitation delivery must be tested for the intended recipient; do not assume its default email service supports a production SaaS.

## Environment variables

Configure values through Supabase/Vercel's normal dashboard or CLI sign-in flow. Keep local values in the ignored `.env.local`, readable only by its owner. Never paste private values into chat, Git, screenshots, command arguments, or a public URL.

| Name | Where it is used |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Public browser/backend configuration |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anonymous key; database RLS enforces access |
| `NEXT_PUBLIC_APP_URL` | Exact HTTPS app origin |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only, for verified chat persistence and QR login |
| `COACH_GATEWAY_URL` | Server only, temporary HTTPS connector address |
| `COACH_GATEWAY_TOKEN` | Server only, authenticated Mac connector access |

A Supabase anonymous/publishable key is intentionally public. A service-role/secret key bypasses RLS and must never use the `NEXT_PUBLIC_` prefix. Backend credential helpers import `server-only` so accidental browser imports fail the build. QR security calculations take an explicit environment from the server route.

In Supabase **Authentication → URL Configuration**, set the production Site URL and allow the exact app origin's auth callback/reset routes. Local development callback URLs should be separate from production links.

## Local app and Mac AI

```bash
npm ci
npm run dev
```

Ollama listens on `127.0.0.1:11434`. The private gateway listens on `127.0.0.1:11435`; the phone talks to authenticated app routes over HTTPS. Do not expose Ollama directly or put the connector token in browser code.

After initial protected configuration described in `connector/README.md`:

```bash
npm run coach:connect -- --background
node connector/run.mjs --status
node connector/run.mjs --stop
```

Configuration and logs live under `$HOME/workout-ai/powerbuild-connector`, outside Git, with private permissions. Starting the connector creates a new temporary tunnel, updates only the existing Vercel project's server-side connection URL, and rebuilds its previously hosted source. It does not deploy uncommitted local app changes. Keep the Mac awake and online with its lid open when clients need Tommy.

Generated programs are proposals. The coach reviews and approves an assignment before a client sees it. Structural validation cannot establish that every model suggestion is sound; a rejected model candidate must not replace the working model solely because its training loss improved.

## Security checks before publishing

```bash
npm run security:install-hooks
npm run security:secrets
npm run security:staged
npm run security:history
npm run build
npm run test:security
npm run security:deployment
```

The commit hook scans the complete staged index, including a secret that was edited away without being re-staged. Findings show only category, file and line; matched values and Git error buffers are suppressed. Private vault notes, client/training corpora, runtime config and model weights are blocked separately from credential detection.

The push hook scans commits reachable from local Git refs, including historical blobs removed from the current tree. This does not inspect unreachable or reflog-only objects. A detected historical credential must be revoked; removing its current file does not remove it from history.

The deployment check uses the actual locally cached Vercel CLI 62 file collector without deploying or downloading anything. Cache that pinned CLI through its normal installation flow if needed. It verifies uploaded files, symlink destinations, server-only boundaries, and a fresh production browser build including source maps/public assets. Empty excluded directory placeholders are not uploaded private files.

The GitHub Security guards workflow uses public build placeholders, read-only repository permissions, a pinned checkout action and no production credentials. It builds the app and runs the negative security tests. Standard GitHub-hosted runners for this public repository are [free](https://docs.github.com/en/actions/concepts/billing-and-usage). The hook is local and must be installed in each checkout; neither scanner can guarantee detection of every possible secret format.

Keep `.vercelignore`: local AI work, vault notes, migrations, connector files, scripts, environment files and generated local builds are excluded from CLI deployment. Never upload a local prebuilt bundle containing private data.

## Publishing app source

Use explicit file staging after reviewing the diff. Avoid `git add .` in a workspace containing local training material. Run the security checks, commit, and publish through the project's normal Git/CLI workflow. Deploy fresh app source so Vercel builds with its existing server-side environment. Never copy production credentials between machines.

After release, verify anonymous requests cannot access coach/owner APIs, authenticated tenant isolation still holds, production preview routes are unavailable, and the authenticated Mac connector reports ready without returning its token. An owner-menu visibility check is useful, but authorization must also be enforced in the server and database.

## iPhone and workout verification

Open the stable HTTPS app in Safari, then use **Share → Add to Home Screen**. Leave **Open as Web App** enabled if Safari offers it. Launch from the new icon and sign in there if needed. The service worker caches public assets and a reconnect page; authenticated workouts/API responses are not cached for offline logging.

For workout tests, verify Start stores a planned snapshot and blank actual results, Finish saves typed values even without individual set checkmarks, and a repeated Finish cannot overwrite completed results or advance progress twice. Quick **Mark Done** records completion plus the planned outline, without inventing weights/reps/RPE. Older unrecorded measurements cannot be reconstructed.

Member detail displays five recent workouts with a full-history link. Search, date/status filters and 20-item pages bound the history view. Back navigation keeps internal filters/member context; foreign or external return destinations are rejected.
