# CS Control Room — build notes

Phases 1–6 of `PLAN_CS_Control_Room.md` are built and running. What is left is
Pulse (`series.py` exists, the screen does not) and polish.

## Run it

```bash
cd "cases/doctoralia-cs-ai-manager"
source .venv/bin/activate
pip install -r requirements.txt
python3 src/bundle.py          # build the contract — ~12s
streamlit run src/app.py       # the app
```

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

## Known gaps, stated rather than discovered

- **Pulse screen not built.** `series.py` produces the data; the brushable screen is not there.
- **Bundle is 23 MB** — mostly the 29,846 interactions. Loads in about a second, cached.
- **No tickets, no phone.** Half of farming is reactive and the queue is blind to it.
- **LLM enrichment not yet baked.** $1.75 one-off, from the Settings screen. Until then the
  themes are the rules version, which is the deterministic path by design.
