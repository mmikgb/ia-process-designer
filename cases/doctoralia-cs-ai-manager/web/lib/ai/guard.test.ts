import assert from "node:assert/strict"
import test from "node:test"
import { guard, numbersIn } from "./guard.ts"

const ctx = {
  doctor: { name: "Dr. Gerardo Gamboa", id: "D03810", bookings_avg: 11.0, peer_median: 12.4, slots: 16 },
  lift: { churn: 0.358, lift: 5.45 },
  last_contact: "2026-09-07",
  note: "Lo agendé para revisión en 10 días.",
}

test("numbers from the record pass, with their renderings", () => {
  const out = "Recibe 11 citas al mes contra 12 de sus pares (12.4). El 36% de estos se van; 35.8% exacto; 5.45 veces. Habló el 7 de septiembre y pidió revisión en 10 días. Tiene 16 horarios."
  assert.deepEqual(guard(out, ctx).unverified_numbers, [])
})

test("a number that is not in the record is flagged", () => {
  const out = "Si publica más horarios recibirá 4 citas más y subirá 25%."
  assert.deepEqual(guard(out, ctx).unverified_numbers, ["4", "25%"])
})

test("ids, model names and codes are not numbers", () => {
  assert.deepEqual(numbersIn("Doctor D03810 de S01, campaña C4, modelo claude-sonnet-5-5"), [])
})

test("Spanish decimal comma and thousands", () => {
  assert.deepEqual(guard("Promedia 12,4 citas; la cartera tiene 1,499 doctores.", { a: 12.4, b: 1499 }).unverified_numbers, [])
  assert.deepEqual(guard("Son 1.499 doctores.", { b: 1499 }).unverified_numbers, [])
})

test("what the specialist typed counts as context", () => {
  assert.deepEqual(guard("Lo llamo el viernes 2 a las 10.", {}, ["llámalo el viernes 2 a las 10"]).unverified_numbers, [])
})

test("banned phrases, accent-insensitive", () => {
  const g = guard("Le garantizo resultados y la configuración es gratis; más pacientes seguro.", ctx)
  assert.deepEqual(g.banned_phrases.sort(), ["garantizo", "gratis", "mas pacientes seguro"])
})

test("a date's day only justifies a date, not a count", () => {
  const ctx2 = { followup: { due_at: "2026-09-07" }, slots: 18 }
  assert.deepEqual(guard("Lo llamo el 7 de septiembre; tiene 18 horarios.", ctx2).unverified_numbers, [])
  assert.deepEqual(guard("Con esto recibiría 7 citas más al mes.", ctx2).unverified_numbers, ["7"])
  assert.deepEqual(guard("¿Le funciona el lunes 28 de septiembre?", { d: "2026-09-28" }).unverified_numbers, [])
})

test("a share becomes a percent only when written as one", () => {
  assert.deepEqual(guard("El 36% se va.", { churn: 0.358 }).unverified_numbers, [])
  assert.deepEqual(guard("Recibe 36 citas.", { churn: 0.358 }).unverified_numbers, ["36"])
})
