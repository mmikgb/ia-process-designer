# CS Control Room v2: from a report to a daily tool

Spec and execution plan for Claude Code. Written 2026-09-30.

**How to use this file.** Work through the phases in order, one ticket per commit, on the branch
`feat/daily-tool`. Each phase ends in something that runs. Run the checks listed under each ticket
before committing. Stop at every **⏸ Miguel** marker and wait for him before continuing. When this
file and the code disagree about what exists today, trust the code and write down the difference
in `HANDOFF.md`.

Read first, in this order: this file, `HANDOFF.md`, `PLAN_CS_Control_Room.md` (sections "The gate",
"The AI layer", "Cost control", "The zero-credit guarantee"), `src/draft.py`, `web/lib/controls.ts`.
The design references are in `docs/design-refs/` (see §6).

---

## 0. Why this exists

The web app today is a manager dashboard with a "view as specialist" switch. The specialist's work
queue, the copilot that decides who to contact and what to say, stayed behind in Streamlit. That is
why it feels like a static report. Measured on the committed build (`web/data`, `web/public/doctors`):

| Finding | Evidence |
|---|---|
| The app opens as Manager, whole portfolio. A specialist has to switch role, and the switch picks the first specialist, not them | `defaultFilters()` → `role: "manager"`; `setRole()` → `data.specialists[0].id` |
| The work list starts ~2,065 px down the page (1440×900 viewport), under the health score, 8 KPIs, attention list, risk bands and the onboarding chart | Playwright, `#worklist` offset |
| "My day" is the watchlist, not the copilot queue. Of **2,899** sendable drafts in the build, **647 (22%)** are reachable from it. Of **963** upsell handoffs, **26** are | dossiers vs `watchlist.items` |
| "Act now" holds 0–8 doctors per specialist (S09 has 0). It contains 41 call briefs and 13 drafts, and those 13 are exactly the "discouraged" doctors who get a cheerful activation message (known issue #1) | same |
| Gate 1 (open → sendable draft in 30 s, no typing) is not met on the default path in the web app | the first act-now row is always a call brief |
| Reordering `PLAYS` does not reorder "My day": the list is sorted by lead time and risk. The planned live change would only show inside a doctor panel | `worklist()` in `web/lib/controls.ts` |
| My team: "At risk 50" opens 66 rows (42 overlap). "Agenda too thin", "Not being found", "Open commitments" are not clickable (HANDOFF says every count opens its list) | `team-screen.tsx` lines ~142–154 |
| Specialist KPIs show rates on tiny samples: S10 conversion 100% ▲+250% on 5 escalations, S09 0% ▼−100% on 4. The project's own rule is no rate below n=10. A 0.0% change renders as a red down arrow | `scopes.S10.periods.30.kpis` |
| The same fact disagrees across screens: Overview says escalations inside 30 min convert at "54%" (hard-coded note in `kpi.py`), My team says 53% (computed) | `kpi.py` `note=`, `team.buckets` |
| Thresholds leak: the `hollow_calendar` play fires below **8** slots and its message says "al menos 8", while `RULES["calendar_healthy_slots"]` is **6** and the KPI uses 6 | `draft.py` `hollow_calendar.when` |
| Nothing ages. Lead time left is frozen at the extract date; every draft says "el jueves" (`bundle.py:273`, `copilot.py:77`, `app.py:95`); "Done" is a boolean with no outcome; state lives in one browser | code |
| The operation's own follow-ups are invisible. **1,499** active doctors have a scheduled follow-up in their latest note ("Lo agendé para revisión en N días", "Reagendar en N días", "Seguimiento el jueves", "Reintentar la próxima semana"). At the extract date ~460 are overdue by ≤14 days and ~160 fall due within 5 days: 35–58 per specialist | regex over the latest contact per doctor in the dossiers; recompute in `notes.py` |
| Miguel asked for generative AI inside the web tool (interpret results, explain what happened, deep-dive a doctor, write WhatsApp and email messages). The web app has no model call at all | `web/` has no API route |
| `claude-sonnet-4-5` (the model in `llm.py`) is scheduled for retirement "not sooner than 2026-09-29". Current models: `claude-sonnet-5-5` ($2/$10 per MTok), `claude-opus-5-5` ($4/$20), `claude-haiku-4-5-20251001` ($1/$5, retirement not sooner than 2026-10-15) | platform.claude.com/docs/en/models/overview and /about-claude/model-deprecations, read 2026-09-30 |

## 1. What "done" means

The original five gates stay. These are added, and they are the ones that make it a tool:

1. **G1 ·** A specialist opens the app and is on *their* day, with no role switch and no scroll, in
   one click the first time (pick your name) and zero clicks after.
2. **G2 ·** From opening the app to the first actionable item (a call brief or a sendable draft) in
   ≤ 3 clicks, and to a sendable draft in ≤ 4 clicks, both < 30 s, measured by Playwright. (The day
   starts with calls on purpose, so the first item is often a brief, not a message.)
3. **G3 ·** Every queue item closes with an **outcome**, and the outcome changes tomorrow's queue
   (a follow-up returns on its date; "no answer" returns in 2 business days).
4. **G4 ·** Every count on every screen opens a list whose length equals the count.
5. **G5 ·** Generative AI is visible and useful on the specialist's path (briefing, doctor analysis,
   message writer, ask) and the manager's path (what happened, real or noise), and **every AI
   surface has a deterministic fallback** that renders with no API key.
6. **G6 ·** No AI output shows a number that is not in its context without a visible flag.
7. **G7 ·** The UI works in Spanish and English with a toggle. Messages to doctors are always Spanish.
8. **G8 ·** Moving one entry in `PLAYS` or one value in `RULES`, then `python3 src/bundle.py`,
   visibly changes the specialist's day on a running `pnpm dev`.

## 2. Decisions already taken (do not reopen)

| Decision | Choice |
|---|---|
| Language | Bilingual UI, toggle ES/EN, default **ES**. Drafts to doctors are Spanish (usted) in both modes |
| Palette | Doctoralia: primary `#006a59`, surface `#f5f2ef`, ink `#2a2623`. Layout and component style from the references in `docs/design-refs/` (§6) |
| Where numbers come from | Python, in the bundle. The browser picks, filters, sorts and formats; it never computes a metric. The model never computes a number |
| Where the model is called | Build time: `src/llm.py` (unchanged role). Run time: `web/lib/ai/gateway.ts`, the only web module that talks to Anthropic, with the same three guarantees as `llm.py` (never throws, ledger row per call, kill switch + budget) |
| Work state | Server side, append-only event log `out/work_log.jsonl` via `/api/work`; `localStorage` only as an offline fallback |
| Streamlit | Kept. It gets the bug fixes that touch shared code (slot day, thresholds, discouraged play) and nothing else |
| Out of scope | Sending messages, writing to a CRM, a churn model, embeddings, auth. The app drafts; people send |

## 3. Architecture after this spec

