# What the data says

Three things in the pack cannot be explained the way they are presented. All three have
the same shape: a metric is measuring the proxy, not the outcome.

Everything below is reproducible — `python3 src/pipeline.py` then the notebook cells in
`src/analysis.py`. Row counts are absolute (the dataset is synthetic; the data pack is indexed).

---

## 1 · The onboarding grade is a calendar switch wearing a costume

**What the pack shows.** A-grades fell from 34% to 24% over six months while D nearly
doubled, 12% → 21%. Median close is day 28, the last day it can be.

**What is actually happening.**

| Onboarding closes with | n | Avg score | % A |
|---|---:|---:|---:|
| Calendar enabled | 4,197 | 74.7 | 34.9% |
| Calendar not enabled | 1,329 | 56.8 | 8.3% |

The grade is almost entirely a function of one setup step. And the share of doctors who
turn the calendar on moves month by month in exactly the pattern the grades follow:

| Signup month | Calendar on | Avg score | % A | % D |
|---|---:|---:|---:|---:|
| March | 78.8% | 75.3 | 34% | 12% |
| April | 77.3% | 70.2 | 27% | 16% |
| **May** | **73.5%** | **63.6** | **25%** | **23%** |
| June | 78.0% | 73.0 | 30% | 12% |
| July | 78.9% | 75.1 | 31% | 13% |
| **August** | **68.9%** | **65.9** | **24%** | **21%** |

All four onboarding specialists move together, month by month (S15–S18 spread is under 2
points in any month, and their annual averages are within 1.6 points of each other). This
is not a people problem. Something changed for the doctors arriving in May and August, or
in what was asked of them.

**The part that should worry you more.** 59% of onboardings (3,266 of 5,526) close on
**exactly** day 28 — the last possible day — and scores in that group are indistinguishable
from those closing early (70.5 vs 70.0). The window is closing onboardings; the work is not
finishing them. A hard deadline with no consequence for hitting it is a deadline that
manufactures completions.

**What I would check first.** Pull the 28-day closures and ask what percentage had an open
setup step at the moment of close. If it is high, the grade is not measuring activation and
every downstream decision built on it is built on sand. This is one query, and it either
kills the hypothesis or ends the argument.

**Why it is commercially real.** Churn is monotonic in grade: A 2.2%, B 4.4%, C 8.2%,
D 17.4%. Calendar off doubles churn, 10.6% against 5.3%. The grade is a bad *measure* of
activation but a good *predictor* of churn — because the thing it accidentally measures
(did the calendar get turned on) is the thing that matters.

**One caveat I am not hiding:** churn rates by signup month fall to zero for August,
which is censoring, not improvement. Any churn comparison across cohorts has to be
tenure-matched.

---

## 2 · Campaign 4 converts at 41% and makes doctors worse off. Both are true.

Campaign 4 asks doctors to turn their online calendar on. Its conversion is the highest of
the six. The doctors in it end up with fewer bookings.

Splitting the campaign by whether the doctor actually converted resolves it immediately:

| Campaign 4 enrollees | n | Bookings before | Change after |
|---|---:|---:|---:|
| Did **not** turn the calendar on | 311 | 12.2 | **+0.33** |
| **Did** turn the calendar on | 197 | 11.8 | **−2.28** |

Turning the calendar on is what causes the damage. The mechanism is in the slot counts —
of the 197 who converted, **not one published more than a single weekly slot**. 117 published
**zero**; the other 80 published exactly one.

Across the whole base, for doctors with the calendar on:

| Weekly slots published | n | Avg patient bookings/month |
|---|---:|---:|
| 0 | 359 | 11.3 |
| 1–8 | 661 | 13.8 |
| 9–14 | 937 | **15.3** |
| 15–20 | 871 | 15.2 |
| 21+ | 1,403 | 15.1 |
| *Calendar off (reference)* | *1,340* | *12.2* |

