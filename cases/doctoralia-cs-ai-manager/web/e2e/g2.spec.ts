import { expect, test } from "@playwright/test"
import { appendFileSync, mkdirSync } from "node:fs"

// G1 + G2 (SPEC §1): from a fresh browser to the first actionable item in ≤ 3 clicks and
// to a sendable draft in ≤ 4, both under 30 s. The numbers go to e2e/.out/g2.txt.
test("G2: fresh browser → first action ≤ 3 clicks, sendable draft ≤ 4 clicks, < 30 s", async ({ page }) => {
  let clicks = 0
  const click = async (l: ReturnType<typeof page.locator>) => {
    clicks++
    await l.click()
  }
  const t0 = Date.now()
  await page.goto("/")
  await click(page.getByRole("dialog").getByRole("button", { name: /Rafael Sandoval/ }))
  await page.waitForURL("**/hoy")
  await click(page.getByRole("button", { name: "Empezar" }))
  const focus = page.getByRole("dialog", { name: "Modo ráfaga" })
  await expect(focus.getByText(/Guion de llamada|Borrador para enviar/).first()).toBeVisible()
  const firstAction = { clicks, ms: Date.now() - t0 }
  expect(firstAction.clicks).toBeLessThanOrEqual(3)
  expect(firstAction.ms).toBeLessThan(30_000)

  // a fresh browser again, straight to a draft
  await page.context().clearCookies()
  await page.evaluate(() => localStorage.clear())
  clicks = 0
  const t1 = Date.now()
  await page.goto("/")
  await click(page.getByRole("dialog").getByRole("button", { name: /Rafael Sandoval/ }))
  await page.waitForURL("**/hoy")
  await click(page.getByRole("button", { name: /Mensajes listos/ }))
  await click(page.locator("#block-message li button").first())
  const draft = page.getByRole("dialog").getByRole("textbox", { name: "Borrador para enviar (editable)" })
  await expect(draft).toBeVisible()
  await expect(draft).toBeEditable()
  expect(await draft.inputValue()).toMatch(/^Doctor/)
  const toDraft = { clicks, ms: Date.now() - t1 }
  expect(toDraft.clicks).toBeLessThanOrEqual(4)
  expect(toDraft.ms).toBeLessThan(30_000)

  const line = `G2 ${new Date().toISOString()} first_action clicks=${firstAction.clicks} ms=${firstAction.ms} | draft clicks=${toDraft.clicks} ms=${toDraft.ms}\n`
  mkdirSync("e2e/.out", { recursive: true })
  appendFileSync("e2e/.out/g2.txt", line)
  console.log(line.trim())
})
