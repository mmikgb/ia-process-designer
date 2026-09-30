import { expect, test } from "@playwright/test"

// T4.7: ⌘J opens the assistant on any screen. With no key it says it is off and offers the
// screen's lists as buttons; with CS_AI_MOCK=1 the mock plan runs the tools and the buttons
// come from them (the list it counted, the day to start).
const MOCK = process.env.CS_AI_MOCK === "1"

test("ask drawer: answers, or says it is off, with list buttons", async ({ page }) => {
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
  const said = MOCK ? "Empieza por" : "El asistente está apagado"
  const list = MOCK ? /^Ver los \d+ · Dijo que cancelaría/ : /Ver lista · Dijo que cancelaría/
  const answer = drawer.getByTestId("ask-answer").last()
  await expect(answer).toContainText(said)
  await expect(answer.getByRole("button", { name: list })).toBeVisible()
  if (MOCK) await expect(answer.getByRole("button", { name: "Empezar el día" })).toBeVisible()
  await drawer.getByRole("textbox").fill("¿Y después?")
  await page.keyboard.press("Enter")
  await expect(drawer.getByTestId("ask-answer")).toHaveCount(2)
  await expect(drawer.getByTestId("ask-answer").last()).toContainText(said)
  expect(errors).toEqual([])
  await drawer.getByTestId("ask-answer").last().getByRole("button", { name: list }).click()
  await expect(page).toHaveURL(/\/doctores\?owner=S01&flag=may_cancel/)
})
