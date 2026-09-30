# CS Control Room — working rules for Claude Code

The current work is `SPEC_Daily_Tool.md`. Execute it phase by phase on `feat/daily-tool`,
one ticket per commit, and stop at every "⏸ Miguel" marker.

## Invariants (do not break, even if a ticket seems to ask for it)

- **Python computes, the browser displays.** Every metric, count, ranking, queue order and
  threshold is decided in `src/` and written into the bundle. The web app picks, filters, sorts
  and formats. If you need a new number on screen, add it to `bundle.py`.
- **The model never produces a number.** It names, explains and writes. Counts come from code
  or tool results. Every AI output passes `web/lib/ai/guard.ts`.
- **One place per decision.** Thresholds only in `src/pipeline.py` `RULES`. Plays and their
  priority only in `src/draft.py` `PLAYS`. Note rules only in `src/notes.py` `RULES`.
- **One place per model call.** Build time: `src/llm.py`. Run time: `web/lib/ai/gateway.ts`.
  Both never throw, write a ledger row per call, and respect the kill switch and budget in
  `out/settings.json`.
- **Everything works with no API key.** Each AI surface has a deterministic fallback.
- **Messages to doctors are Spanish (usted)**, whatever the UI language.
- **Read-only against the operation.** The app drafts; people send. No CRM writes, no sending.

## Commands

```bash
python3 src/bundle.py            # rebuild; also refreshes web/data and web/public
python3 src/analysis.py          # every number in FINDINGS.md, recomputed
pytest tests/                    # Python tests (added by the spec)
streamlit run src/app.py         # the original app (keep it working)
cd web && pnpm dev               # http://localhost:3000
cd web && pnpm typecheck && pnpm build
cd web && pnpm exec playwright test
```

The workbook lives at `data/dataset.xlsx` and is not in git. `out/` is not in git either
(work log, ledger, settings, AI cache live there).

## Before you say a ticket is done

Run its "Check" lines. Record anything you could not verify in `HANDOFF.md`, in plain words.
