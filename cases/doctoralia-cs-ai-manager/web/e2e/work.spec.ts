import { expect, test } from "@playwright/test"

// T3.3: outcomes persist, reschedule and undo.
test("mark 3 outcomes, reload, advance 2 working days, undo", async ({ page }) => {
  // its own book: the rehearsal logs outcomes for S01 in the same run
  await page.addInitScript(() => localStorage.setItem("cs:who", '{"kind":"specialist","id":"S03"}'))
  await page.goto("/hoy")
  await page.getByRole("button", { name: "Empezar" }).click()
  const focus = page.getByRole("dialog", { name: "Modo ráfaga" })
  await expect(focus.getByText(/^1 de \d+$/)).toBeVisible()
  const names: string[] = []
  for (const key of ["e", "s"]) {
    names.push(await focus.locator("h3").first().innerText())
    await page.keyboard.press(key)
    await expect(focus.getByText(new RegExp(`^${names.length + 1} de`))).toBeVisible()
  }
  names.push(await focus.locator("h3").first().innerText())
  await page.keyboard.press("a")
  await page.getByRole("dialog", { name: "¿Cuándo lo retomas?" }).getByRole("button", { name: "Guardar" }).click()
  await expect(focus.getByText(/^4 de/)).toBeVisible()
  await page.keyboard.press("Escape")

  const undo = page.getByRole("button", { name: /^Deshacer:/ })
  await expect(undo).toHaveCount(3)
  await page.reload()
  await expect(undo).toHaveCount(3)

  for (let k = 0; k < 2; k++) {
    await page.getByRole("button", { name: /Datos al|Día simulado/ }).click()
    await page.getByRole("button", { name: "Avanzar un día" }).click()
    await page.keyboard.press("Escape")
  }
  const followups = page.locator("#block-followup li")
  await expect(followups.first()).toContainText(names[1]) // no answer: back first, 2 working days later
  await expect(followups.first()).toContainText("Sin respuesta")
  await expect(page.locator("#block-followup")).toContainText(names[2]) // agreed: back on its date

  await page.getByRole("button", { name: /Día simulado/ }).click()
  await page.getByRole("button", { name: /Volver al/ }).click()
  await page.keyboard.press("Escape")
  await page.getByRole("button", { name: `Deshacer: ${names[0]}` }).click()
  await expect(page.locator("#block-call li").first()).toContainText(names[0])
})