**A calendar that is on with nothing published is worse than a calendar that is off.** With
it off, a patient who lands on the profile calls the practice and the booking still happens.
With it on and empty, the patient sees an online agenda with no availability and leaves.

The campaign is not broken. Its definition of done is. `converted = calendar_enabled == true`
scores the switch, not the outcome. The conversation ends at exactly the point where the
doctor still has to do the thing that creates value.

**The fix, in order of cost:**
1. Redefine conversion as `calendar_enabled AND weekly_slots_published >= 8`. One line.
   Reported conversion drops to roughly zero, which is the correct number.
2. Add the second step to the campaign flow — publishing slots — and escalate to a person
   when the doctor turns it on and stops.
3. Backfill: **870 doctors** currently sit in the hollow state (calendar on, <8 slots).
   That is a named, worked list, not a project.

**This is the answer to the governance question too.** An automation doing something subtly
wrong for six months with nobody noticing is not hypothetical here — it is campaign 4, and
it was invisible because the campaign's own success metric was the thing that was wrong.

---

## 3 · Campaign 6 destroys bookings. Stop it today.

68 doctors, 0% conversion, 38 with enough history to measure:

| | Before | After | Change |
|---|---:|---:|---:|
| Patient bookings | 15.0 | 4.8 | **−9.9** |
| Admin bookings | — | — | +1.6 |
| **Total** | | | **−8.3** |

The reach is small enough that a conversion rate of 0% reads as noise. The booking effect
does not: **every measurable doctor in the campaign is negative**, and they started above the
platform average (15.0 against 14.2), so this is not selection of weak accounts. The bookings
do not move into the admin column — 1.6 of the 9.9 come back. The rest disappear.

Killing it costs nothing — it converts nobody. The question worth asking afterwards is what
the campaign actually changes in the doctor's configuration, because a −8 booking swing from
a WhatsApp campaign means it flips something in the product.

**Campaign 2 and 5 also come out negative** (−0.39 and −0.64) against a flat market
(14.55 → 14.16 per doctor, April to August; the tenure curve is flat too). They are worth
the same before/after split I did for campaign 4 before anyone defends them.

---

## 4 · Table D is a queue, not a leaderboard

The pack shows conversion from 31% to 51% across six specialists with similar volumes. Rank
them by median pickup time and the ordering is **perfectly inverted** (Spearman ρ = −1.00):

| Specialist | Escalations | Median pickup | Converted | **Converted when picked up <30 min** |
|---|---:|---:|---:|---:|
| S01 | 76 | 12 min | 51.3% | 54.2% |
| S02 | 66 | 24 min | 47.0% | 51.0% |
| S03 | 74 | 33 min | 43.2% | 55.2% |
| S04 | 87 | 52 min | 36.8% | **58.8%** |
| S05 | 56 | 64 min | 32.1% | 50.0% |
| S06 | 71 | 75 min | 31.0% | 50.0% |

The last column is the finding. **Control for response time and the gap closes completely** —
every specialist converts between 50% and 59%. S04, ranked fourth overall, is the best
converter in the operation when they answer quickly.

Pooled across everyone:

| Pickup | n | Converted |
|---|---:|---:|
| <30 min | 164 | 53.7% |
| 30–60 min | 139 | 40.3% |
| 60–120 min | 105 | 25.7% |
| 120 min+ | 22 | 13.6% |

What differs between specialists is not skill, it is how often an escalation reaches them
fast: S01 gets 78% of theirs inside 30 minutes, S05 gets 4%, S06 gets 11%.

**In my first month I would not coach a single one of these six.** I would find out why the
queue drains at different speeds for different people — shift coverage, notification routing,
portfolio load, or a manual assignment step — and fix that. Coaching S06 on conversation
quality would be treating the one thing the data says is not broken.

**And 27 escalations (5.7%) had no owner at all** — `unassigned_queue` or `no_case_linked`.
They waited a median of 125 minutes and converted at 18.5% against 40.2% for everything else.
That is roughly 4–5 escalations a month thrown away by routing.

