import { expect, test } from "@playwright/test"

// T4.7: ⌘J opens the assistant on any screen; with no key it says it is off and offers the
// screen's lists as buttons.
test("ask drawer with no key: off, with suggested lists", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("cs:who", '{"kind":"specialist","id":"S01"}'))
  // Recent Chrome returns a Promise from scrollIntoView; an effect that returned it crashed
  // the page on the next update ("i is not a function"). Reproduce that browser here.
  await page.addInitScript(() => {
    const orig = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = function (this: Element, ...a: unknown[]) {
      orig.apply(this, a as never)
      return Promise.resolve() as never
    }
  })
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(e.message))
  await page.goto("/hoy")
  await page.keyboard.press("Control+j")
  const drawer = page.getByRole("dialog", { name: "Pregúntale a tu cartera" })
  await drawer.getByRole("button", { name: "¿Por quién empiezo y por qué?" }).click()
  const answer = drawer.getByTestId("ask-answer").last()
  await expect(answer).toContainText("El asistente está apagado")
  await expect(answer.getByRole("button", { name: /Ver lista · Dijo que cancelaría/ })).toBeVisible()
  await drawer.getByRole("textbox").fill("¿Y después?")
  await page.keyboard.press("Enter")
  await expect(drawer.getByTestId("ask-answer")).toHaveCount(2)
  await expect(drawer.getByTestId("ask-answer").last()).toContainText("El asistente está apagado")
  expect(errors).toEqual([])
  await drawer.getByTestId("ask-answer").last().getByRole("button", { name: /Ver lista · Dijo que cancelaría/ }).click()
  await expect(page).toHaveURL(/\/doctores\?owner=S01&flag=may_cancel/)
})
