# PowerBuild — fitness coaching and applied AI

## Problem

Re-entering weeks of prescriptions, assigning blocks, collecting completed sets and answering repeated questions consumes coaching time. PowerBuild brings those tasks into one workflow while keeping a coach responsible for the final prescription.

The project grew from the developer's fitness interests and coaching requirements. Personal plans informed product requirements and private context; they were excluded from shared training weights. Domain examples were separately authored using coaching requirements and reviewed public references.

## Engineering contributions

- A Next.js/TypeScript application for program editing, assignment, workout logging and mobile use.
- Tenant-scoped coach businesses, client access checks and an owner portal for business-level monitoring.
- An authenticated server gateway to Mac-hosted Ollama, keeping credentials and local inference endpoints out of browser code.
- Source-preserving imports for compact multiweek programs: top sets/backdowns, mixed units, paused repetitions, timed holds and explicit rest.
- Deterministic parsing/arithmetic and complete-block validation around model output. Missing targets are proposals; completed logs are evidence and planned targets are not achievements.
- Local QLoRA training, checkpoint validation, separate candidate exports and comparative behavioral evaluation, including rejection of candidates that failed acceptance criteria.

## Design decision: formatting before generation

A complete written program is a formatting problem before it is a generation problem. Regenerating every prescribed value with a small model increases latency and opportunities to alter the source. PowerBuild retains known fields locally and uses bounded omission patches where model output is necessary. Ambiguous prose can still need clarification.

The workflow is: coach brief → authorized context and exercise catalog → parsing and bounded generation → complete-block validation → editable draft → coach review and assignment. Clients' performed work is stored separately from the approved plan.

## Actual local fine-tuning

The base was an existing Qwen model, not a foundation model trained from scratch. On an Apple M1 Pro with 16 GB unified memory, the latest documented run completed 480 QLoRA updates over 228 training records. One hundred new synthetic cases covered nutrition and powerlifting. Separate 32-record validation and 32-record loss-test splits were preserved. All six saved checkpoints were evaluated on the complete validation split; checkpoint 480 was selected before behavioral review.

A separately authored 100-case behavioral screen compared the baseline and candidate. Developers reviewed all 200 outputs, including attempted repairs.

| Measure | Baseline | Candidate v9 |
| --- | ---: | ---: |
| Strict semantic passes | 45 / 100 | 44 / 100 |
| Nutrition passes | 27 / 50 | 27 / 50 |
| Powerlifting passes | 18 / 50 | 17 / 50 |
| Critical flags | 13 | 13 |

There were six paired gains and seven regressions. The candidate failed the gate and was not promoted. Lower validation loss was not treated as coaching accuracy. Foundation, template and quantization differences limit causal conclusions about the adapter alone. Developer-authored/reviewed cases are not independent expert validation or population accuracy measurements.

The engineering result is an experiment and rejection workflow with preserved evidence, rather than an unsupported claim of a better model. Later application safeguards were improved separately; the frozen scores are not scores for those later serving changes.

## Performance and verification

On October 16, 2026, a signed-in production test imported a fictional 38,057-character complete program into 12 weeks, 48 sessions and 192 groups. The completed save was observed at 15.88 seconds. Rendered checks covered explicit loads, quantities, units, source cues and rest. Save/reload, conversation persistence and a 64,000-character field boundary also passed.

This measures one complete-source import, not writing a new twelve-week plan. An earlier partial-source run proposing missing weeks took roughly 18–19 minutes. A short production chat reply completed after 22 seconds and by 68 seconds. Mac inference and temporary network connections remain practical limits.

The release recorded 327 passing automated cases and one optional skipped QR database case. Deployment source and private-artifact checks passed. These are scoped, dated checks, not security certification or an uptime promise.

## Public evidence map

| Topic | Inspect |
| --- | --- |
| Tenant/access controls | `supabase/migrations/`, `supabase/tests/` |
| Source-preserving generation | `connector/program-generation.mjs`, `connector/compact-prescription.mjs`, `connector/written-prescription.mjs` |
| Schema/request boundaries | `lib/coach/`, `app/api/coach/` |
| Gateway lifecycle | `connector/run.mjs`, `connector/gateway.mjs` |
| Training and separate exports | `ai/training/train_local.py`, `ai/training/import_candidate.py`, `ai/training/export_gguf.py` |
| Evaluation entry point | `ai/run-evals.mjs`, `ai/evals/` |
| Historical aggregate results | [Round 9 summary](../../ai/reports/round9-public-summary.json) |
| Privacy guards | `scripts/secret-guard.mjs`, `scripts/check-deployment-privacy.mjs` |

Selected tools are published, not every private orchestration helper or the full experiment environment. Data, checkpoints and raw reviews remain private, so the historical run cannot be reproduced from this repository alone. Public regression cases and demo data must not be presented as a new unseen acceptance set.

## Portfolio wording

> Built PowerBuild, a multi-tenant coaching platform with locally hosted AI. Developed source-preserving workout imports, tenant access controls, and a QLoRA training and evaluation workflow using curated fitness-domain examples. Compared trained candidates against a baseline and retained the baseline when the acceptance gate failed.

Use synthetic UI screenshots or a separately authorized demonstration account in a public portfolio. Real client identities, health details, personal programs and uploaded documents are not showcase assets. The private app may require an invitation and its AI depends on the Mac; the portfolio should remain useful without logging into it.
