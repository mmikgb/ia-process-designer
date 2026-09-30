// T5.4: the team's follow-through, from the outcome log.
import assert from "node:assert/strict"
import test from "node:test"
import { followThrough, type WorkEvent } from "../lib/work.ts"

let n = 0
const ev = (e: Partial<WorkEvent>): WorkEvent =>
  ({ id: `w${n++}`, ts: "", actor: "S01", owner: "S01", doctor_id: "D1", outcome: "sent", app_day: "2026-09-25", ...e }) as WorkEvent

test("today and this week count outcomes, not skips or undone ones", () => {
  // 2026-09-25 is a Friday: the week starts on Monday the 21st
  const a = ev({ app_day: "2026-09-25" })
  const events = [
    a,
    ev({ doctor_id: "D2", outcome: "no_answer", app_day: "2026-09-25" }),
    ev({ doctor_id: "D3", outcome: "skipped", app_day: "2026-09-25" }),
    ev({ doctor_id: "D4", outcome: "agreed", app_day: "2026-09-21", next_due: "2026-09-30" }),
    ev({ doctor_id: "D5", outcome: "sent", app_day: "2026-09-18" }),
    ev({ doctor_id: "D6", outcome: "sent", app_day: "2026-09-24" }),
    ev({ outcome: "undo", undo_of: "w5", doctor_id: "D6" }),
  ]
  const f = followThrough(events, new Map(), "2026-09-25", 14)
  assert.equal(f.today, 2)
  assert.equal(f.week, 3)
})

test("overdue: a return past due, or a note's follow-up the log has not touched", () => {
  const events = [
    ev({ doctor_id: "D1", outcome: "no_answer", app_day: "2026-09-18", next_due: "2026-09-22" }), // overdue
    ev({ doctor_id: "D2", outcome: "agreed", app_day: "2026-09-18", next_due: "2026-09-29" }), // not yet
    ev({ doctor_id: "D3", outcome: "not_applicable", app_day: "2026-09-18" }), // closed, beats the note
  ]
  const notes = new Map([
    ["D3", "2026-09-20"], // handled in the log
    ["D7", "2026-09-20"], // 5 days late: overdue
    ["D8", "2026-08-01"], // stale beyond 14 days: not counted (Hoy moves it to later)
    ["D9", "2026-09-30"], // not due yet
  ])
  assert.equal(followThrough(events, notes, "2026-09-25", 14).overdue, 2)
})

test("drafts: sent with a copied draft, edited or not", () => {
  const events = [
    ev({ doctor_id: "D1", draft_copied: true, draft_edited: false }),
    ev({ doctor_id: "D2", draft_copied: true, draft_edited: true }),
    ev({ doctor_id: "D3", draft_copied: true }),
    ev({ doctor_id: "D4", draft_copied: false }), // sent without the draft: not counted
  ]
  const f = followThrough(events, new Map(), "2026-09-25", 14)
  assert.equal(f.sent, 3)
  assert.equal(f.unedited, 2)
})
