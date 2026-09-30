# CS Control Room — development summary for review

Written 2026-09-30 for another AI (or person) to analyse the work cold. It covers what the
project is for, what exists, what was built in the last session, the decisions behind it,
what was verified, and what is still open. Everything here can be checked against the code
in this folder; commit hashes are on `master` of `mmikgb/ia-process-designer`.

---

## 1. The owner's objectives

**Who:** Miguel García, candidate for *AI & Transformation Manager, Customer Success* at
Doctoralia México.

**The assignment** (from `case.json` → `brief`): a take-home plus a 60-minute live session.
Build two working deliverables on one dataset:

1. a **copilot for a farming CS specialist** (who to contact next, what to say), and
2. an **automated manager report** (what moved, and is it real).

**How it is judged:** does it run; are the AI's failure modes designed for; does the thinking
about the data hold up under questioning; can the candidate change it live without hesitating.

**What Miguel asked for in this session, in order:**

- Recover the work from a previous session whose files never reached his Mac.
- Make the dashboard look like a modern SaaS product (reference mockups), in Doctoralia's
  brand colours, using v0 where it helps and without wasting its free credits.
- Make it **dynamic**: controls that matter to CS specialists, not a static report.
- "Finish everything" in the implementation plan, then review and correct afterwards.
- This summary, so another AI can analyse the whole thing.

**The plan's definition of done** (`PLAN_CS_Control_Room.md`, "The gate"):

1. A specialist gets from opening the app to a sendable draft in under 30 seconds, without
   typing a doctor's name.
2. A manager can answer "is this week's drop real or noise?" from the screen, with no analyst.
3. Every number on every screen comes from one build, so two screens can never disagree.
4. Every alert names the rule that fired it and the doctor it fired on.
5. It runs from one command and rebuilds from one command.

**The sentence the plan says to keep in view:** an escalation answered in about twelve minutes
converts at 54%, one answered after two hours at 14%, and 352 doctors put their cancellation
in writing weeks before they left. If the app does not change those numbers, it did not work.

---

## 2. The data and the headline findings

- One synthetic Excel workbook (`data/dataset.xlsx`, not in git), 9 sheets: 5,571 doctors,
  5,526 onboardings, 475 escalations, 29,846 free-text contact notes (Spanish), monthly
  bookings, 6 campaigns, 18 specialists (14 farming, 4 onboarding), 3 farming teams.
  Extract date 2026-09-25. Miguel confirmed he has permission to use and share it.
- `FINDINGS.md` holds the analysis; `src/analysis.py` recomputes every number in it.

Findings the product is built around (all recomputed from the data):

| Finding | Number |
|---|---|
| Conversion by escalation pickup time | <30 min 53%, 30–60 41%, 60–120 26%, >120 min 14% |
| Raw conversion by specialist | 31%–51% |
| The same, only escalations answered inside 30 min | 50%–59%: the spread is queue speed, not people |
| Churn lift of "said they may cancel" | 5.45× the portfolio baseline (35.8% churn) |
| Lead time from a warning note to cancellation | median 18 days (may cancel) to 46 days (no-shows) |
| Ceiling of the watchlist | 138 of 366 churned doctors (38%) left a warning note first |
| Day-14 onboarding checkpoint | 25.0% end at grade D without calendar by day 14, 5.1% with it |
| Grade-D rate, last 30 days vs the 30 before | 20.8%, up 49.8% |
| Bookings per doctor, Apr–Aug | flat at 14.1–14.5; the fivefold rise in total bookings is book growth |

---

## 3. Architecture

```
data/dataset.xlsx ──► src/pipeline.py ──► src/bundle.py ──► out/app_data.json (23 MB, full)
   (workbook)          RULES, features      THE CONTRACT     out/overview.json (≈760 KB, web)
                       notes.py (24 rules)                   out/doctors/<owner>.json (dossiers)
                       series.py, spc.py,                         │
                       forecast.py, kpi.py,                       ├──► src/app.py   (Streamlit, 12 screens)
                       insight.py, llm.py, draft.py               └──► web/         (Next.js, 5 screens)
```

Rules that hold across the codebase:

- **One build, one bundle, every surface reads it.** Neither front end recomputes a metric.
  The web app only picks a precomputed block (portfolio × period) and filters rows.
