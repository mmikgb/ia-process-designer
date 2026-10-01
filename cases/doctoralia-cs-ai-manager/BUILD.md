# CS Control Room — build notes

Phases 1–6 of `PLAN_CS_Control_Room.md` are built and running, and on top of them the daily
tool from `SPEC_Daily_Tool.md` (branch `feat/daily-tool`; build log in `HANDOFF.md` §11).

## Run it

```bash
cd "cases/doctoralia-cs-ai-manager"
source .venv/bin/activate
pip install -r requirements.txt
python3 src/bundle.py          # build the contract — ~12s
streamlit run src/app.py       # the app
```

### The web app (`web/`)

Next.js 16 + Tailwind v4 + Recharts, UI primitives on Base UI. It reads what `bundle.py` writes
(`out/overview.json`, `out/queue/`, `out/doctors/`, `out/search.json`); `pnpm dev` and
`pnpm build` copy them into `web/data` and `web/public` first, unless `out/` comes from an older
`bundle.py` (`meta.web_schema` lower than the committed data), in which case it keeps the
committed data and says how to rebuild. The browser only picks, filters, sorts and formats;
every number, rank and draft is computed in Python.

```bash
python3 src/pipeline.py && python3 src/bundle.py   # the data and the web files (~20 s)
cd web && pnpm install
pnpm dev                    # http://localhost:3000, reloads when bundle.py rewrites the files
pnpm build && pnpm start    # production
pnpm typecheck              # tsc
pnpm test                   # node --test: day-plan parity with Python, follow-through, guard, search decoding
pnpm e2e                    # Playwright, 1440 light + 390 dark, fresh outcome log in e2e/.out
CS_AI_MOCK=1 pnpm e2e       # the same with the mock model
```

`pnpm e2e` needs a Chromium; set `PW_CHROMIUM_PATH` to use an installed one.

| Screen | For | What it is |
|---|---|---|
| **Hoy** | specialist | The day: calls, follow-ups, drafts, handoffs (up to 20, editable per person), focus mode, outcomes, the morning briefing |
| **Doctores** | both | The list behind every count, filters in the URL, CSV export |
| **Señales** | both | The note themes ranked by measured churn lift |
| **Resumen** | manager | KPIs, the health score, attention signals, risk bands, onboardings, "Qué pasó esta semana" |
| **Mi equipo** | manager | Each specialist's book (every count a link), follow-through from the outcome log, escalation pickup |
| **Pulse** | manager | Day by day, with a range brush and events from `config/events.csv` |
| **Control** | manager | Real change or noise: four control charts, frozen baseline, the finding as the title |
| **Costo IA** | manager | Live spend, kill switch and budget; the daily-use estimate; the one-off enrichment |

Any doctor opens in a sheet addressed by the URL (`?doctor=D01184`). ⌘K searches, ⌘J asks.

Environment (`web/.env.local`, git-ignored; template in `web/.env.example`):

| Variable | Default | What it does |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Turns the AI layer on. Server only |
| `CS_AI_MODEL_FAST` / `CS_AI_MODEL_DEEP` | Haiku 4.5 / Sonnet 5.5 | The two tiers |
| `CS_AI_DISABLED` | — | `1` stops every call, whatever the settings say |
| `CS_AI_MOCK` | — | `1` canned answers per task (tests, a demo with no key) |
| `CS_CLOCK` | `snapshot` | `snapshot`: the data date plus "Avanzar un día"; `real`: today |
| `CS_OUT_DIR` | `../out` | Outcome log, AI ledger, settings, AI cache |

No API key needed. Everything works with AI off; that is the default.

## The modules

