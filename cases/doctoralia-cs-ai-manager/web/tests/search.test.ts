// search.json is decoded with bit orders copied from Python; they must not drift.
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { FLAG_BITS, SIGNAL_BITS, searchRow, type SearchRowRaw } from "../lib/types.ts"

const meta = JSON.parse(readFileSync(new URL("../data/overview.json", import.meta.url), "utf8")).meta

test("bit orders match the bundle", () => {
  assert.deepEqual(FLAG_BITS, meta.flag_bits)
  assert.deepEqual(SIGNAL_BITS, meta.signal_bits)
})

test("searchRow decodes flags, signals, status and the day offsets", () => {
  const r = searchRow({ i: "D1", n: "Dr. X", s: "S", c: "C", o: "S01", p: null, m: null, r: 0.6, f: 0b11, a: 0b100001, lc: 12, fu: -3 } as SearchRowRaw)
  assert.deepEqual(r.flags, ["at_risk", "may_cancel"])
  assert.deepEqual(r.signals, ["churn_threat", "complaint"])
  assert.equal(r.status, "active")
  assert.equal(r.lastContact, 12)
  assert.equal(r.followup, -3)
  const c = searchRow({ i: "D2", n: "Dr. Y", s: "S", c: "C", o: "S01", st: "churned", p: null, m: null, r: 0, f: 0 })
  assert.equal(c.status, "churned")
  assert.deepEqual(c.flags, [])
  assert.equal(c.lastContact, null)
  assert.equal(c.bookings, null)
  const b = searchRow({ i: "D3", n: "Dr. Z", s: "S", c: "C", o: "S01", p: null, m: null, r: 0, f: 0, b: 9.5, pm: 12 })
  assert.equal(b.bookings, 9.5)
  assert.equal(b.peers, 12)
})

test("the public file decodes to the counts the team table shows", () => {
  const raw = JSON.parse(readFileSync(new URL("../public/search.json", import.meta.url), "utf8")) as SearchRowRaw[]
  const rows = raw.map(searchRow)
  const overview = JSON.parse(readFileSync(new URL("../data/overview.json", import.meta.url), "utf8"))
  for (const t of overview.team.rows) {
    const mine = rows.filter((r) => r.owner === t.id && r.status === "active")
    assert.equal(mine.length, t.portfolio, t.id)
    assert.equal(mine.filter((r) => r.flags.includes("at_risk")).length, t.at_risk, t.id)
    assert.equal(mine.filter((r) => r.flags.includes("commitment")).length, t.open_commitments, t.id)
  }
})