- **Python computes, the browser displays.** Per-portfolio and per-period KPIs, the team
  table, control limits, lead times, drafts and the Pulse series are all built in Python.
- **The model is optional.** AI is off by default; every screen and every draft is
  deterministic. `llm.py` is the only path to a model, with a ledger, a budget cap and a kill
  switch. Nothing that produces a score, a limit, a forecast or a ranking goes through a model.
- **Thresholds live in `pipeline.py` `RULES`**, never in a UI control, so every screen shows
  the same number. Labels quote the rule in force.
- **The cache key covers the workbook, the rules and the source code** (`bundle.py`), so an
  edit on stage always rebuilds.

Stack: Python 3 / pandas / Streamlit / Plotly (original app); Next.js 16 + TypeScript +
Tailwind v4 + shadcn/ui + Recharts (web app, first drafted in v0, then built out by hand).

---

## 4. What existed before this session

Commit `ecbb8a7`, from an earlier session: the pipeline, the note classifier, the copilot with
8 plays and an evidence-completeness confidence score, control charts, forecast/watchlist,
the KPI module, the Streamlit app with 12 screens (Specialist and Manager roles), the static
manager report, `FINDINGS.md`, `BUILD.md` and the plan.

---

## 5. What was built in this session

| Commit | What |
|---|---|
| `7dd7a27` | `plotly` was missing from `requirements.txt`; a clean install could not start the app |
| `ac3cd21` | `bundle.py` exports a small web view (`out/overview.json`) on every build |
| `8fc4fc8` | KPIs precomputed per portfolio (whole book, 3 teams, 14 specialists) × period (30/60/90 days). **Bug fix:** the cache ignored rule edits, so a live threshold change returned the old bundle |
| `14628cf` | Web dashboard with controls, Doctoralia palette |
| `bb4dde2` | Control screen, watchlist context (lead times, ceiling, day-14), filters persist across screens. **Bug fix:** cache also ignored code edits. XmR lower limit floored at 0 (pickup chart drew negative minutes) |
| `f69e78e` | Doctor panel: why now, the copilot's draft (editable, copy) or call brief, facts, monthly bookings, last contacts, done/snooze |
| `8f75ffe` | My team screen: work per book, pickup per specialist, conversion when fast, every count opens that list |
| `9033673` | Pulse and Cost screens. Price fix in `llm.py`: Sonnet 4.5 $3/$15, Opus 4.5 $5/$25 per MTok (correct for those models, but Sonnet 4.5 is the model being retired; see §11 T0.3, which moves to `claude-sonnet-5-5` at $2/$10 and brings the estimate back to $1.754). Estimate moved from $1.754 to $1.88 at the time |
| `a50c9d5` | Live-demo hardening: KPI labels quote `RULES` instead of "30 min"/"under 6"; `bundle.py` writes straight into `web/` so `pnpm dev` hot-reloads after a rebuild |

### The web app, screen by screen

| Screen | Content | Controls |
|---|---|---|
| **Overview** | Health score (100 − mean risk), 8 KPI cards with delta and neutral sparkline (end dot coloured by whether the move is good), attention signals ranked by churn lift, risk bands, weekly onboardings (Activated A/B vs Struggling C/D, stacked), the watchlist, lead times, the 38% ceiling, the day-14 checkpoint | View as Manager/Specialist · portfolio (book, team, specialist) · compare last 30/60/90 days · tier (act now / watch / overdue) · signal · sort by lead time left or risk · done / snooze 7d · attention rows open the matching doctors · click a doctor for the panel |
| **My team** | Per specialist: portfolio, at risk (count and share), may cancel, thin agenda, not found, open commitments; escalations, median pickup with a 12-week strip on one axis, inside target, converted, converted when fast (count only under 10); conversion by pickup bucket; unowned escalations | Team filter · every count opens the overview filtered to that specialist |
| **Pulse** | Interactions, enrollments, engagement rate (7-day, volume-weighted), onboardings started/closed, escalations (count only): daily bars + 7-day line on one calendar; monthly bookings with per-doctor; events | Brush selects a range; every chart, the range table and the event list follow |
| **Control** | Grade-D rate (p-chart, daily), onboarding score (XmR, weekly), median pickup (XmR, weekly), escalations/day (c-chart); frozen baseline Mar 1–Jun 30 shaded; signals labelled by Western Electric rule and side; stability verdict per chart; flagged-points table | Hover a point for the rule, value and limits |
| **Cost** | AI off state, one-off enrichment estimate ($1.88), per-specialist split, budget cap ($25/month), the three cost levers (dedupe 29,846 notes to 2,274 unique, batch at 50%, recompute only changed doctors), prices used | — |

