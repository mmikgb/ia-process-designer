import { expect, test } from "@playwright/test"

// T6.1: every screen, both roles, both languages: it renders, nothing throws, and the page
// never scrolls sideways (tables scroll inside their cards). Runs at 1440 light and 390 dark.
const SCREENS = ["/hoy", "/doctores", "/conversaciones", "/senales", "/resumen", "/equipo", "/pulse", "/control", "/costo"]

for (const locale of ["es", "en"]) {
  for (const [who, role] of [
    ['{"kind":"specialist","id":"S01"}', "specialist"],
    ['{"kind":"manager","team":"Farming Norte"}', "manager"],
  ] as const) {
    test(`every screen renders (${role}, ${locale})`, async ({ page }) => {
      const errors: string[] = []
      page.on("pageerror", (e) => errors.push(e.message))
      await page.addInitScript(
        ([w, l]) => {
          localStorage.setItem("cs:who", w)
          localStorage.setItem("cs:locale", l)
        },
        [who, locale],
      )
      for (const path of SCREENS) {
        await page.goto(path)
        await page.waitForLoadState("networkidle")
        await expect(page.locator("main h1").first(), path).toBeVisible()
        await expect(page.getByText("This page couldn’t load")).toHaveCount(0)
        const [sw, w] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth])
        expect(sw, `${path} scrolls sideways`).toBeLessThanOrEqual(w + 1)
      }
      expect(errors).toEqual([])
    })
  }
}
