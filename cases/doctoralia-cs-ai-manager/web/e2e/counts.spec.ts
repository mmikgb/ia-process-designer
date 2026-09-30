import { expect, test, type Page } from "@playwright/test"

// T5.2 (G4): every count opens exactly the doctors it counts.
const MANAGER = '{"kind":"manager","team":"Farming Norte"}'

async function clickAndCount(page: Page, selector: string, back: string) {
  const link = page.locator(`[data-count="${selector}"]`).first()
  const n = Number((await link.innerText()).replace(/[^\d]/g, ""))
  await link.click()
  await expect(page).toHaveURL(/\/doctores\?/)
  const count = page.getByTestId("doctors-count")
  await expect(count).toHaveText(new RegExp(`^${n.toLocaleString("en-US")} doctor(es)?$|^1 doctor$`))
  if (n > 0) await expect(page.getByTestId("doctors-rows").locator("tr")).toHaveCount(Math.min(n, 100))
  await page.goto(back)
  return n
}

test("team counts for two specialists open lists of that size", async ({ page }) => {
  await page.addInitScript((w) => localStorage.setItem("cs:who", w), MANAGER)
  await page.goto("/equipo")
  for (const who of ["S01", "S07"]) {
    for (const k of ["at_risk", "may_cancel", "hollow", "not_found", "open_commitments"]) {
      await clickAndCount(page, `${who}:${k}`, "/equipo")
    }
  }
})

test("overview KPI counts, attention signals and risk bands open lists of that size", async ({ page }) => {
  await page.addInitScript((w) => localStorage.setItem("cs:who", w), MANAGER)
  await page.goto("/resumen")
  for (const k of ["kpi:at_risk", "kpi:may_cancel", "kpi:hollow", "kpi:not_found", "signal:churn_threat", "signal:complaint", "band:watch", "band:critical"]) {
    await clickAndCount(page, k, "/resumen")
  }
})