| File | Does | New? |
|---|---|---|
| `pipeline.py` | The only code that opens the workbook. Features, risk, data quality | existing |
| `notes.py` | 24 rules turn 29,846 free-text notes into typed signals, 95.5% tagged | existing |
| `draft.py` | 8 plays, 3 modes (draft / brief / handoff), evidence-completeness confidence | existing |
| `charts.py` | Inline SVG: bars, **control charts**, **sparklines**. Validated light/dark | extended |
| **`bundle.py`** | **THE CONTRACT.** Validates, hashes, builds, caches `app_data.json` | new |
| **`series.py`** | Daily + weekly rollups, only at grains the data supports | new |
| **`spc.py`** | p / c / XmR charts, frozen baseline, Western Electric 1–2–4, stability check | new |
| **`forecast.py`** | Lead times, tiered watchlist, day-14 checkpoint, volume forecast | new |
| **`insight.py`** | Qualitative analyser. Model names and groups; Python counts and measures | new |
| **`llm.py`** | The one wrapper. Ledger, budget cap, kill switch, never raises | new |
| **`state.py`** | done / snooze, survives a rebuild | new |
| **`app.py`** | Six screens | new |
| `analysis.py` | Recomputes every number in FINDINGS.md | existing |
| `report.py` | Static export for the Monday email | existing |

## What the build produces

```
built in 12.4s  sha=87d65045a1c70b18
  doctors 5571  escalations 475  specialists 18
  spc charts 4  watchlist 954  themes 24
  data-quality findings 7
  llm: AI features are switched off in settings   full enrichment would cost $1.754
```

## Things worth demoing deliberately

**Bad input.** `python3 src/bundle.py --validate /tmp/broken.xlsx` returns named errors —
*"Sheet `escalations` is missing the column `minutes_to_pickup`"*, *"Missing sheet `teams`"* —
not a stack trace. Same path runs behind the upload box.

**No key.** Unset `ANTHROPIC_API_KEY`, toggle AI off, reload. Every screen still renders.
The Polish button hides, the themes table is the rules version ranked by measured churn lift.

**Three of four processes were never stable.** The control screen says so on the chart rather
than pretending the limits are alarm thresholds:

| Chart | Baseline out of control | Verdict |
|---|---:|---|
| Grade-D rate, daily | 12.4% | not stable |
| Escalations/day | 10.5% | not stable |
| Median pickup, weekly | 0.0% | **stable** |
| Onboarding score, weekly | 18.8% | not stable |

**The watchlist is tiered, not a guilt list.** 954 doctors carry a live warning. That is
unusable, so: **act now 57** (churn-threat and discouraged, still inside their lead window —
about four per specialist), **watch 371**, **overdue 526** kept visible so nobody reads an
empty tab as good news.

**Day 14 has no live cohort in this extract.** Every one of the 5,526 onboardings closed before
25 Sep, so the worklist is structurally empty. The screen says that and shows the retrospective
instead: 3,104 failed the checkpoint and 25.0% of them closed at grade D, against 5.1% of those
that passed.

## The live-change rehearsal

| Ask | File | Line | Then |
|---|---|---|---|
| Different threshold | `pipeline.py` | `RULES` dict, top of file | `python3 src/bundle.py` |
| New play / reorder | `draft.py` | `PLAYS` list | Streamlit reloads itself |
| New note signal | `notes.py` | `RULES` list | `python3 src/bundle.py` |
| Control limits | `spc.py` | `BASELINE` tuple | `python3 src/bundle.py` |

`python3 scripts/rehearse_live.py` runs the two live changes of the rehearsal (a play order and a
threshold), measures the day before and after, and restores everything. For the demo itself,
make one of those edits by hand with `pnpm dev` running.

## Known gaps, stated rather than discovered

- **Bundle is 23 MB** — mostly the 29,846 interactions. Loads in about a second, cached.
- **No tickets, no phone.** Half of farming is reactive and the queue is blind to it.
- **No login.** Who you are is a picker (kept in the browser), and `/api/ai/settings` (kill
  switch, budget) has no auth: the web app is built for one machine or a trusted network.
- **The outcome log is one file** (`out/work_log.jsonl`, append-only). Fine for one server; a
  team on several machines needs it in a database. With no API (a static deploy) it falls back
  to the browser and says so.
- **Web files are ~25 MB** (`web/public`), mostly the per-specialist dossiers. Each screen loads
  only what it needs; `search.json` stays under 1 MB.
- **LLM enrichment not yet baked.** $1.754 one-off (Sonnet 5.5 themes + Haiku 4.5 summaries, batch), from the Settings screen. Until then the
  themes are the rules version, which is the deterministic path by design.