```
data/dataset.xlsx
   └─► src/pipeline.py (RULES) ─► features ─► src/dayplan.py (NEW: the day, per owner)
        src/notes.py (+ follow-ups)             src/draft.py (PLAYS, bilingual)
        src/kpi.py (+ n, suppression, i18n)     src/i18n.py (NEW)
   └─► src/bundle.py ─► out/overview.json            ─┐
                       out/doctors/<owner>.json      ├─ copied into web/ on every build
                       out/queue/<owner>.json (NEW)  │
                       out/search.json (NEW)         ─┘
web/ (Next.js 16)
   app/(shell)/hoy | doctores | senales | equipo | resumen | pulse | control | costo
   app/api/work          ─► out/work_log.jsonl        (outcomes, follow-ups, undo)
   app/api/ai/*          ─► lib/ai/gateway.ts ─► Anthropic
                               ├─ lib/ai/context.ts   grounded context, built from the bundle files
                               ├─ lib/ai/prompts.ts   versioned prompts
                               ├─ lib/ai/guard.ts     number check, banned phrases
                               ├─ lib/ai/fallback.ts  deterministic output per task
                               └─ lib/server/ledger.ts ─► out/llm_ledger_web.jsonl
   out/settings.json  shared with src/llm.py (kill switch, budget, models)
```

Rules that do not change: one build, one bundle; thresholds only in `RULES`; plays only in
`PLAYS`; the cache key covers workbook + rules + code.

---

## 4. Phases and tickets

Each ticket: what to change, where, and how you know it is done. "Check" lines are commands or
assertions to run before the commit.

### Phase 0 · Prepare (half a day)

**T0.1 Branch and baseline.** `git checkout -b feat/daily-tool`. Put the workbook at
`data/dataset.xlsx` (Miguel has it; it is git-ignored). Run `python3 src/bundle.py --no-cache`,
`python3 src/analysis.py`, the Streamlit AppTest (if there is no script for it, add
`tests/test_streamlit.py`: `AppTest.from_file("src/app.py")`, visit all 12 screens in both roles,
assert no exceptions), `cd web && pnpm install && pnpm typecheck && pnpm build`.
Record timings and any failure in `HANDOFF.md` before changing anything.
Check: all pass, or the failure is written down.

**T0.2 Config hygiene.**
- `web/next.config.mjs`: `typescript.ignoreBuildErrors: false`.
- Next 16 writes `web/AGENTS.md` and `web/CLAUDE.md` on `pnpm dev` (its log says so); set
  `agentRules: false` in `next.config.mjs` so they are not generated, and add both to
  `web/.gitignore` in case they already exist.
- Python: add `pytest` to `requirements.txt` and a `tests/conftest.py` that puts `src/` on
  `sys.path` the same way the scripts do.
- `web/.env.example` with `ANTHROPIC_API_KEY=`, `CS_AI_MODEL_FAST=claude-haiku-4-5-20251001`,
  `CS_AI_MODEL_DEEP=claude-sonnet-5-5`, `CS_AI_DISABLED=`, `CS_AI_MOCK=`, `CS_CLOCK=snapshot`.
  The real key goes in `web/.env.local` (already ignored by `.env*.local`).
- Add dependencies: `@anthropic-ai/sdk`, `zod`, `cmdk` (via shadcn `command`), `sonner`;
  dev: `@playwright/test`. Add shadcn components: `sidebar`, `command`, `dialog`, `sheet`, `tabs`,
  `dropdown-menu`, `avatar`, `progress`, `textarea`, `toggle-group`, `select`, `popover`, `sonner`,
  `skeleton`, `kbd` (use `pnpm dlx shadcn@latest add …`; style is `base-nova` per `components.json`).
Check: `pnpm typecheck && pnpm build` pass with errors no longer ignored (fix what surfaces).

**T0.3 Models and prices.** In `src/llm.py`: add `claude-sonnet-5-5` {in 2, out 10},
`claude-opus-5-5` {in 4, out 20}, `claude-haiku-4-5-20251001` {in 1, out 5}; keep the 4.5 entries
for old ledger rows. `DEFAULT_MODEL = "claude-haiku-4-5-20251001"`, `model_by_task.themes =
"claude-sonnet-5-5"`. Update the price comment with the source URL and date. Update the Cost screen
numbers that depend on it, and the claim in `HANDOFF.md` §5 row `9033673` (the old "correction"
priced the model that is being retired).
Check: `python3 -c "import sys; sys.path.insert(0,'src'); import llm; print(llm.PRICES)"`.

### Phase 1 · The day, computed in Python (1–1.5 days)

Everything the specialist sees on "Hoy" is decided here. After this phase the web app is unchanged
but the data it will read exists and is tested.

**T1.1 `src/i18n.py` (new).** One helper and one convention:

```python
def L(en: str, es: str) -> dict:  # a bilingual string
    return {"en": en, "es": es}
```

Every human-readable string that Python writes into a web file becomes `L(...)`. Never translate
data (doctor names, specialties, cities, notes). Migrate the specialist-facing fields in this phase
(copilot, risk reasons, queue reasons, follow-ups, KPI labels/notes on the specialist scopes);
manager-only text (SPC, pulse, cost, team) in Phase 5. The web helper `tx()` (T2.3) accepts both a
plain string and `{en, es}`, so migration can be gradual.

**T1.2 Risk reasons, bilingual and structured.** `pipeline.risk()` returns `(score, reasons)` where
`reasons` is a list of `{"key": str, "text": L(...)}` instead of one joined string. Keep a
`risk_reasons` string (English, joined with " · ") for Streamlit and `report.py`; add
`risk_reasons_i18n` for the web. Spanish examples:
- `churn_threat` → "dijo que cancelaría o está comparando plataformas (36% de estos se van)"
- `discouraged` → "anotado como desanimado con los resultados (15% se van)"
- `bottom_quartile` → "cuartil inferior de {specialty} en {city} ({avg}/mes vs mediana {peer})"
The percentages in these strings come from the `LIFT` table, formatted, not typed by hand.

**T1.3 `draft.py`: the discouraged play, the threshold, the day, both languages.**
- Add play `discouraged`, **mode `brief`**, directly after `churn_threat`,
  `when=lambda r: bool(r.sig_discouraged) and not bool(r.sig_churn_threat)`. The brief (ES and EN) says:
  do not send a cheerful message; call; before dialing have (1) their bookings vs peer median,
  (2) what they said and when, (3) one piece of visible progress you can show them (from the
  record: calendar on, slots, reviews), and a date for the next check-in. `why` cites the 2.28×
  lift from `pipeline.LIFT["discouraged"]`.
- `hollow_calendar.when` uses `RULES["calendar_healthy_slots"]` (import `RULES` from `pipeline`;
  if that creates a cycle, pass rules into `compose()`), and its template says
  "al menos {healthy} horarios" with `healthy` added to `fmt()`. The sentence about "cerca de 4
  citas más" must come from the bookings-by-slots table in `FINDINGS.md` for the threshold in force,
  or be removed. Do not keep a number that no longer matches the rule.
- `slot_day`: remove every literal `"el jueves"` (`bundle.py`, `copilot.py`, `app.py`). Add
  `next_business_day(asof) -> str` returning Spanish like `"el lunes 28 de septiembre"`; `asof` is
  `RULES["extract_date"]` at build time. `compose()` defaults to it.
