import { expect, test } from "@playwright/test"

// T5.4: the follow-through reads the outcome log.
test("outcomes logged for a specialist show on My team", async ({ page, request }) => {
  const base = { owner: "S02", actor: "S02", app_day: "2026-09-25" }
  for (const e of [
    { ...base, doctor_id: "D90001", outcome: "sent", draft_copied: true, draft_edited: false },
    { ...base, doctor_id: "D90002", outcome: "sent", draft_copied: true, draft_edited: true },
    { ...base, doctor_id: "D90003", outcome: "no_answer", next_due: "2026-09-29" },
  ]) {
    expect((await request.post("/api/work", { data: e })).status()).toBe(201)
  }
  await page.addInitScript(() => localStorage.setItem("cs:who", '{"kind":"manager","team":"Farming Norte"}'))
  await page.goto("/equipo")
  await page.getByRole("radio", { name: "Todos los equipos" }).click()
  const row = page.locator('[data-ft="S02"] td')
  await expect(row.nth(1)).toHaveText("3") // today
  await expect(row.nth(2)).toHaveText("3") // this week
  await expect(row.nth(4)).toHaveText("1 de 2") // unedited, as a count under n=10
})
