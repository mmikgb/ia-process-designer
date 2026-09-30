import { expect, test } from "@playwright/test"

// T4.5: "Explícame" opens a popover and fills it (no key → the block's own fallback sentence).
test("explain a KPI card and a control chart", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("cs:who", '{"kind":"manager","team":"Farming Norte"}'))
  for (const path of ["/resumen", "/control"]) {
    await page.goto(path)
    await page.getByRole("button", { name: /^Explícame/ }).first().click()
    const pop = page.getByRole("dialog").filter({ hasText: "Explícame" })
    await expect(pop.locator("p").first()).toHaveText(/\w{3,}.*\./, { timeout: 15_000 })
  }
})