Design choices worth checking: brand primary `#006a59`, surface `#f5f2ef`, ink `#2a2623`
(supplied by Miguel); dark theme derived, not official. Chart colours validated with a
colour-vision/contrast checker: the brand green reads grey as a chart mark, so charts use
`#00806a`/`#b7791f` (dark `#31a88e`/`#c1862b`). One y-axis everywhere; stacking only where
series share a unit and sum to a total; amber for control signals, never unlabelled red.

---

## 6. Deviations from the plan, and why

| Plan said | What happened | Reason |
|---|---|---|
| Build in Streamlit (decision 1, recommended) | Streamlit kept and untouched as the full app; a Next.js app added as a second reader of the same bundle | Miguel wanted a SaaS-grade look. The plan itself notes a second reader of the JSON costs no rework |
| Done/snooze in `out/state.db` | Streamlit still uses it; the web app keeps it in browser `localStorage` | A static web build has no server; state does not reach Streamlit or other people |
| Pulse and Cost after the ship line | Built | Miguel asked to finish everything |
| Six control charts, cut to three | Four | `spc.py` already produced four |
| "May and August flag themselves" on grade-D | Grade-D flags June (two points beyond 3σ) and a rule-2 point in September; April and July are runs *below* the centre | Shown as the data says, not as anticipated |
| Export this view to static HTML | **Not built** | `report.py` still produces the Monday email |

---

## 7. Verification that was actually run

- Streamlit: `streamlit.testing.AppTest` visits all 12 screens (both roles) after every
  Python change: 0 exceptions.
- Web: `tsc --noEmit` and `next build` pass. Playwright scripts in Chromium exercised every
  control: period, portfolio, role switch, tiers, signal, sort, done/snooze with reload
  persistence and undo, attention link, doctor panel (opens in ~170 ms, copy to clipboard,
  Escape closes), team count → filtered overview, Pulse brush, all five screens at 1360 px
  light and 375 px dark with page scroll width equal to viewport. No console errors except the
  Vercel Analytics script 404, which only exists when deployed.
- Numbers cross-checked against Python: whole book at 30 days reproduces the original KPI
  block exactly; control-chart flag counts 20/5/0/12; Pulse total interactions 29,846.
- Rehearsal: a workbook missing a sheet and a column returns named errors (exit 1); the build
  runs with no API key; `calendar_healthy_slots` 6 → 8 moves "Agenda too thin" 540 → 799
  on a running `pnpm dev` page with no reload or restart.

Not verified: behaviour on Miguel's Mac (Node/pnpm/Python versions there), deployment to
Vercel, real clipboard permissions in Safari, and anything with the AI switched on.

---

## 8. Known issues and open questions

1. **No play for "discouraged" doctors.** `draft.py` has a call-brief play for "may cancel"
   but none for "discouraged", so a discouraged doctor in "Act now" can get a cheerful
   calendar-activation message. Adding a brief play is a product decision (and a good live
   `PLAYS` change for the demo).
2. **Hardcoded "30 minutes" in Streamlit copy** (`src/app.py` lines ~252–258, 336). The web
   app reads `RULES`; Streamlit does not.
3. **Extract artefact:** zero onboardings started on days 29–31 of every month. Flagged on the
   Pulse screen, not corrected.
4. **Onboarding specialists (S15–S18) own no doctors**, so they are absent from portfolio
   filters. The team view is farming-only by design.
5. **Attention-list churn and lift are portfolio-wide even in a specialist view** (a
   400-doctor book is too small to re-measure lift). Counts are per portfolio. Check this
   reads honestly on screen.
6. **Web state is per browser.** Done/snooze does not sync between devices or people.
7. **Data files are committed** (`web/data/overview.json`, `web/public/doctors/*.json`,
   ~13 MB) so the web app runs without Python. They regenerate on every build.
