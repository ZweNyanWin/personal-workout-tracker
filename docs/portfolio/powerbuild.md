# PowerBuild

PowerBuild is a fitness coaching platform prototype I've been building and testing on my Mac.

I started it out of my interest in strength training. I wanted a way to take a written training block, turn it into workouts someone can follow, and keep track of what they actually completed. The project grew to include coach and client accounts, program assignments and a local AI assistant called Tommy.

## What I built

A coach can paste a program, review the draft, edit it and assign it to a client. Clients can log their sessions and ask questions about their training. The coach makes the final call on the program.

I built the app with Next.js, React, TypeScript and Tailwind CSS. Supabase handles sign-in and the PostgreSQL database. Each coaching business has its own workspace, with access checks around its clients and programs. An owner portal gives an overview of business activity, and I also added an installable web interface.

Tommy uses Ollama running on that Mac. The app's server checks access before sending requests through an authenticated gateway. The browser never receives the gateway credential or a direct connection to local inference.

## Keeping the program intact

A large part of the work went into preserving the details of a pasted program: sets, reps, loads, units, rest, paused reps, timed holds, and separate top sets and backdowns.

When those details are already written down, I use parsing and arithmetic to carry them into the draft. The model fills specific gaps where needed, and the whole block is checked before the coach reviews it. Unclear instructions can still need clarification.

Planned workouts and completed logs are stored separately. A prescribed weight should never show up as something a client has already lifted.

## The training experiment

I also tried QLoRA fine-tuning on an existing Qwen model. On my Apple M1 Pro with 16 GB of unified memory, the recorded run completed 480 updates using 228 training records. These included 100 new synthetic examples covering nutrition and powerlifting. I kept separate sets of 32 records for validation and 32 for loss testing.

All six saved checkpoints were checked against the full validation set. Checkpoint 480 was selected before the behavioral review. I then compared the candidate with the baseline on 100 separate cases. The review covered all 200 outputs, including attempted repairs.

| Measure | Baseline | Candidate v9 |
| --- | ---: | ---: |
| Passed strict semantic review | 45 / 100 | 44 / 100 |
| Nutrition passes | 27 / 50 | 27 / 50 |
| Powerlifting passes | 18 / 50 | 17 / 50 |
| Critical flags | 13 | 13 |

The candidate improved on six cases but regressed on seven. I kept the original configuration because the candidate failed the acceptance checks. Its lower validation loss hadn't translated into better answers in this comparison.

These results were recorded on October 13, 2026. The cases were written and reviewed by developers, without independent expert validation. The foundation, template and quantization also differed between the two configurations, which limits what the scores say about the adapter alone. Later changes to the app's safeguards are separate from this experiment.

My personal plans helped shape the requirements and private context. They and real client records were excluded from the shared training weights. The training examples were authored separately using coaching requirements and reviewed public references.

## What I tested

In a signed-in test on October 16, 2026, I imported a fictional, fully written program containing 38,057 characters. The import produced 12 weeks, 48 sessions and 192 groups, and I could see the completed save at 15.88 seconds. Checks covered the displayed loads, quantities, units, rest and source details. The program and conversation survived a reload, and the 64,000-character input-limit checks passed.

That timing covers formatting a supplied program. An earlier run that had to propose missing weeks took roughly 18 to 19 minutes. In one short chat test, completion was observed between 22 and 68 seconds. The Mac and its network connection make a noticeable difference to the experience.

For that release, 327 automated cases passed and one optional QR database case was skipped. The source and deployment checks also passed, including checks for accidentally bundled private files.

## Where it stands

PowerBuild is still a prototype, with testing so far on my Mac. The AI connection uses a temporary tunnel and depends on the Mac staying awake and connected. Authenticated app access requires an invitation. Broader device testing and more reliable inference hosting would be needed before offering it as a public service.

The repository includes selected training and evaluation tools. The private dataset, checkpoints, raw reviews and some experiment helpers are excluded, so the published code alone cannot reproduce the historical run. The fictional demo data checks the data format; the published regression cases aren't a new, unseen benchmark.

## A few places to look in the code

- [Program generation](../../connector/program-generation.mjs), [compact prescriptions](../../connector/compact-prescription.mjs) and [written prescriptions](../../connector/written-prescription.mjs) handle imported training blocks.
- [Database migrations](../../supabase/migrations/) and [database tests](../../supabase/tests/) cover tenant access and the coaching workflow.
- [Coach server routes](../../app/api/coach/), [coach logic](../../lib/coach/) and the [local gateway](../../connector/gateway.mjs) connect the app to inference.
- [Training](../../ai/training/train_local.py), [candidate import](../../ai/training/import_candidate.py) and [GGUF export](../../ai/training/export_gguf.py) cover the public training tools.
- The [evaluation runner](../../ai/run-evals.mjs) and [round 9 results](../../ai/reports/round9-public-summary.json) show how the experiments were checked.
- [Secret checks](../../scripts/secret-guard.mjs) and [deployment checks](../../scripts/check-deployment-privacy.mjs) help keep private files out of the repository and app bundle.
