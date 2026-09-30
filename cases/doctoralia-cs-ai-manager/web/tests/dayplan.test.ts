// node --test tests/*.test.ts (pnpm test). lib/dayplan.ts must reproduce the Python cut.
import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import test from "node:test"
import { addBusinessDays } from "../lib/dates.ts"
import { applyWork, plan, type Candidate } from "../lib/dayplan.ts"
import { fold, nextDueFor, todayLog, type WorkEvent } from "../lib/work.ts"

const dir = new URL("../public/queue/", import.meta.url)
const files = readdirSync(dir).filter((f) => f.endsWith(".json"))
const load = (f: string) => JSON.parse(readFileSync(new URL(f, dir), "utf8"))

test("the web cut reproduces every queue file at the RULES defaults", () => {
  assert.ok(files.length >= 14)
  for (const f of files) {
    const q = load(f)
    const got = plan(q.items, q.asof, { capacity: q.capacity, quota: q.followup_quota, window: q.followup_stale_days })
    assert.deepEqual(
      got.map((y) => [y.doctor_id, y.block, y.origin ?? null, y.rank, y.reason.es, y.later_reason?.es ?? null]),
      q.items.map((x: any) => [x.doctor_id, x.block, x.origin ?? null, x.rank, x.reason.es, x.later_reason?.es ?? null]),
      f,
    )
  }
})

const q = load("S01.json")
const opts = { capacity: q.capacity, quota: q.followup_quota, window: q.followup_stale_days }
const ev = (e: Partial<WorkEvent>): WorkEvent =>
  ({ id: `w${Math.random()}`, ts: "", actor: "S01", owner: "S01", app_day: q.asof, ...e }) as WorkEvent

test("capacity and quota move the cut, calls are never cut", () => {
  const small = plan(q.items, q.asof, { ...opts, capacity: 5, quota: 1 })
  const n = (p: any[], b: string) => p.filter((y) => y.block === b).length
  assert.equal(n(small, "followup"), 1)
  assert.equal(n(small, "call"), n(q.items, "call"))
})

test("no answer comes back in 2 working days, ahead of the file's follow-ups", () => {
  const msg = q.items.find((x: any) => x.block === "message") as Candidate
  const due = nextDueFor("no_answer", q.asof)!
  assert.equal(due, addBusinessDays(q.asof, 2))
  const events = [ev({ doctor_id: msg.doctor_id, outcome: "no_answer", next_due: due })]
  // today: gone from the plan, listed as returning
  let w = applyWork(q.items, fold(events), q.asof)
  assert.ok(!w.items.some((x) => x.doctor_id === msg.doctor_id))
  assert.equal(w.returning[0].item.doctor_id, msg.doctor_id)
  // on its date: first follow-up of the day
  w = applyWork(q.items, fold(events), due)
  const p = plan(w.items, due, opts)
  const fu = p.filter((y) => y.block === "followup")
  assert.equal(fu[0].doctor_id, msg.doctor_id)
  assert.match(fu[0].reason.es, /Sin respuesta/)
})

test("not applicable and routed leave for good; skipped stays", () => {
  const [a, b, c] = q.items.filter((x: any) => x.block !== "later")
  const state = fold([
    ev({ doctor_id: a.doctor_id, outcome: "not_applicable" }),
    ev({ doctor_id: b.doctor_id, outcome: "routed" }),
    ev({ doctor_id: c.doctor_id, outcome: "skipped" }),
  ])
  const ids = applyWork(q.items, state, "2027-01-01").items.map((x) => x.doctor_id)
  assert.ok(!ids.includes(a.doctor_id) && !ids.includes(b.doctor_id) && ids.includes(c.doctor_id))
})

test("undo restores the previous state and drops out of today's log", () => {
  const x = q.items[0]
  const first = ev({ id: "w1", doctor_id: x.doctor_id, outcome: "agreed", next_due: "2026-10-02" })
  const second = ev({ id: "w2", doctor_id: x.doctor_id, outcome: "not_applicable" })
  const undo = ev({ id: "w3", doctor_id: x.doctor_id, outcome: "undo", undo_of: "w2" })
  assert.equal(fold([first, second])[x.doctor_id].outcome, "not_applicable")
  assert.equal(fold([first, second, undo])[x.doctor_id].outcome, "agreed")
  assert.deepEqual(todayLog([first, second, undo], q.asof).map((e) => e.id), ["w1"])
})

test("working days skip weekends", () => {
  assert.equal(addBusinessDays("2026-09-25", 1), "2026-09-28") // Fri -> Mon
  assert.equal(addBusinessDays("2026-09-25", 2), "2026-09-29")
  assert.equal(addBusinessDays("2026-09-28", 5), "2026-10-05")
})
