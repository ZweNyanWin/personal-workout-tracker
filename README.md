# PowerBuild

A coach-first fitness platform that turns written training programs into editable client workouts, with a locally hosted AI assistant called **Tommy**.

Built from a personal interest in strength training into a multi-tenant coaching product: coaches manage clients, review AI drafts, assign programs and track completed sessions. Clients can ask about their training through the web app.

[Case study](docs/portfolio/powerbuild.md) · [Training guide](ai/training/PUBLIC_GUIDE.md) · [Experiment summary](ai/reports/round9-public-summary.json) · [Portfolio website prompt](docs/portfolio/website-prompt.md)

## Product workflows

| Workflow | Implementation |
| --- | --- |
| Coach programming | Paste a written block, format week/day/exercise groups, edit, review, then assign |
| Training fidelity | Preserve sets, reps, effort, loads, units, rest and variants; separate top sets and backdowns |
| Client tracking | Record completed work separately from planned targets; searchable, bounded history |
| AI assistance | Authorized server relay to Mac Ollama with client context and approved exercise choices |
| Coach businesses | Tenant-scoped access and an operator portal for business activity |
| Mobile use | Installable web app with a standalone manifest and private-data caching boundaries |

## Architecture

The Next.js app runs on Vercel. Supabase provides authentication, PostgreSQL and tenant access controls. Server routes authorize requests before dispatching work to an authenticated HTTPS gateway. The gateway and Ollama listen on Mac loopback interfaces; browser code never receives the gateway credential.

Written prescriptions use deterministic parsing and validation before asking a language model to fill omissions. Drafts require coach review. The experimental bridge uses a temporary tunnel and depends on the Mac remaining awake and connected; this is not an always-on inference service.

Stack: **Next.js, React, TypeScript, Tailwind CSS, Supabase/PostgreSQL, Zod, Ollama, Python, MLX/MLX-LM**.

## AI engineering and actual fine-tuning

Tommy combines model inference, supplied context, source parsing and application-level guards. An Ollama `Modelfile` configures inference; it does not train weights.

Separate **QLoRA experiments did train adapter weights** on an existing Qwen foundation. The latest documented run completed 480 updates using 228 training records, including 100 newly authored synthetic nutrition/powerlifting examples, with separate validation and evaluation splits.

The candidate was **not promoted**: a 100-case developer-reviewed comparison scored the baseline 45/100 and candidate 44/100, with 13 critical flags each. Foundation, template and quantization differences prevent interpreting this as an isolated measurement of fine-tuning. The original experimental `workout-coach` configuration remained selected at the last verified release. These are research results, not clinically validated advice.

Selected public training helpers and a small fictional demo generator are included. Private programs, client records, raw experiment outputs and weights are excluded. The public demo is not the dataset used for the reported experiment.

## Recorded verification

October 16, 2026 production retest, on the then-deployed version:

- A fictional 38,057-character input produced 12 weeks, 48 sessions and 192 groups; the completed save was observed at 15.88 seconds.
- Rendered checks preserved 180 explicit loads and all 192 doses, effort targets, rests and source cues. Twelve unspecified loads remained unknown.
- The field accepted 64,000 characters; a 64,001-character paste was rejected while preserving the previous text.
- Conversation reload passed. Chat completion was observed between 22 and 68 seconds in one test, not a latency guarantee.
- The release had 328 automated cases: 327 passed and one optional QR database test was skipped. Code, deployment and private-artifact scans passed within their documented scope.

These dated results do not establish current uptime, universal model accuracy or suitability for every client. See the [case study](docs/portfolio/powerbuild.md) for tradeoffs and evidence limits.

## Development

Use Node.js 24 and the repository lockfile:

```sh
npm ci
npm run dev
```

Configure a separate development Supabase project through an ignored `.env.local` using `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `NEXT_PUBLIC_APP_URL`. Review the ordered files in `supabase/migrations/` for schema setup; avoid seeds for a clean schema. Public signup is closed in the testing workflow: authenticated use requires an invited account and appropriate tenant membership. Server integrations need additional private setup.

The connector has a separate [setup and lifecycle guide](connector/README.md). Training is optional; see the [public training guide](ai/training/PUBLIC_GUIDE.md) for its prerequisites.

## Verification commands

```sh
npm run build
node --experimental-strip-types --test scripts/*.test.mjs connector/*.test.mjs
npm run security:check
npm run security:history
python3 -m unittest discover -s ai/training -p 'test_public_demo.py'
```

Build before the deployment audit: it checks actual browser artifacts and the upload manifest. The optional live QR database test requires isolated setup.

## Repository boundaries

Only reviewed source and sanitized documentation belong in Git. Weights, real coaching records, uploaded documents, local runtime configuration, credentials and private vault notes remain local. AI tools and portfolio documentation are excluded from the application deployment bundle. This source release does not distribute model weights or the private experiment dataset.
