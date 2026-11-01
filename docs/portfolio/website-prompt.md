# Prompt for another machine

Clone this public repository normally on the other machine. No credentials, vault, browser session, environment files or model checkpoints need to be copied. Paste the prompt below into the coding assistant in your portfolio website repository.

```text
Build a polished, responsive project page for PowerBuild and a matching project card on my portfolio homepage. Inspect the existing portfolio instructions, stack and style before editing.

Source: https://github.com/ZweNyanWin/personal-workout-tracker
Read the latest README.md, docs/portfolio/powerbuild.md, ai/training/PUBLIC_GUIDE.md and ai/reports/round9-public-summary.json. Inspect relevant code to substantiate claims. If access fails, tell me instead of inventing results. Do not modify PowerBuild or connect to its private services.

Frame the project as full-stack engineering plus applied AI/ML experimentation, grounded in my fitness interests and coaching requirements. Cover the problem, coach/client workflow, architecture, implementation, verification, experiments, tradeoffs and future work. Distinguish my work from the pre-existing Qwen foundation.

Factual limits:
- Actual local QLoRA fine-tuning completed 480 updates; it was not foundation-model pretraining.
- The experiment used 228 training records, including 100 new synthetic nutrition/powerlifting examples, plus separate 32-record validation and 32-record loss-test splits.
- The 100-case developer-reviewed comparison scored baseline 45/100 versus candidate 44/100, with 13 critical flags each. The candidate was rejected; the original experimental configuration remained selected at the last verified release. Never claim improved accuracy, clinical approval or zero errors.
- One October 16, 2026 production test saved 38,057 input characters as 12 weeks / 48 sessions / 192 groups; completion was observed at 15.88 seconds. This formatted supplied content, not a new generated twelve-week plan. Chat and missing-week generation take longer. Date and qualify all metrics.
- The release recorded 327 passing automated cases and one optional skipped QR database test. This is not security certification or current uptime.
- Personal plans informed requirements/private context; real client records and personal plans were excluded from shared training weights. Examples were separately authored using coaching requirements and reviewed public references.

Create a strong hero, concise problem/solution, coach workflow, architecture explanation, engineering highlights, experiment comparison, verification and honest limitations. Use existing site components, accessible typography, mobile layouts and dark mode where supported. Add appropriate page metadata.

Link to GitHub. A secondary live-app link must explain invite-only access and Mac-dependent AI; do not promise a working public demo. Use only screenshots I provide and authorize for publication. Otherwise create clearly labeled illustrative UI with fictional people/data; never call mockups production evidence. Never use private records, vault files, uploaded PDFs or account pages as public content. Do not invent my identity, qualifications, employment, clients, revenue or traction; reuse verified profile details or leave placeholders.

Implement and locally verify the page and homepage card. Check responsive layout, accessibility and links. Summarize files and validation, and prepare a reviewable preview before publishing. Do not add paid services, trackers or private credentials.
```
