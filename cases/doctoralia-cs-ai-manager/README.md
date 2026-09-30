# Doctoralia CS — AI & Transformation Manager business case

Two working things on one data layer.

```
data/dataset.xlsx        the workbook, untouched
src/pipeline.py          THE SHARED LAYER — reads the workbook, writes out/
src/notes.py             turns 29,846 free-text notes into typed signals (rules, no model)
src/charts.py            inline SVG bars, validated colors, no libraries
src/draft.py             play selection, confidence model, draft composition
src/copilot.py           Deliverable 1 — specialist copilot (Streamlit)
src/report.py            Deliverable 2 — manager report (static HTML)
src/analysis.py          every number in FINDINGS.md, recomputed
out/                     generated — feature tables, reports, data_quality.json
FINDINGS.md              what the data says
```

## Run it

```bash
pip install pandas openpyxl pyarrow streamlit
python3 src/pipeline.py          # build the feature tables + data quality report
python3 src/report.py            # writes out/report_T1.html … T3
streamlit run src/copilot.py     # the copilot
python3 src/analysis.py          # verify every claim in FINDINGS.md
```

The model is optional. Set `ANTHROPIC_API_KEY` to enable tone polishing in the copilot;
without it everything still runs, because nothing depends on the model for a fact.

## How the two share a data layer

`pipeline.py` is the only code that opens the workbook. It writes three feature tables:

| Table | Grain | Used by |
|---|---|---|
| `doctor_features` | one doctor | copilot queue, report sections 4-5 |
| `escalation_features` | one escalation | report sections 1–3, copilot header |
| `specialist_features` | one specialist | both |

The copilot and the report never recompute anything. If the report says a specialist has 55
hollow calendars, the copilot's queue for that specialist contains those same 55 doctors —
not because the two agree, but because there is only one place the number can come from.
Every threshold is in one dict, `pipeline.py → RULES`; every play is in one list,
`draft.py → PLAYS`, in priority order. Changing what the whole operation works on first is
a line move in that list.

## What the copilot can produce

Three outputs, and two of them are refusals to write a message:

| Mode | When | What comes out |
|---|---|---|
| `draft` | Normal case, evidence complete | A message in Spanish the specialist can send as is |
| `brief` | The doctor has said they may cancel | **Not a message.** A call brief with their numbers, their own words and the date they said them. A templated WhatsApp to a doctor threatening to leave reads as exactly what it is |
| `handoff` | The doctor asked about another product | Routed to the upsell team with the doctor's own quote attached. Farming should not pitch it |

Plus a channel note where the specialists have already recorded how to reach someone —
WhatsApp only, the assistant runs the agenda, four attempts already logged.

## Where the model is allowed to be wrong

It is not allowed to supply a fact. Drafts are composed from the doctor's own record by
template. The model is given the finished draft and asked to rewrite it for tone, with a
hard instruction to add nothing — and the output is discarded automatically if it contains
a number that was not in the input. So the failure mode is "the message reads a bit stiff",
never "the message told a doctor something untrue about their account".

## What it does when it is not confident

Confidence here is **evidence completeness**, not model certainty — a score built from what
is present in the record, not from a softmax. Below 0.55 the copilot refuses to draft. It
names what is missing in specific terms ("no complete booking month yet — any trend claim
would be invented"), states the play it suspects, and tells the specialist what to confirm.

45% of a portfolio comes back as "nothing here is off — leave it alone and work the accounts
above it". That is a deliberate output, not a gap.

## Cost

About **$3.60 per specialist per month, ~$50 for 14 specialists**, for the daily tool as
designed: 10 message rewrites, 1 briefing and 3 "Explícame" on the fast model (Haiku), 5 doctor
analyses and 3 questions to the assistant on the deep model (Sonnet 5.5), 21 working days, before
prompt-cache savings. The figure is computed in `src/llm.py` (`usage_estimate`, from the usage
table and `PRICES`) and shown on `/costo`, next to the live spend from the ledger. Recommended
budget: **$75/month** for the whole team; the demo's `settings.json` default stays $25, and at
100% calls stop and every screen falls back to its deterministic version. Model cost is not the
constraint at this scale; specialist time is. The one-off enrichment assumptions are in
FINDINGS.md §6.

## What I did not build, and why

- **No churn model.** The rules rank churn from 2.2% to 21.7% across five buckets, every
  weight set from a measured lift a specialist can be shown. A GBM would rank slightly better
  and be unarguable — which is how an automation goes subtly wrong for six months.
- **No embeddings on the notes.** A rules classifier tags 95.5% of them and every tag points
  at the phrase that produced it. Embeddings would tag the rest and explain none of it.
- **No write-back.** The copilot drafts; it does not send. Sending needs an audit trail and a
  rollback path, and neither belongs in a first version.
- **No ticket data.** Tickets are not in the dataset. Half of farming is reactive, so the
  queue ranking is blind to whatever is already in someone's inbox.
- **No phone.** All the cost-to-serve arithmetic is missing the channel that probably costs
  the most.

**With two more weeks:** the campaign-4 definition-of-done fix and the 870-doctor backfill
list (that is the money), escalation routing with an alert at 20 minutes, and a weekly job
that recomputes the play list against outcomes so the priority order in `PLAYS` stops being
my opinion.

## AI tools used

Claude (Opus 5) in Cowork, working against the workbook directly. What it produced and what
I corrected is logged in `artifacts/ai-log.md`.
