import { expect, test } from "@playwright/test"

// T4.7: ⌘J opens the assistant on any screen; with no key it says it is off and offers the
// screen's lists as buttons.
test("ask drawer with no key: off, with suggested lists", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("cs:who", '{"kind":"specialist","id":"S01"}'))
  await page.goto("/hoy")
  await page.keyboard.press("Control+j")
  const drawer = page.getByRole("dialog", { name: "Pregúntale a tu cartera" })
  await drawer.getByRole("button", { name: "¿Por quién empiezo y por qué?" }).click()
  const answer = drawer.getByTestId("ask-answer").last()
  await expect(answer).toContainText("El asistente está apagado")
  await expect(answer.getByRole("button", { name: /Ver lista · Dijo que cancelaría/ })).toBeVisible()
  await answer.getByRole("button", { name: /Ver lista · Dijo que cancelaría/ }).click()
  await expect(page).toHaveURL(/\/doctores\?owner=S01&flag=may_cancel/)
})