---

## 5 · Things in the file that cannot be true

Flagged automatically on every pipeline run (`python3 src/pipeline.py --check`).

| Finding | Rows | Why it matters |
|---|---:|---|
| Onboardings closing after day 28 | 155 | The brief says nothing closes after day 28. Max observed is day 34. Either the rule is not enforced or the close date is written after the fact. |
| Onboardings closing on exactly day 28 | 3,266 (59%) | Not impossible, but not a distribution work produces. |
| Escalations owned by `unassigned_queue` / `no_case_linked` | 27 | These are not people. Any per-specialist average that includes them is wrong. |
| Escalations to S07–S13 | 18 | The brief says S01–S06 handle escalations. Seven other specialists appear. |
| S14 | — | A farming specialist who never receives an escalation and owns no portfolio rows in the same pattern as the others. |
| Doctors with no onboarding record | 45 | Every doctor in the file is supposed to have started onboarding between March and August. |
| Enrollments with no recorded outcome | 9,983 of 10,497 | Stated in the brief, but worth repeating: **campaign conversion is a 5% sample, escalation conversion is a census.** They are not comparable numbers and should never appear side by side on the same chart. |

---

## 6 · Cost to serve

The dataset has no time logs and no phone records, so any cost number is an assumption
stack, not a measurement. Stating it that way:

**What the AI costs.** The copilot composes drafts deterministically — zero marginal cost.
The model is used only to rewrite tone, on demand. At 15 messages a day, half of them
polished, 21 working days: ~170 calls a month, ~180 input and ~80 output tokens each.
On Haiku pricing that is **about $0.10 per specialist per month**. Even the wasteful design —
a full LLM generation with complete doctor history for all 370 accounts monthly on a frontier
model — lands near $5. **Model cost is not a real constraint at this scale and anyone telling
you otherwise is selling something.** The constraint is specialist time and the engineering
time to keep the pipeline honest.

**What specialist time costs.** With ~370 active doctors per specialist and no time logs, the
only honest proxy is contacts: 14,485 farming interactions across 4,470 doctors, 3.24 each.
The correction I would make before trusting it: phone calls are absent entirely, and
onboarding contacts (15,361, all outbound) are a different job.

**The single change with the best arithmetic** is the escalation SLA, because it is the only
lever where the data gives a clean counterfactual.

- Baseline: 475 escalations over 6 months ≈ 79/month, converting at 38.9%.
- If every escalation were answered inside 30 minutes, the observed rate for that bucket is 53.7%.
- Target: 79 × (53.7% − 38.9%) ≈ **12 additional conversions a month**, plus ~1 from
  recovering the unowned queue.
- Cost of the change: routing and alerting. No headcount.

**How I would prove it was the change and not seasonality.** Do not roll it out to everyone.
Hold the SLA on half the escalation queue for four weeks, randomised at the point of
escalation, not by specialist — specialists differ in queue speed, which is the variable under
test. Compare conversion within the same weeks. Seasonality hits both arms equally; a
specialist-split design would not survive the first objection.

**If cost to serve falls and retention falls with it**, the leading indicator is in the
copilot's own logs: the ratio of accounts it recommends leaving alone. Today that is 45%
of a portfolio. If cost per doctor drops while that ratio climbs, the saving is coming from
not doing work rather than from doing it faster, and retention follows one renewal cycle
later — long after the quarter closes. That ratio, tracked weekly against churn by cohort,
is the check I would put in before the rollout, not after.

---

## 7 · The most predictive column in the file is the one nobody queries

`interactions.note` holds 29,846 free-text notes written by the specialists themselves —
2,274 distinct strings built from 386 sentence templates. A rules classifier (`src/notes.py`,
no model, every tag traceable to the phrase that produced it) tags **95.5%** of them.

Then measure each signal against actual churn. Baseline is 6.6%.