- Every play gets `why_es`, `ask_es`, `brief_es` next to the English ones; `handover()` and
  `channel_note()` return `L(...)`. `compose()` returns the existing keys (English, for Streamlit)
  plus `i18n: {"why": L, "ask": L, "instead": L, "channel": L | None, "gaps": [L]}`. Drafts (`es`
  templates) are unchanged in language.
Check: `pytest tests/test_draft.py` (new): discouraged-only doctor → mode `brief`; churn+discouraged
→ `churn_threat`; a doctor with 7 slots and rule 6 → not `hollow_calendar`; with rule 8 → yes; no
draft contains "el jueves"; every play has both languages.

**T1.4 `notes.py`: the specialists' own follow-ups.** New rule set, applied to the **latest
interaction per doctor only** (a newer interaction supersedes an older promise):

| Pattern (case-insensitive) | Due date |
|---|---|
| `revisi[oó]n en (\d+) d[ií]as` | note date + N days |
| `reagendar en (\d+) d[ií]as` | note date + N days |
| `reintentar la pr[oó]xima semana` | note date + 7 days |
| `seguimiento el (lunes\|martes\|mi[eé]rcoles\|jueves\|viernes)` | next such weekday after the note date |

Output columns on `doctor_signals`: `followup_due_at`, `followup_kind` (`review`, `reschedule`,
`retry`, `weekday`), `followup_note`, `followup_set_at`, `followup_set_by` (specialist id).
`notes.py` `__main__` prints how many doctors carry one and the due/overdue split at the extract
date. Expected order of magnitude from the dossier sample: ~1,500 with a follow-up, ~460 overdue
≤14 days, ~160 due within 5 days, ~840 overdue >14 days (treat those as stale, see T1.5).
Check: `pytest tests/test_notes.py` with the sample sentences above (and "Seguimiento el lunes"
written on a Monday → the following Monday).

**T1.5 `src/dayplan.py` (new): the day, per owner.** Do not name it `queue.py`: `src/` is put on
`sys.path`, and a local `queue` module shadows the standard library one that Streamlit and
`concurrent.futures` import. Pure function over the doctor features, the
watchlist and `PLAYS`:

```python
def build(doc, watchlist, rules, asof) -> dict[str, dict]:  # owner_id -> queue
```

Blocks, in this order. A doctor appears in **exactly one** block, the first that claims them:

| Block | Who | Order inside |
|---|---|---|
| `call` | active doctors whose play mode is `brief` **and** whose signal is still inside its lead time (watchlist `act_now`) | days of lead left ascending, then risk |
| `followup` | `followup_due_at` ≤ asof and ≥ asof − `RULES["followup_stale_days"]` (new rule, 14). The item keeps the doctor's play, so focus mode shows the draft/brief with a banner "Agendaste revisión para el 22 sep" | due date ascending, then risk desc |
| `message` | play mode `draft` and `confident` | index of the play in `PLAYS`, then risk desc, then bookings_avg desc |
| `handoff` | play mode `handoff` | upsell signal date desc |
| `later` | brief-mode doctors past their lead time ("pasó su tiempo típico de aviso; probablemente ya decidió"), follow-ups older than the stale window, and everything beyond capacity | kept, collapsed, labelled with `later_reason` |