8. **v0 usage:** two generation rounds; the second cost $1.21 of a $5 monthly free credit.
   The v0 chat holds an early version; the repo is the source of truth.
9. ~~Model IDs in `llm.py` are Claude 4.5-generation models.~~ Moved to current models in
   §11 T0.3.

---

## 9. What a reviewer should look at

Suggested questions, roughly in order of how much they matter for the interview:

1. Does each screen answer its question for a CS specialist or a manager, or is anything
   there because it could be built?
2. Are the five gates in §1 actually met? Gate 5 is two commands (`bundle.py`, `pnpm dev`) on
   the web side.
3. Is any number shown in a way that invites a wrong reading (deltas, shares, stacked bars,
   per-portfolio vs portfolio-wide figures)?
4. Is the "no conversion leaderboard" stance on My team defensible, and is "conversion when
   fast" the right substitute?
5. Are the control charts honest given three of four processes were unstable in the baseline?
6. Does the copilot fail safely: below-confidence handover, call briefs instead of messages
   for threats, "leave it alone" as an output?
7. What would break first if this ran on real, live data every day?

## 10. How to run

```bash
cd cases/doctoralia-cs-ai-manager
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# put the workbook at data/dataset.xlsx
python3 src/bundle.py                 # ~14 s; also refreshes web/data and web/public/doctors
streamlit run src/app.py              # the full Streamlit app
cd web && pnpm install && pnpm dev    # http://localhost:3000
```

Key files: `src/bundle.py` (contract and web export), `src/kpi.py` (scopes, team),
`src/series.py` (Pulse), `src/spc.py`, `src/draft.py`, `src/llm.py`,
`web/components/**` (screens), `web/lib/controls.ts` (filters, done/snooze),
`PLAN_CS_Control_Room.md`, `FINDINGS.md`, `BUILD.md`.

---

## 11. Daily tool (`feat/daily-tool`): execution log

Work on `SPEC_Daily_Tool.md`, one ticket per commit. Where the spec and the code disagree, the
code wins and the difference is written here.

### T0.1 Baseline, before any change (2026-09-30, Linux container, Python 3.11.15, Node 22.22.2, pnpm 10.33)

| Step | Result | Time |
|---|---|---|
| `python3 src/bundle.py --no-cache` | ok, sha `87d65045a1c70b18`, 5,571 doctors, watchlist 954, bundle 23.4 MB, web view 763.5 KB | 15.3 s build (43 s wall incl. imports) |
| Rebuilt `web/data/overview.json` vs committed | identical except `meta.built_at` | – |
| `python3 src/analysis.py` | **fails** on a clean checkout: it reads `out/doctor_features.parquet`, which only `python3 src/pipeline.py` writes (`bundle.py` does not). After `pipeline.py` (9 s): exit 0 | 8 s |
| Streamlit AppTest (`tests/test_streamlit.py`, new): 12 screens, both roles | 13 passed, 0 exceptions. One `PytestUnhandledThreadExceptionWarning` from the container's system `cryptography` package in a background thread (keyring); environment, not app | 34 s |
| `pnpm install --frozen-lockfile` | ok | 7 s |
| `pnpm typecheck` | ok | 5 s |
| `pnpm build` | ok, 6 static routes; Recharts logs "width(-1) and height(-1)" while prerendering (harmless at build time). Note `ignoreBuildErrors: true` was still on | 12 s |

Spec vs code: the spec says `analysis.py` runs after `bundle.py`; it actually needs `pipeline.py`
first. Order to use: `pipeline.py` → `bundle.py` → `analysis.py`.

### T0.2 Config hygiene

