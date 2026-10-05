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
| `9033673` | Pulse and Cost screens. **Bug fix:** model prices in `llm.py` (Sonnet 4.5 is $3/$15, Opus 4.5 $5/$25 per MTok, per the official pricing page; the file had $2/$10 and $4/$20). Estimate moved from $1.754 to $1.88 |
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

### Added on 2026-10-05

- **Roles.** "Viewing as" picks a manager or one specialist. A specialist gets My day,
  Conversations and their own doctors' profiles; My team, Pulse, Control and Cost are
  manager-only. Demo switch, not authentication.
- **More calls, and a list that matches the count.** `draft.py` gained a call-brief play for
  doctors noted as discouraged (2.3× churn, ~24 days of warning). Before, only "may cancel"
  got a call: 226 of the ~790 high-risk doctors; now 298. The queue now holds every doctor
  with a warning note plus every active doctor at risk ≥ 0.50 (1,107 rows), so the
  "At risk" tab equals the "Doctors at risk" KPI (788).
- **Send on WhatsApp** opens `wa.me` with the draft; the human sends. Marked as sent locally.
- **How risk is estimated**: the weights now live in one table (`pipeline.RISK_WEIGHTS`),
  exported to every place risk is shown. Scores are unchanged for all 5,571 doctors.
- **Sortable tables**: the queue (with average monthly bookings vs peer median and last
  contact) and both My team tables sort by any column.
- **Compare with** replaces 30/60/90 days: previous 30 days, my team, whole portfolio, or the
  frozen Mar–Jun baseline. Counts are compared per 100 active doctors. Computed in `kpi.py`.
- **Conversations** screen and **doctor profile** page, from `out/doctors/chats/` and the
  extended dossiers. The source holds the specialist's note of each contact, not the
  messages; the screen says so.
- **Bug fixed:** a cache hit did not rewrite `out/app_data.json`, so after a live rule change
  and its revert, Streamlit kept showing the changed data.

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

1. ~~No play for "discouraged" doctors.~~ Added 2026-10-05 (call brief).
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
9. **Model IDs in `llm.py`** are Claude 4.5-generation models. Prices are now correct; whether
   to move to current models is Miguel's call.

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