Capacity, all in `RULES` so it can be changed live:
- `daily_capacity = 20` (README's cost assumes 15 messages a day; calls take longer).
- `daily_followup_quota = 8`: at most this many follow-ups in today's plan.
- `call` is never cut. Then up to the quota of `followup`, then `message` fills the rest of the
  capacity. Overflow goes to `later` with `later_reason` "beyond today's capacity" and comes back
  on the next day it fits.
- `handoff` does not count against capacity (it is one click).

Why the quota: on the committed build a simulation of these rules gives, per specialist, 0–7
calls (more once the discouraged play exists), 9–22 briefs past their lead time, 20–52 follow-ups
due inside the 14-day window (most of those doctors also have a play), ~170–215 confident drafts
and ~45–70 handoffs. Without a quota the follow-up backlog alone fills the day and no play ever
runs. Print these numbers from `bundle.py` so the quota can be argued from data.

Each item carries `reason: L(...)`, a one-line "why today" in plain words
("Dijo que cancelaría hace 13 días; suelen irse a los 18", "Agendaste revisión para el 22 sep",
"Agenda encendida con 1 horario; publicar 6+ le da más citas").

Also compute `flags` per active doctor (churned doctors get `[]`, matching `kpi.team`, which counts
active doctors only) for the list screen (G4): `at_risk` (risk ≥ 0.5),
`may_cancel`, `discouraged`, `hollow` (= `calendar_hollow`), `not_found` (= `demand_constrained`),
`commitment` (= `commitment_open`), `followup_due`, `calendar_off`, `grade_d`, `upsell`.
Check: `pytest tests/test_dayplan.py`: one block per doctor; `call` = the owner's `act_now` rows
in brief mode; today's `followup` ≤ quota; `len(call) + len(followup) + len(message) ≤ max(capacity,
len(call))`; moving
`visibility` above `hollow_calendar` in `PLAYS` changes the order of `message`; counts per flag
per owner equal `kpi.team` rows (`hollow`, `not_found`, `open_commitments`, `may_cancel`, `at_risk`).

**T1.6 `kpi.py`: sample sizes and honest notes.**
- `_kpi(...)` gains `n` (the denominator of a rate, or None for counts). For rate KPIs (`sla`,
  `conversion`, `grade_d`), when `n < MIN_ESC` (10; move the constant to `RULES["min_n_rate"]`)
  set `value=None`, `delta_pct=None`, `suppressed=L("Only {n} cases: too few for a rate", "Solo {n}
  casos: muy pocos para un porcentaje")`. Apply the same rule to `delta_pct` when either window has
  n < 10.
- Replace hard-coded notes with computed ones: "54% when answered inside 30 min, 14% after two
  hours" → from `team()["buckets"]`; "36% of these churn, against 6.6% baseline" → from `LIFT` and
  `BASELINE_CHURN`. Labels quote `RULES`.
- Labels and notes become `L(...)`.
Check: for every specialist scope, no rate KPI has n < 10 with a value; the Overview note and the
team screen show the same conversion figure.

**T1.7 `bundle.py`: new web files.**
- `out/queue/<owner>.json` from `dayplan.build()`; `out/search.json`: one row per doctor
  `{id, name, specialty, city, owner, status, play, mode, risk, flags}` (~5,571 rows; keep under
  1 MB, short keys allowed if documented in `types.ts`).
- Dossiers: add `contacts_all` (every interaction, newest first; keep `contacts` = first 6 for the
  panel), `campaigns` (`campaign_id`, the name joined from the `campaigns` sheet, enrolled_at,
  engaged, converted; `converted` is null for ~95% of enrollments, so show "sin resultado
  registrado", never "no"), `escalations`
  (`escalated_at`, `minutes_to_pickup`, `converted`, handler), `followup`, `flags`,
  `risk_reasons_i18n`, `copilot.i18n`, `bookings_last`, `bookings_prev`.
- `write_web_view()` copies `queue/` and `search.json` into `web/public/` like the dossiers, and
  `web/scripts/sync-data.mjs` does the same.
- `meta` gains `queue_capacity`, `asof`, `plays` (ordered keys with `L` labels, so the UI can show
  "priority order comes from PLAYS").
Check: `python3 src/bundle.py` prints queue sizes per owner; total size of `web/public` data < 20 MB;
`pnpm build` still passes.

**⏸ Miguel:** send him the per-specialist queue sizes (call / followup / message / handoff / later)
and five sample "reason" lines in Spanish. He confirms capacity 20, follow-up quota 8 and the stale
window 14 before Phase 2.

### Phase 2 · Shell, design system, language, identity (1 day)

**T2.1 Tokens.** Follow the references: light surface page, white cards. Change in `globals.css`:
`--background: #f5f2ef` (page), `--card: #ffffff`, `--popover: #ffffff`, `--border: #e9e3dc`,
card shadow `0 1px 2px rgb(42 38 35 / .04), 0 1px 12px rgb(42 38 35 / .04)`, `--radius: 0.875rem`
(cards ~14–16 px). Keep brand primary/ink and the validated chart colours (`#00806a`, `#b7791f`,
dark `#31a88e`, `#c1862b`). Add tint tokens for icon chips: `--chip-green`, `--chip-amber`,
`--chip-red`, `--chip-blue`, `--chip-violet` (10–12% alpha of their hue, text in the full hue,
contrast ≥ 4.5:1 checked). Dark theme stays derived; re-check contrast.

**T2.2 App shell** (`web/app/(shell)/layout.tsx`, `components/shell/*`), after VeraIQ:
- **Sidebar** 248 px, white, full height, collapsible to icons < 1024 px, sheet on mobile.
  Top: product name "CS Control Room" + a context switcher styled like "All Workspaces"
  (for a specialist: their book; for a manager: whole portfolio / team / specialist).
  Nav with lucide icons, specialist order: **Hoy** (`CalendarCheck`), **Doctores** (`Users`),
  **Señales** (`Radar`), then a divider and manager items **Resumen** (`LayoutDashboard`),
  **Mi equipo** (`UsersRound`), **Pulse** (`Activity`), **Control** (`ChartSpline`),
  **Costo IA** (`Coins`). A manager sees their items first. Old paths (`/team`, `/cost`, `/`
  as overview) redirect to the new ones so existing links keep working. Selected item = white pill with border
  (as in the reference), not a filled green block.
  Bottom block: an **assistant card** (Nexchat's "Quick Onboarding" card, in brand green gradient):
  icon, "Pregúntale a tu cartera", one line, button "Preguntar" (opens the Ask drawer, ⌘J). Under
  it: AI status dot ("IA activa · Haiku/Sonnet" or "IA apagada"), language toggle ES/EN, theme
  toggle, and the **user card** (initials avatar, name, role, chevron → switch identity).
- **Top bar** per page: greeting title ("Buenos días, Rafael" / "Good morning, Rafael") and a
  subtitle that states what the system did ("La IA revisó tus 379 doctores y armó tu día: 20
  acciones"). Right side: search field "Buscar doctores, plays…" with `⌘K` hint (opens the command
  palette), a clock chip "Datos al 25 sep" (§T2.5), bell with the number of follow-ups due.
- Section headers like "Customer Success Overview" / "Actionable Insights": 15–16 px semibold,
  with small square icon buttons on the right (download, filter).

**T2.3 i18n.** `web/lib/i18n/{es,en}.ts` (flat keys, typed from `es.ts`), `I18nProvider` with
`useT()` and `tx(value)` (string or `{en, es}`), locale in `localStorage` (`cs:locale`, default
`es`), `<html lang>` updated. Number/date formatting via `Intl` with `es-MX` / `en-US`. No i18n
library. Every visible string in `web/` goes through `t()` or `tx()`; add a unit check
(`web/scripts/check-i18n.mjs`) that fails when a key exists in one dictionary and not the other.

**T2.4 Identity.** First visit: a dialog "¿Quién eres?" listing the 14 farming specialists (name,
team), the 3 team managers ("Manager · Norte" etc.) and "Dirección CS". Stored in `localStorage`
(`cs:who`). `/` redirects: specialist → `/hoy`, manager/director → `/resumen`. The user card
switches identity. This replaces the "View as" switch; keep role as derived state.

**T2.5 Clock.** `web/lib/clock.ts`: `appToday()`. `CS_CLOCK=snapshot` (default) → the bundle's
`asof`, plus a demo control in the clock chip menu: "Avanzar un día" / "Volver al 25 sep",
stored in `localStorage` (`cs:dayOffset`). `CS_CLOCK=real` → today's date. Everything
date-relative in the UI (lead time left, due today/overdue, "hace N días") uses `appToday()`:
`days_left_now = days_of_lead_left − dayOffset`. This is display arithmetic on bundle values, not
a metric.

**T2.6 Command palette (⌘K).** `cmdk` over `/search.json` (lazy-loaded on first open): doctors
by name, id, specialty, city → opens the doctor sheet; screens; actions ("Empezar mi día",
"Pregúntale a la IA", "Cambiar idioma").

**T2.7 Doctor sheet is addressable.** The doctor panel opens from `?doctor=D03810` on any screen,
so back/forward and links work, and every list uses the same sheet.

**⏸ Miguel:** screenshots of the empty shell (1440 light, 1440 dark, 390 mobile) next to the two
references. He approves the look before Phase 3.

### Phase 3 · "Hoy": the specialist's day (1.5–2 days)

**T3.1 `/hoy` layout** (top to bottom, all in the new card style):
1. **Briefing card** (2/3 width; brand-green gradient like Nexchat's chart card; white text):
   "Tu día" + the AI briefing (T4.4) or its deterministic fallback, with a small source badge
   ("IA · Haiku" / "Resumen automático") and "Regenerar".
   **Progress card** (1/3): ring `hechos / plan de hoy`, "Siguiente: Dr. Gerardo Gamboa · llamada",
   primary button **Empezar** (opens focus mode on the first pending item).
2. **Four stat cards** (Nexchat style: icon chip, label, big number, small chip): Llamar hoy,
   Seguimientos que agendaste (due), Mensajes listos, Derivar a upsell. Clicking one scrolls to and
   filters its block. Deltas only where n ≥ 10; otherwise no chip.
3. **The queue**, as grouped lists in the VeraIQ "Accounts requiring attention" style: round icon
   chip per play (colour by mode: call = red tint, follow-up = blue, message = green, handoff =
   violet), doctor name, one-line reason, right-side pill (`5 días` of lead left, `vence hoy`,
   `vencido 3 d`, or risk `72%`). Row hover shows quick actions: **Abrir**, **Copiar borrador**
   (drafts only), **Resultado ▾**. Block headers show counts and "orden: PLAYS" for messages with
   chips per play (filter). `later` is collapsed at the bottom: "Más allá de tu capacidad de hoy
   (N)". Handoffs have a single bulk action "Marcar como derivados" with a confirmation.
4. **Right rail** (≥ 1280 px) or below: "Hecho hoy" (outcome log with undo) and "Vuelven mañana".

**T3.2 Focus mode ("Modo ráfaga").** A full-height sheet that walks the pending items in order:
left column = doctor facts, why now, last 3 contacts, the AI analysis summary if it exists;
right column = the action: editable draft (drafts), call brief + "Generar guion" (briefs), handoff
note (handoffs), with the AI writer controls (T4.3). Bottom bar = outcome buttons with keyboard
shortcuts, then auto-advance: `E` Enviado, `S` Sin respuesta, `A` Acordamos… (date: +2 días hábiles,
+1 semana, elegir fecha; optional note), `N` No aplica (reason: ya resuelto / no es mi cuenta /
cambió de situación / otro), `→` saltar, `Esc` salir. Counter "3 de 20". Copying the draft marks
`draft_copied` in the event; editing marks `draft_edited`.

**T3.3 Outcomes and follow-ups (`/api/work`).**
- `POST /api/work` body (zod-validated):
  `{doctor_id, owner, actor, outcome: "sent"|"no_answer"|"agreed"|"not_applicable"|"routed"|"skipped"|"undo", next_due?: "YYYY-MM-DD", reason?: string, note?: string, play?: string, draft_copied?: boolean, draft_edited?: boolean, ai_used?: string[], app_day: "YYYY-MM-DD"}`.
  Appends one JSON line to `out/work_log.jsonl` with a server timestamp and an id. Never rewrites
  the file. `undo` references the id it reverts.
- `GET /api/work?owner=S01` returns the folded state per doctor (latest non-undone event) and the
  log for today.
- Rescheduling: `no_answer` → `next_due = appToday + 2 business days`; `agreed` → chosen date;
  `sent` → `appToday + 5 business days` (check whether they replied); `not_applicable`/`routed` →
  no return. A doctor with `next_due` returns to the `followup` block on that date **ahead of** the
  bundle's follow-ups (they count toward the quota). Folding happens in `web/lib/work.ts`
  (filtering and ordering, not metrics). The plan itself is recomputed only by a build; between
  builds the app removes handled items, brings back returning follow-ups and lets the specialist
  keep working into `later` once today's plan is done ("Seguir con lo de mañana").
- If the API is unavailable (static deploy), fall back to `localStorage` and show a small banner
  "Guardado solo en este navegador".
- `src/state.py` gains `read_work_log()` so Streamlit and `report.py` can read the same outcomes.
Check (Playwright): mark 3 outcomes, reload → still there; "Avanzar un día" ×2 → the `no_answer`
doctor is back in "Seguimientos"; undo restores the previous state.

**T3.4 Doctor sheet v2.** Tabs: **Resumen** (why now, key facts cards, bookings dots vs peer, the
follow-up the specialist scheduled), **Acción** (draft/brief/handoff + AI writer), **Análisis IA**
(T4.2), **Historial** (single timeline merging contacts_all, campaigns, escalations, onboarding
close, calendar enabled; newest first; filter by type). Header: name, specialty · city · id ·
owner, status and risk pills, outcome buttons.

**T3.5 G2 measurement.** Playwright test: fresh context → pick "Rafael Sandoval" → `/hoy` →
click **Empezar** → assert a brief or a draft textarea is visible (≤ 3 clicks); then click the
"Mensajes listos" stat card → first message row → assert an editable draft (≤ 4 clicks total).
Record clicks and elapsed ms; fail over the limits or over 30 s. Put the numbers in `HANDOFF.md`.

### Phase 4 · Generative AI in the web tool (2 days)

The rule from the plan holds: **the model names, groups, explains and writes; code counts,
measures and decides.** Every AI surface shows its source badge, has a "Regenerar" and a
"Ver contexto" (the exact JSON sent, for trust and for the interview), and degrades to a
deterministic output with no key.

**T4.1 Gateway (`web/lib/ai/gateway.ts`, server-only).**
- `run(task, input, {locale, stream})` → resolves settings, builds context (`context.ts`), picks the
  prompt (`prompts.ts`, each with a `version`), calls Anthropic via `@anthropic-ai/sdk`, validates
  (`guard.ts`), logs, returns `{text | json, source, model, cost, tokens, flags, context_hash}`.
- **Never throws.** No key, `CS_AI_DISABLED=1`, `settings.ai_runtime_enabled === false`, budget
  reached, network error, bad JSON → `fallback.ts` output with `source: "fallback:<reason>"`.
- **Ledger:** one line per call in `out/llm_ledger_web.jsonl`
  `{ts, task, model, tokens_in, tokens_out, cache_read, cost, ok, source, owner, doctor, prompt_version}`.
  `src/llm.py` `month_spend()` and `summary()` also read this file so the budget is shared.
- **Settings:** read `out/settings.json` (shared with `llm.py`). Add `ai_runtime_enabled` (default
  `true` when a key exists) separate from the existing `ai_enabled` (build-time enrichment, default
  `false`). `POST /api/ai/settings` toggles `ai_runtime_enabled` and sets `monthly_budget_usd`
  (local only).
- **Models:** `CS_AI_MODEL_FAST` (default `claude-haiku-4-5-20251001`) for message, explain,
  briefing; `CS_AI_MODEL_DEEP` (default `claude-sonnet-5-5`) for doctor analysis and ask. Prices
  from a shared table mirrored from `llm.PRICES` (write it into `overview.json` `cost.prices`, read
  it on the server; do not duplicate by hand).
- **Caching:** response cache in `out/ai_cache/<task>/<hash>.json`, key = task + ids + locale +
  bundle sha + prompt version; "Regenerar" bypasses it. Use prompt caching (`cache_control:
  ephemeral`) on the system prompt and the context block for `ask`.
- **Mock:** `CS_AI_MOCK=1` returns canned outputs per task (including one with an invented number)
  so tests and a no-key demo can exercise the AI UI.
- Streaming for `message`, `explain`, `briefing`, `ask`: `text/event-stream` with `delta` events and
  a final `meta` event (source, cost, flags). `doctor` returns JSON (tool use with an
  `input_schema`), shown with skeletons while it loads.
- Simple in-process rate limit (e.g. 20 calls/min per identity). Inputs validated with zod.
  The key never reaches the browser.

**T4.2 "Analizar doctor" (deep).** `POST /api/ai/doctor {doctor_id, locale}`.
Context: the full dossier (facts, `contacts_all`, bookings by month, campaigns, escalations,
follow-up, risk reasons, play and copilot output), the peer median, the relevant `LIFT` rows.
Output schema:

```json
{
  "what_happened": ["…", "…"],            // 2–4 bullets, chronological, each with a date from the record
  "what_they_want": "…",
  "promises_open": [{"who": "doctor|specialist", "what": "…", "since": "YYYY-MM-DD"}],
  "likely_cause": "…",                     // a hypothesis, labelled as such
  "next_step": "…",                        // consistent with the play unless the evidence contradicts it; if so, say why
  "questions_for_call": ["…", "…", "…"],
  "evidence": [{"claim_index": 0, "source": "contact|booking|campaign|escalation", "date": "YYYY-MM-DD"}]
}
```

Guard: every date in `evidence` must exist in the context; every number must exist in the context
(see T4.6); otherwise flag. Fallback: a deterministic version assembled from the same fields
(timeline of the last 5 events, open items from `open_ask`/follow-up, the play's `ask` as next step,
no hypothesis). UI: the "Análisis IA" tab and a 3-line summary in focus mode.

**T4.3 Message writer (fast).** `POST /api/ai/message {doctor_id, kind, tone[], instruction?, base_text}`.
`kind`: `whatsapp` (≤ 70 words), `email` (JSON `{subject, body}`, ≤ 140 words, greeting and
signature with the specialist's name), `call_script` (for briefs: opening, 3 questions, the one
fix to offer, how to close with a date; not a message to send), `followup_email` (after a call,
uses the outcome note), `upsell_note` (internal note to the upsell team with the doctor's quote).
Tone chips: `más breve`, `más cálido`, `más formal`, `más directo`. Free instruction box
("menciona que lo llamo el viernes").
Rules in the prompt: Spanish, usted, Mexican register; start from `base_text` (the deterministic
draft), which carries the facts; add no facts, numbers, dates, prices or promises that are not in
the context; never promise more patients; keep the play's single ask.
Guard (numbers the specialist typed in `instruction` count as context): new numbers → reject and return `base_text` with a flag "La IA agregó un dato que no está en
el expediente; se muestra el borrador original"; banned phrases (`garantizo`, `le aseguro`,
`sin costo`, `gratis`, `más pacientes seguro`) → flag. UI: in the Action tab and focus mode, channel
toggle WhatsApp | Email | Guion, tone chips, instruction input, "Reescribir con IA", a diff view
against the base draft, "Usar esta versión" / "Volver al original". Fallback with no key: WhatsApp
= the draft; email = deterministic subject ("Seguimiento de su cuenta en Doctoralia") + the draft
as body + signature; call script = the brief.

**T4.4 Daily briefing (fast).** `POST /api/ai/briefing {who, scope, app_day, locale}`.
Context: the owner's queue counts and top 5 items with reasons, the scope's KPI block (30 days,
with `n` and suppression), follow-ups due, outcomes logged yesterday (from the work log), the
lead-time table. Output: 3–5 short lines: what changed, who first and why, one thing to watch.
Cached per owner per app day. Fallback: a template over the same numbers ("Hoy: 3 llamadas, 12
seguimientos, 20 mensajes. Empieza por Dr. X: dijo que cancelaría hace 13 días.").
Manager variant (`scope` = team or all): "Qué pasó esta semana", built on the KPI deltas **and the
SPC verdicts** from the bundle: the model may only call a movement "real" if `spc` flags it;
otherwise "dentro de la variación normal". Shown on `/resumen`.

**T4.5 "Explícame" (fast).** An `Explicar` icon button on every KPI card, every control chart,
every team row and every attention signal. `POST /api/ai/explain {kind, key, scope, period, locale}`.
Context: that block only (value, prev, delta, n, rule in force, SPC limits/signals, lift). Output:
≤ 3 sentences: what it measures, whether the change is real or noise and why (n, limits), what to
do. Fallback: the block's note + n + the SPC verdict sentence. Opens in a popover, streamed.

**T4.6 Guard (`web/lib/ai/guard.ts`).**
- Extract numbers from the output (integers, decimals, percentages, with `.`/`,` separators).
- Build the allowed set from the context: every number, plus derived renderings (0.358 → 36%,
  35.8%; 12.0 → 12; dates' day numbers; counts in the prompt such as "3 bullets" are excluded from
  output checking).
- Anything outside the set → `flags.unverified_numbers`; the UI highlights them with a dotted
  underline and a tooltip "No está en los datos". For `message`, the output is rejected (T4.3).
- Unit tests (`web/lib/ai/guard.test.ts`, run with `node --test` or vitest) with Spanish examples.

**T4.7 Ask drawer (deep, with tools).** `⌘J` or the sidebar card opens a right drawer on any screen.
`POST /api/ai/ask {screen, scope, messages[], locale}`. The model gets a short system prompt, the
screen's context (e.g. the queue on `/hoy`, the team table on `/equipo`, the charts on `/control`)
and tools, executed by server code over the bundle files:
- `search_doctors({owner?, flags?, play?, specialty?, city?, risk_min?, limit≤50})` → `{count, rows}`
- `get_doctor({doctor_id})` → dossier summary
- `get_kpis({scope, period})` → the KPI block
- `get_queue({owner})` → queue counts and top items
Any count in an answer must come from a tool result or the context (guarded). Answers may end
with **actions** the UI renders as buttons: `{type: "open_list", filters}` → `/doctores?…`,
`{type: "open_doctor", doctor_id}`, `{type: "start_focus", block}`. Max 4 tool rounds. Suggested
prompts per screen (ES/EN), e.g. on Hoy: "¿Por quién empiezo y por qué?", "¿Quiénes de mis
doctores con agenda vacía tienen más visitas que citas?" (answer: the data does not have visits;
say so), "Resume lo que pasó con el Dr. Gamboa". Fallback with no key: the drawer shows the
suggested filters as buttons and says the assistant is off.

**T4.8 Cost screen, live.** `/costo` adds a live panel from `GET /api/ai/status`:
enabled/reason, models in use, spend last 30 days vs budget (bar), calls and fallbacks by task and
by specialist, cache hit rate, the kill switch toggle, the budget input. Keep the existing
estimate cards, recomputed for v2 usage with the assumptions shown on screen:

| Task | Model | Assumed use per specialist/day | Tokens in / out per call |
|---|---|---|---|
| Message rewrite | fast | 10 | ~1,200 / ~200 |
| Briefing | fast | 1 (cached) | ~3,000 / ~300 |
| Explain | fast | 3 | ~1,500 / ~150 |
| Doctor analysis | deep | 5 | ~4,000 / ~700 |
| Ask | deep | 3 (context cached) | ~8,000 / ~500 |

At the prices above that is roughly $3–4 per specialist per month and ~$50 for 14 specialists,
before prompt-cache savings. Compute the real figure in code from this table and `PRICES`, show it
on the screen, and update the "$0.10 per specialist" line in `README.md`. Recommend a budget of
$75/month for the whole team; the default in `settings.json` stays $25 for the demo.

**⏸ Miguel:** before the first real API call, show him the settings (models, budget) and ask for
the key in `web/.env.local`. Everything before this point runs with `CS_AI_MOCK=1`.

### Phase 5 · Manager screens, lists that match their counts, the rest in two languages (1–1.5 days)

**T5.1 `/doctores`.** The list behind every count: the whole book in scope, from `/search.json`,
with filters in the URL (`flag`, `play`, `owner`, `team`, `risk_band`, `specialty`, `city`, `q`,
`status`, default `status=active`).
Columns: doctor, specialty · city, owner (manager view), play, risk, last contact, follow-up.
Row → doctor sheet. Bulk: export CSV of the filtered view (client-side, rows only).

**T5.2 Every count links (G4).** My team: `at_risk`, `may_cancel`, `hollow`, `not_found`,
`open_commitments` → `/doctores?owner=S01&flag=…`. Overview KPI cards with counts do the same.
Attention signals → `/doctores?flag=…`. A Playwright test clicks each count for two specialists
and asserts row count == the number clicked.

**T5.3 `/resumen` (manager overview)** in the new style: KPI cards (Nexchat stat style, with the
suppression rule), the "Qué pasó esta semana" briefing (T4.4), risk segments as the VeraIQ
"Customer Segments" bar + legend, attention signals as the "Accounts Requiring Attention" list
(label, active count, lift pill), the onboarding chart with the smooth area style and a dark
rounded tooltip, the watchlist context. Remove the specialist toggle from here.

**T5.4 My team + follow-through.** Restyle as the VeraIQ "Customer Success Team" list (avatar
initials, name, team, right-aligned book size) with the existing columns. Add, from the work log:
outcomes logged today and this week per specialist, follow-ups overdue, share of drafts sent
unedited vs edited (the first feedback loop for `PLAYS`). Counts only below n=10.

**T5.5 Pulse, Control, Señales, Costo** restyled with the new cards; titles state the finding; each
chart gets `Explicar` (T4.5). Control keeps amber-only signals and the frozen baseline.

**T5.6 Remaining Python text to `L(...)`**: SPC titles and verdicts, pulse notes and events, team
notes, ceiling note, cost notes, day-14 text. Run `web/scripts/check-i18n.mjs` and a grep for English
strings in the ES render (Playwright: switch to ES, collect visible text, fail on a list of known
English words such as "Doctors", "Escalation", "Overview").

### Phase 6 · Verification, rehearsal, docs (1 day)

**T6.1 Checks.** `pytest tests/`, `python3 src/analysis.py`, Streamlit AppTest (12 screens, both
roles, 0 exceptions), `pnpm typecheck`, `pnpm build`, `pnpm exec playwright test` (all flows, both
languages, 1440 light and 390 dark, `CS_AI_MOCK=1` and no key). Record timings for G2.

**T6.2 Rehearsal script** (write it into `HANDOFF.md`, run it end to end twice):
1. Fresh browser → pick Rafael Sandoval → `/hoy` shows the briefing and 20 actions.
2. **Empezar** → first item is a call brief (may cancel) → "Generar guion" → outcome
   "Acordamos… viernes".
3. Next item: a hollow-calendar draft → "Email · más formal" → diff → copy → `E`.
4. Open a doctor → "Análisis IA" → "Ver contexto" to show what the model saw.
5. Live change 1: move `visibility` above `hollow_calendar` in `PLAYS` → `python3 src/bundle.py` →
   the Mensajes block reorders on the open page.
6. Live change 2: `calendar_healthy_slots` 6 → 8 → counts and the queue move.
7. Kill switch off → same screens, "IA apagada", deterministic drafts, nothing breaks.
8. "Avanzar un día" → the doctor marked "Sin respuesta" is back under Seguimientos.
9. Switch to Manager Norte → `/resumen` → "Qué pasó esta semana" → `Explicar` on Grade-D →
   "real or noise" answered from the control chart → click a count → the list matches it.
10. Toggle EN → the same screen in English, drafts still in Spanish.

**T6.3 Docs.** Update `README.md` (what the copilot produces now, where the model runs, cost per
specialist), `BUILD.md` (commands, env vars), `HANDOFF.md` (what changed, gates met with evidence,
what was not verified), `artifacts/ai-log.md` (which AI tools wrote what, what was corrected).
Streamlit: fix the hard-coded "30 minutes" copy (`src/app.py` ~252–258, 336) to read `RULES`.

---

## 5. Contracts

### 5.1 `web/public/queue/<owner>.json`

```ts
export interface QueueFile {
  owner: string
  asof: string                      // YYYY-MM-DD, the bundle's extract date
  capacity: number                  // RULES.daily_capacity
  followup_quota: number            // RULES.daily_followup_quota
  counts: Record<Block, number>     // before capacity is applied
  items: QueueItem[]                // ordered: call, followup, message, handoff, later
}
export type Block = "call" | "followup" | "message" | "handoff" | "later"
export interface QueueItem {
  doctor_id: string
  doctor_name: string
  specialty: string
  city: string
  block: Block
  rank: number                      // 1..n within the owner's day
  play: string | null
  mode: "draft" | "brief" | "handoff" | null
  reason: I18n                      // one line, "why today"
  risk_score: number
  due_at?: string                   // follow-ups
  signal_at?: string                // calls
  lead_median?: number
  days_of_lead_left?: number        // at asof; the UI subtracts dayOffset
  confident: boolean
  later_reason?: I18n               // why it is not in today's plan
}
export type I18n = { en: string; es: string }
```

### 5.2 `web/public/search.json`

```ts
export interface SearchRow {
  id: string; name: string; specialty: string; city: string
  owner: string; status: "active" | "churned"
  play: string | null; mode: string | null; risk: number
  flags: Flag[]
}
export type Flag = "at_risk" | "may_cancel" | "discouraged" | "hollow" | "not_found"
  | "commitment" | "followup_due" | "calendar_off" | "grade_d" | "upsell"
```

### 5.3 Dossier additions (`web/public/doctors/<owner>.json`)

```ts
interface DossierV2 extends Dossier {
  contacts_all: Contact[]
  campaigns: { campaign_id: string; name: string; enrolled_at: string; engaged: boolean; converted: boolean | null }[]
  escalations: { escalated_at: string; minutes_to_pickup: number; converted: boolean; handler: string }[]
  followup: { due_at: string; kind: string; note: string; set_at: string; set_by: string } | null
  flags: Flag[]
  bookings_last: number | null
  bookings_prev: number | null
  risk_reasons_i18n: { key: string; text: I18n }[]
  copilot: Dossier["copilot"] & {
    i18n: { why: I18n | null; ask: I18n | null; instead: I18n | null; channel: I18n | null; gaps: I18n[] }
  }
}
```

### 5.4 KPI item addition

```ts
interface KpiItemV2 extends KpiItem {
  label: string | I18n
  note: string | I18n
  n: number | null
  suppressed?: I18n                 // present when value/delta are withheld (n < RULES.min_n_rate)
}
```

### 5.5 Work event (`out/work_log.jsonl`, one per line)

```json
{"id":"w_01J…","ts":"2026-09-30T15:04:05Z","app_day":"2026-09-25","actor":"S01","owner":"S01",
 "doctor_id":"D03810","outcome":"agreed","next_due":"2026-10-02","reason":null,"note":"Llamada el viernes",
 "play":"churn_threat","draft_copied":false,"draft_edited":false,"ai_used":["call_script"],"undo_of":null}
```

### 5.6 AI routes

| Route | Body | Returns | Model |
|---|---|---|---|
| `POST /api/ai/doctor` | `{doctor_id, locale, refresh?}` | JSON (T4.2) + meta | deep |
| `POST /api/ai/message` | `{doctor_id, kind, tone[], instruction?, base_text, locale}` | SSE; `email` ends with `{subject, body}` | fast |
| `POST /api/ai/briefing` | `{who, scope, app_day, locale, refresh?}` | SSE | fast |
| `POST /api/ai/explain` | `{kind: "kpi"|"spc"|"team_row"|"signal", key, scope, period, locale}` | SSE | fast |
| `POST /api/ai/ask` | `{screen, scope, messages[], locale}` | SSE with `delta`, `tool`, `action`, `meta` events | deep |
| `GET /api/ai/status` | – | `{enabled, reason, models, spend_30d, budget, calls, fallbacks, by_task, by_owner, cache_hit}` | – |
| `POST /api/ai/settings` | `{ai_runtime_enabled?, monthly_budget_usd?}` | settings | – |

Every response's `meta`: `{source: "llm"|"cache"|"mock"|"fallback:<reason>", model, cost_usd,
tokens_in, tokens_out, prompt_version, flags: {unverified_numbers: string[], banned_phrases: string[], rejected: boolean}}`.

---

## 6. Design references

Save the two images Miguel supplied as `docs/design-refs/veraiq-cs-copilot.png` (AI Customer
Success Copilot dashboard, by Wingly Agency) and `docs/design-refs/nexchat-overview.png` (Nexchat AI
agent dashboard). They are references for **layout and component style only**. Colours stay
Doctoralia's; no brand names, logos, people or copy from them.

What to take:

| From | Take | Where |
|---|---|---|
| VeraIQ | Left sidebar with icon + label items, workspace switcher at the top, settings/help/user card at the bottom | App shell |
| VeraIQ | "Welcome back, Carlos" + one line saying what the AI did | Top bar of every screen |
| VeraIQ | Search field with `⌘K` hint and a scope dropdown on the right of the top bar | Top bar |
| VeraIQ | "Accounts Requiring Attention": round tinted icon, title, grey subtitle, right pill with a percentage | Queue rows, attention signals |
| VeraIQ | "Customer Success Team": avatar, name, role, right-aligned count | My team |
| VeraIQ | "Customer Segments": one segmented bar + legend rows with percentages | Risk bands |
| VeraIQ | Smooth area line with a light gradient fill and a dark rounded tooltip | Trend charts |
| Nexchat | A hero card with a colour gradient holding the main chart or message | Briefing card on Hoy, "Qué pasó" on Resumen |
| Nexchat | Four stat cards: icon chip, label, big number, small delta chip ("▲ +12%", "Steady") | Stat rows |
| Nexchat | Bottom-of-sidebar promo card with an illustration and a button | "Pregúntale a tu cartera" assistant card |

Shared traits: page background slightly darker than cards; white cards with 1 px border and a very
soft shadow; 14–16 px radius; 24 px card padding; 12–16 px gaps; section titles 15–16 px semibold;
big numbers 28–32 px; generous white space; icons from lucide at 16–18 px.

## 7. Copy (ES / EN), the minimum set

| Key | ES | EN |
|---|---|---|
| nav.today | Hoy | Today |
| nav.doctors | Doctores | Doctors |
| nav.signals | Señales | Signals |
| nav.summary | Resumen | Summary |
| nav.team | Mi equipo | My team |
| nav.cost | Costo IA | AI cost |
| greet.morning | Buenos días, {name} | Good morning, {name} |
| today.subtitle | La IA revisó tus {n} doctores y armó tu día: {k} acciones | AI reviewed your {n} doctors and planned your day: {k} actions |
| today.start | Empezar | Start |
| block.call | Llamar hoy | Call today |
| block.followup | Seguimientos que agendaste | Follow-ups you scheduled |
| block.message | Mensajes listos | Messages ready |
| block.handoff | Derivar a upsell | Route to upsell |
| block.later | Más allá de tu capacidad de hoy | Beyond today's capacity |
| outcome.sent | Enviado | Sent |
| outcome.no_answer | Sin respuesta | No answer |
| outcome.agreed | Acordamos… | Agreed… |
| outcome.na | No aplica | Not applicable |
| ai.analyze | Analizar con IA | Analyze with AI |
| ai.rewrite | Reescribir con IA | Rewrite with AI |
| ai.explain | Explícame | Explain |
| ai.ask | Pregúntale a tu cartera | Ask your book |
| ai.off | IA apagada: se muestra la versión automática | AI off: showing the automatic version |
| ai.unverified | No está en los datos | Not in the data |
| ai.context | Ver contexto | Show context |
| clock.snapshot | Datos al {date} | Data as of {date} |
| clock.next | Avanzar un día | Next day |
| rate.suppressed | Solo {n} casos: muy pocos para un porcentaje | Only {n} cases: too few for a rate |

## 8. Prompts (put them in `web/lib/ai/prompts.ts`, versioned)

System prompt shared by every task (ES version; EN mirrors it):

> Eres el asistente de un especialista de Customer Success de Doctoralia México. Trabajas solo con
> el CONTEXTO que te doy, en JSON. Reglas: 1) No inventes datos: cada número, fecha, nombre o
> hecho que escribas debe estar en el contexto. Si algo no está, di que no está. 2) No calcules
> métricas nuevas; si hace falta un número que no está, dilo y sugiere dónde verlo. 3) Una
> hipótesis se escribe como hipótesis ("podría ser…"). 4) No prometas resultados al doctor.
> 5) Responde en {locale}. Los mensajes para doctores van siempre en español de México, de usted.
> 6) Sé breve y concreto; el especialista tiene 20 acciones hoy.

Task prompts add: the output format (JSON schema or length), the play's single ask (messages), and
for the manager briefing: "Solo llama 'real' a un movimiento si `spc.signals` lo marca; si no, es
variación normal."

Context is always JSON, built by `context.ts`, minimal (only fields the task needs), with a
`rules` block and a `definitions` block (what risk, lead time and grade mean) so the model
explains with the operation's own definitions.

## 9. Risks and what to do about them

| Risk | Mitigation |
|---|---|
| The model states a number that is not in the record | Guard (T4.6); messages are rejected, other outputs are flagged in the UI; "Ver contexto" |
| Cost runs away in the demo or in real use | Ledger per call, shared budget with `llm.py`, response cache, prompt caching, kill switch; Cost screen shows it live |
| No key or no network in the interview | Everything has a fallback; `CS_AI_MOCK=1` shows the AI UI with canned outputs; rehearse step 7 |
| The queue is too long and becomes a guilt list | Capacity from `RULES`, `later` collapsed and labelled, calls never cut |
| Follow-up parsing misses phrasings in real notes | Rules in `notes.py` with a coverage print; the Ask drawer can surface untagged notes |
| Two clocks (data snapshot vs real day) confuse | One `appToday()`; snapshot mode is explicit on screen ("Datos al 25 sep"); "Avanzar un día" is a demo control |
| i18n drift | `check-i18n.mjs` + the Playwright English-word scan in ES |
| Work log on a static deploy | Fallback to `localStorage` with a banner; the demo runs locally |
| Haiku 4.5 retired after 2026-10-15 | Models are env vars; the fast default can move to `claude-sonnet-5-5` with one line |

## 10. Order if time is short

Each line is shippable on its own: Phase 0 → T1.3 + T1.5 + T1.7 (the day exists) → T2.2 + T2.4
(the specialist lands on it) → T3.1 + T3.2 + T3.3 (focus mode with outcomes) → T4.1 + T4.3 + T4.2
(message writer and doctor analysis) → T4.4 → T5.2 → the rest. If only one day is left, do the
first four and T4.3 with the mock, and keep the old screens as they are.
