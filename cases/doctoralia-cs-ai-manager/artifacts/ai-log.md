# AI tools used

The brief asks which tools, what I asked them, and what I corrected. This is the honest
version, including the parts where the output was wrong.

## Tools

| Tool | Used for |
|---|---|
| Claude (Opus 5) in Cowork | Data exploration, hypothesis testing, and the first draft of the pipeline, copilot and report |
| pandas / scipy, run locally | Every number. Nothing quoted here came from the model's reading of a table — it came from code I ran |
| Claude Haiku (optional, inside the copilot) | Tone rewriting of drafts at runtime, with facts locked |

## How I worked

I did not ask for a solution. I asked for the data to be interrogated one hypothesis at a
time, and I re-ran each result myself. `src/analysis.py` exists because of that — it is the
model's claims turned back into executable code, so any number in FINDINGS.md that is wrong
is falsifiable in one command rather than defensible in an argument.

The useful prompts were the narrow ones:

- *"Onboarding A-grades fall in May and August. What else moves on that same schedule?"* →
  surfaced the calendar-enablement rate, which is the whole finding.
- *"Campaign 4 converts at 41% and bookings fall. Split the enrollees by whether they
  actually converted."* → the split is what proved the causality direction. I asked for the
  split; the model would have given me a plausible story without it.
- *"Table D ranks specialists. Control for pickup time and show me whether the ranking
  survives."* → it does not, which is the answer.

The pattern: the model is good at finding the column that moves with the thing you care
about, and bad at knowing when it has found a coincidence. Every hypothesis got a control.

## What I corrected

| What it produced | What was wrong | What I did |
|---|---|---|
| "1,020 doctors sit in the hollow-calendar state" | The real count is 870. The first figure came from a filter that included doctors with the calendar off | Made `src/analysis.py` print the count and corrected the document from the script output |
| Overall escalation conversion quoted as 39.6% | 38.9%. A rounding inherited from the business-case PDF rather than computed from the dataset | Recomputed from the file; the pack and the dataset do not have to agree, and where they differ the dataset wins |
| First manager report attributed a +5.4% conversion movement to mix and rate | The two components summed to 130% of the movement — there is an interaction term | Added an explicit residual row so the three always sum to the total, and a band (60–140%) outside which the report refuses to explain the movement at all |
| First report showed per-specialist conversion for people with 2 or 3 escalations | A rate on three cases is a rumour, and it would have put a real person at the bottom of a real table | Suppressed every rate below n=10 and said so in the report |
| Draft message rendered "1 horarios publicados" | Spanish agreement | Fixed the template |

The last three are the ones I would raise in the session. They are all the same failure:
a model will happily produce a number that is arithmetically fine and operationally
defamatory. The guard has to be structural — a minimum n, a residual that must balance, a
fact-check on the polished draft — not a reviewer noticing.

## What I asked it not to do

No churn model, no embedding search over the notes, no agent that sends messages. Each was
available and each would have looked more impressive in a demo. None of them survive the
question "what happens when this is wrong on a Tuesday and nobody notices until Friday".