| Signal | Doctors | Churn | Lift |
|---|---:|---:|---:|
| **Note says they may cancel or are comparing platforms** | 352 | **35.8%** | **5.5×** |
| Onboarding grade D | 900 | 17.4% | 2.7× |
| Note says they are discouraged with results | 254 | 15.0% | 2.3× |
| Bottom quartile vs their specialty and city | 1,074 | 12.8% | 1.9× |
| Calendar never turned on | 1,340 | 10.6% | 1.6× |
| Note logs a complaint about volume or no-shows | 981 | 9.4% | 1.4× |

**352 doctors told their own specialist they were going to leave, in writing, and the
operation has no way to know.** It is the strongest predictor in the dataset by a factor of
two, sitting in a column no report reads. One of them wrote: *"Dice que si este mes no mejora
el número de citas, cancela."* That is not a signal to model. It is a call to make today.

### The specialists had already diagnosed campaign 4

Around 190 notes describe the hollow calendar in plain Spanish — *"prendió el calendario en
la campaña pero no cargó horarios"*, *"revisé su agenda: encendida y con ningún horario"*,
*"sin disponibilidad no le van a entrar pacientes"*.

**210 doctors carry such a note. All 210 are still in that state — precision 1.000.**

The people closest to the work found the broken campaign by hand, months ago, and wrote it
down where nobody was reading. The business case says it plainly: *"the specialists who should
be the first users of these tools are often the last to hear about them."* This is what that
sentence costs.

---

## 8 · Three signals I expected to matter carry no weight

The risk score is additive and every weight is set from the lift table above rather than from
judgement. Which means some of my own first guesses had to be thrown out:

| What I expected | What the data said | What I did |
|---|---|---|
| Unanswered outbound messages predict churn | The doctors with **zero** unanswered outbound churn most (10.3%) — because once a doctor cancels, nobody messages them again. Reverse causality. | Removed |
| Campaign over-contact predicts churn | 3+ campaigns in 60 days → 1.3% churn, lift **0.21**. It is protective: Kraken enrols doctors who are engaged. | Removed |
| A falling booking trend predicts churn | Lift 0.69. A negative slope is the platform norm, not a warning. | Removed |
| More complaints is worse than one | ≥2 complaints has *lower* churn (6.5%) than ≥1 (9.4%). A doctor who keeps complaining is still talking to you. | Threshold set at ≥1, not ≥2 |

The result ranks churn cleanly across the base:

| Risk bucket | Doctors | Churn |
|---|---:|---:|
| 0.00–0.15 | 3,083 | 2.2% |
| 0.15–0.30 | 1,037 | 5.0% |
| 0.30–0.50 | 575 | 13.4% |
| 0.50–0.70 | 420 | 16.4% |
| 0.70–1.00 | 456 | **21.7%** |

Ten times the churn rate from the bottom bucket to the top, from a rules model a specialist
can read and argue with. No training, no retraining, no opacity — and `src/analysis.py`
reprints the whole table on demand, so any weight can be challenged with one command.

**Why rules rather than a model, for this problem.** A gradient-boosted model would likely rank
slightly better. It would also be unarguable. When a specialist asks why Dr. X is at the top of
their Tuesday list, "because the model said 0.83" ends the conversation and, six months in, is
exactly how an automation goes subtly wrong with nobody noticing. Every number on this page can
be traced to a line and a lift.

---

## 9 · What the derived fields found — including what they did not

Four families of calculated fields were added on top of the raw columns: note signals,
booking dynamics, campaign-response profile, and peer benchmarking. Reporting the failures
alongside the finds, because three of the four were mostly dead ends and knowing that is
worth as much as the one that paid.

### The find: two problems that look identical and need opposite treatment

Booking returns against published slots, for every doctor with the calendar on:

| Weekly slots | Doctors | Bookings/mo | Bookings per slot | Marginal gain |
|---|---:|---:|---:|---:|
| 0 | 359 | 11.3 | — | — |
| 1–2 | 240 | 11.4 | 11.4 | +0.1 |
| 5–6 | 146 | 15.3 | 2.6 | **+3.9** |
| 7–8 | 275 | 15.5 | 2.1 | +0.2 |
| 9–10 | 299 | 15.3 | 1.6 | −0.1 |
| 11–14 | 638 | 15.3 | 1.2 | −0.0 |
| 15–20 | 871 | 15.2 | 0.9 | −0.2 |
| 21+ | 1,403 | 15.1 | 0.6 | −0.0 |

**The entire benefit arrives by six slots and then the curve is flat forever.** A doctor
publishing 25 slots books no more than one publishing six. Two consequences:

1. **The ask should be six slots, not eight.** I set the threshold at eight by instinct; the
   data puts the cliff between two and six. Six is also a materially easier thing to ask a
   doctor for, and it is where 100% of the gain is. **`RULES["calendar_healthy_slots"]` is now 6.**

2. **Low bookings mean two completely different things.** Split the underperformers — doctors
   below the median for their specialty and city — by whether their agenda is the bottleneck:

   | | Doctors | Avg slots | Bookings/slot | What is actually wrong |
   |---|---:|---:|---:|---|
   | ≤6 slots | 204 | 2.0 | **8.0** | Saturated. Every slot they open fills. Supply problem — open more |
   | >6 slots | **1,094** | 18.5 | **0.7** | 26% utilisation. Demand problem — nobody is finding them |

   Telling the second group to publish more slots is useless advice, and it is the advice
   campaign 4 gives them. **The copilot now separates the two.** `supply_constrained` gets the
   agenda conversation; `demand_constrained` gets a profile-and-positioning conversation that
   opens by saying their agenda is *not* the problem.

   The demand-constrained play is gated on a gap of at least 2 bookings a month below the peer
   median (`RULES["meaningful_peer_gap"]`), because the first version generated messages that
   read *"you are on 14 and the median is 14"* — a message that argues against itself. That
   leaves 584 active doctors in the play: average 18 open slots a week, filling 0.65 of each,
   4.3 bookings a month below their peers.

### The honest negatives

| What I built | What it turned out to be |
|---|---|
| **Onboarding no-show flag** (2,445 doctors with a note saying they never joined their onboarding session) | Predicts **nothing**. Same average score (70.5 vs 70.3), same grade-A rate (29.7% vs 27.1%), same churn (6.5% vs 6.6%). A doctor who never attended their own onboarding is graded identically to one who did — which is the most direct evidence yet that the grade is not measuring the onboarding work. Useless as a feature, damning as a finding |
| **Peer benchmarking by specialty × city** | Across 71 cells with 30+ doctors, the median ranges only 11.5 to 15.9 (sd 0.84). Segmenting by specialty and city adds almost nothing over the platform average. It stays in the copilot because *"el promedio de pediatría en Querétaro es 13"* is far more persuasive to a doctor than *"the platform average"* — it earns its place rhetorically, not analytically, and that is worth saying out loud |
| **Campaign-response profile** | Engagement is flat at 45–53% across every campaign and every onboarding grade. Grade A doctors engage no more than grade D. There is no targeting signal here — which means Kraken cannot currently be made smarter about *who* to enrol, only about *what it asks for* |
| **Gatekeeper flag** (419 doctors whose assistant runs the agenda) | No effect on bookings, admin share or churn. Worthless as a risk signal, genuinely useful as a contact instruction — it tells the specialist who to actually address. It is surfaced in the copilot as a channel note, not as a score |

### Two more things in the file that cannot be true

- **No doctor publishes 2, 3, 4 or 5 weekly slots.** The distribution jumps from 1 to 6. With
  5,571 doctors that is not chance.
- **Campaign 4's engagement rate is 100% for every doctor whose calendar is now on**, and 13%
  for those whose calendar is off. Engagement is being recorded from the outcome rather than
  measured from the conversation, so the campaign's funnel metrics are circular and cannot be
  compared with the other five.