- `next.config.mjs`: `ignoreBuildErrors: false`, `agentRules: false` (the option exists in Next
  16.3.3's config schema). `pnpm dev` served `/` with 200 and wrote no `web/AGENTS.md` or
  `web/CLAUDE.md`; both are in `web/.gitignore` anyway. `typecheck` and `build` pass with errors
  no longer ignored: nothing surfaced.
- `web/.env.example` added. The repo-root `.gitignore` ignores `.env.*`, which would have
  swallowed it; `web/.gitignore` re-includes `!.env.example`.
- Added `@anthropic-ai/sdk`, `zod`, `sonner`, `cmdk`, dev `@playwright/test`; `pytest` in
  `requirements.txt`; `tests/conftest.py` puts `src/` on `sys.path`.
- **Not done: the shadcn components.** `pnpm dlx shadcn@latest add …` fails because
  `ui.shadcn.com` is blocked by this container's egress policy (403 on CONNECT); npm is
  reachable. The components (`sidebar`, `command`, `dialog`, `sheet`, `tabs`, `dropdown-menu`,
  `avatar`, `progress`, `textarea`, `toggle-group`, `select`, `popover`, `sonner`, `skeleton`,
  `kbd`) will be written by hand on `@base-ui/react` in the phase that first uses them, matching
  the existing `base-nova` files in `components/ui/`. On a Mac with open network the CLI command
  in the spec works and can replace them.

### T0.3 Models and prices

- `src/llm.py` `PRICES`: added `claude-haiku-4-5-20251001` $1/$5, `claude-sonnet-5-5` $2/$10,
  `claude-opus-5-5` $4/$20; kept the 4.5 rows for old ledger rows. New constants `MODEL_FAST`
  (Haiku 4.5) and `MODEL_DEEP` (Sonnet 5.5); `DEFAULT_MODEL = MODEL_FAST`,
  `model_by_task.themes = MODEL_DEEP`. `insight.cost_estimate()` now prices with these constants
  instead of hard-coded 4.5 IDs, so the estimate follows the models actually used.
- Prices and IDs checked against the Claude API reference bundled with Claude Code (models table
  cached 2026-09-25). That table still lists `claude-sonnet-4-5` as active with no date; the spec
  cites the deprecations page for "retirement not sooner than 2026-09-29". Either way the move
  is right; the web deprecations page itself was not read from this container.
- Found in the code, not in the spec:
  - `save_settings()` writes the whole `model_by_task` into `out/settings.json`, so on any
    machine where AI was once toggled in Streamlit the old models stayed pinned and a
    default change would be silently ignored. `settings()` now merges per task and maps retired
    IDs to their successors (`REPLACED`). Checked with a temp settings file holding the 4.5 IDs.
  - `llm.call()` read `m.content[0].text`. On current models the first block can be a thinking
    block, so every real call would have fallen back. It now joins the text blocks, and a
    refusal or empty answer returns the fallback with its reason (and still logs the cost).
  - `draft.polish()` calls Anthropic directly, outside `llm.py`, and nothing calls it. Pointed
    at `MODEL_FAST` with the same text-block fix; removing it or routing it through `llm.call`
    is left for Phase 4 (the web writer replaces it).
- Cost screen: reads `cost.prices` and `cost.estimate` from the bundle; after a rebuild the
  one-off enrichment estimate is **$1.754** (themes $0.252 + summaries $1.502), down from $1.88.
  `BUILD.md` updated. The README "$0.10 per specialist" line is T4.8's.
- Check: `python3 -c "import sys; sys.path.insert(0,'src'); import llm; print(llm.PRICES)"` prints
  the six rows.

### T1.1–T1.3 Bilingual copilot, discouraged play, thresholds, the day

- `src/i18n.py`: `L(en, es)`, plus `en()` and `pct()`.
- `pipeline.risk()` returns `(score, [{key, text: L}])`; `risk_reasons` (English, joined) is
  byte-identical to before for all 5,571 doctors; `risk_reasons_i18n` is new. Churn rates in
  the reasons come from `LIFT`.
- `draft.py`:
  - New `discouraged` brief play right after `churn_threat`. "Visible progress" comes from
    bookings rising, then calendar and slots: **the workbook has no reviews**, so the spec's
    "reviews" option does not exist.
  - `hollow_calendar` fires below `RULES["calendar_healthy_slots"]` (was a hard-coded 8). The
    "cerca de N citas más" sentence is computed at build time from every calendar-on doctor
    below vs at/above the rule (`slots_low_avg` 11.3 vs `slots_ok_avg` 15.2 at 6 → "cerca de 4",
    which matches FINDINGS §9). If the gap rounds below 1 the sentence is dropped.
  - `gone_quiet` reads `RULES["stale_contact_days"]` (was a literal 21).
  - `"el jueves"` removed from `bundle.py`, `copilot.py`, `app.py`; `compose()` defaults to
    `next_business_day(extract_date)` = "el lunes 28 de septiembre".
  - Every play has `why_es`, `ask_es`, `brief_es`; confidence gaps, `channel_note()` and
    `handover()` are bilingual; `compose()` adds `i18n`. Specialist-facing Spanish uses *tú*;
    messages to doctors stay *usted*.
  - Play mix across all 5,571 doctors, before → after: `discouraged` 0 → 100,
    `hollow_calendar` 665 → 413 (threshold 8 → 6), `upsell_lead` 966 → 1,042 and no play
    1,139 → 1,242 (doctors that used to fall into the 6–7-slot hollow case), `calendar_off`
    864 → 837, `complaint_no_patients` 289 → 267.
  - The brief quotes `top_signal_note`, the most urgent note by priority. For a discouraged
    doctor that can be a complaint note of the same priority rather than the "desanimado" note.
    Left as is.
- `tests/test_draft.py`: 12 tests, including every check the spec lists.

### T1.4 Follow-ups from the specialists' own notes

- `notes.followup()` / `notes.followups()`: the four patterns in the spec, applied to the
  latest interaction per doctor only. When one note schedules two ("Reintentar la próxima
  semana. Seguimiento el viernes."), the earlier date wins. "Seguimiento el lunes" written on a
  Monday → the following Monday.
- New columns on the doctor table: `followup_due_at`, `followup_kind`, `followup_note`,
  `followup_set_at`, `followup_set_by`. They are merged in `pipeline.doctor_features()`, not in
  `doctor_signals()`, because `doctor_signals()` only has rows for doctors with a tagged note.
- `python3 src/notes.py` at 2026-09-25, active doctors: **1,498** with a follow-up; overdue by
  1–14 days **463**; due today 37; due within 5 days 121; due later 33; stale (>14 days
  overdue) **844**. By kind: review 632, weekday 618, retry 142, reschedule 106. 3,187 notes
  mention scheduling but match no rule. Almost all are the bare "Reagendar." after an
  onboarding no-show, which carries no date.
- `tests/test_notes.py`: 14 tests.

### T1.5 `src/dayplan.py`: the day, per owner

- `build(doc, watchlist, rules, asof, copilot=None, names=None)`: blocks
  call → followup → message → handoff → later, one block per doctor. New rules in `RULES`:
  `daily_capacity` 20, `daily_followup_quota` 8, `followup_stale_days` 14.
- Decisions the spec left open:
  - Brief-mode doctors that are not `act_now` go to `later`: "past the usual warning time"
    when the watchlist tier is `overdue`, "weaker signal, not a call for today" otherwise.
  - Active doctors whose play is a draft but whose evidence is below the confidence floor go
    to `later` ("evidence too thin to draft"), not into Messages.
  - Doctors with no play and no follow-up are not in the queue at all.
  - Capacity overflow keeps its order (follow-ups first, then messages in PLAYS order) and
    carries `origin` ("followup" | "message") so the web can bring it back when there is room.
    `origin` is an addition to the §5.1 contract.
  - A follow-up keeps the doctor's play, which can be `null` (nothing else wrong) or a handoff.
  - Reasons name who scheduled a follow-up: "Agendaste…" for the owner, "Damián agendó…"
    otherwise (the note's author is not always the owner).
- Sizes per specialist at the extract date (before capacity): calls 0–8 (57 in total, exactly
  the `act_now` rows in brief mode), follow-ups in the 14-day window 25–55, confident drafts
  157–195, handoffs 47–75, briefs past their lead time 9–24. Today's plan per specialist:
  every call, 8 follow-ups, messages to fill 20.
- `flags()` per active doctor; churned get `[]`. Counts per owner equal `kpi.team` rows for
  hollow, not_found, open_commitments, may_cancel and at_risk (tested).
- `tests/test_dayplan.py`: 10 tests, including every check the spec lists; the PLAYS reorder
  test uses unlimited capacity so the reorder is visible in the full candidate list.

### T1.6 KPIs: sample sizes and honest notes

- `_kpi()` carries `n`; for `sla`, `conversion`, `grade_d` a value on fewer than
  `RULES["min_n_rate"]` (10, moved from `kpi.MIN_ESC`) is withheld with `suppressed: L(...)`,
  and the delta is withheld when either window is short. S10's "100% ▲+250% on 5
  escalations" is now "Solo 5 casos: muy pocos para un porcentaje". `onb_score` carries `n` but
  is a mean, so it is not suppressed.
- Notes are computed: conversion quotes the team screen's buckets (53% inside 30 min, 14% after
  two hours; the old hard-coded "54%" is gone); may-cancel and grade-D quote `LIFT`,
  `BASELINE_CHURN` and the grade-A churn rate. Portfolio-wide figures are computed once
  (`kpi.context`) and passed to every scope, so the notes read the same everywhere.
- Labels and notes are `L(...)`. Attention labels, segment names and `health_note` stay
  strings until T5.6.
- To keep the running app unchanged: `web/lib/tx.ts` (minimal `tx()`, English until T2.3),
  `KpiItem` types updated, the KPI card shows "—" and the suppression text when a rate is
  withheld; Streamlit's `viz.kpi_card` reads the English side.
- `tests/test_kpi.py`: 4 tests (no rate below n=10 in any scope or period; the Overview note
  and the team screen agree on conversion; bilingual labels quote `RULES`).

### T1.7 Bundle: queue, search and dossier files

- `bundle.py` writes `out/queue/<owner>.json` (from `dayplan.build`), `out/search.json` and the
  richer dossiers, and copies all three into `web/public/`; `web/scripts/sync-data.mjs` does
  the same. The copilot output and flags are computed once (`web_doctors()`) and shared by the
  dossiers, the queues and search, so they cannot disagree. `meta` gains `asof`,
  `queue_capacity`, `followup_quota` and `plays` (ordered, with bilingual labels, which were
  added to `PLAYS`). The build prints the per-specialist queue sizes.
- Contract differences (all in `web/lib/types.ts`):
  - `search.json` uses short keys (`SearchRowRaw` + `searchRow()`): 1,173 KB with full keys,
    973 KB short.
  - Dossiers: `contacts_all` is written only when a doctor has more than 6 contacts (absent =
    `contacts` is complete); the English copilot texts live only in `copilot.i18n` (no
    duplicate `why`/`ask`/`instead`/`channel`/`gaps` keys); `risk_reasons` (English string)
    is dropped in favour of `risk_reasons_i18n`. Streamlit is unaffected (it reads the bundle).
  - Campaign `name` is the campaigns sheet's `ask` column: the sheet has no name column.
  - The existing doctor panel now reads `risk_reasons_i18n` and `copilot.i18n` via `tx()`.
- Checks: queue sizes printed; `pnpm build` passes; the Playwright smoke test (overview KPI
  card, doctor panel, all five screens) shows no errors other than the known Vercel
  Analytics 404. **Not met: web/public data is 24.1 MB against the < 20 MB check**
  (dossiers 21 MB, queues 1.9 MB, search 1.0 MB; it was 13 MB before). Every cut left that
  loses no information is already made. What remains is what the spec adds (full contact
  history, campaigns, escalations, bilingual briefs). Options for Miguel: (a) serve each play's
  `why`/`ask` once in `meta.plays` instead of in every dossier (−1.7 MB; they are the same for
  every doctor on a play), (b) move the history (`contacts_all`, campaigns, escalations) to
  per-owner history files loaded on the Historial tab (same total, faster panel), (c) raise
  the cap.
- `tests/test_bundle_web.py`: 4 tests on the files against §5.

### Miguel's answers at the Phase 1 pause (2026-09-30)

- **Capacity, quota and window are dynamic.** `RULES` keeps the defaults (20 / 8 / 14);
  a specialist can change them live on Hoy. `dayplan.py` is split in two: `classify()`
  decides in Python which blocks each doctor can occupy (`claims`), the order inside each
  (`ranks`) and the reason for each; `plan()` is the cut (capacity, quota, window, app day).
  The queue files carry both, cut with the defaults; `web/lib/dayplan.ts` (Phase 3) will be a
  line-for-line copy of `plan()`. The same split lets "Avanzar un día" bring follow-ups in
  as they come due. Follow-ups not yet due now appear in `later` as "vence el …".
- **Size does not matter**: web/public at ~24 MB is accepted; no further cuts.
- **The dataset is synthetic** (invented for the case) and is committed at
  `data/dataset.xlsx`, so a clean clone builds.
