import { expect, test } from "@playwright/test"

// T6.2: the rehearsal script (HANDOFF.md), steps 1-4 and 7-10 in the browser. Steps 5 and 6
// edit PLAYS and RULES and rebuild the bundle; they run from the terminal (see HANDOFF).
// Written to pass with no key and with CS_AI_MOCK=1: what changes is the source badge.
const AI = process.env.CS_AI_MOCK === "1" ? /IA de prueba/ : /Versión automática/

test("rehearsal: a specialist's morning, the kill switch, the next day, a manager's week", async ({ page }) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(e.message))

  // 1. fresh browser → pick Rafael → Hoy: the briefing and 20 actions
  await page.goto("/")
  await page.getByRole("dialog").getByRole("button", { name: /Rafael Sandoval/ }).click()
  await page.waitForURL("**/hoy")
  await expect(page.getByRole("heading", { name: "Tu día" })).toBeVisible()
  await expect(page.getByText(/^0 de 20$/)).toBeVisible()

  // 2. Empezar → a call brief (said they may cancel) → Generar guion → Acordamos… on a Friday
  await page.getByRole("button", { name: "Empezar" }).click()
  const focus = page.getByRole("dialog", { name: "Modo ráfaga" })
  await expect(focus.getByText(/^1 de \d+$/)).toBeVisible()
  await expect(focus.getByText("Guion de llamada").first()).toBeVisible()
  await expect(focus.getByText(/cancelaría/).first()).toBeVisible()
  const first = await focus.locator("h3").first().innerText()
  await focus.getByRole("button", { name: "Generar guion" }).click()
  await expect(focus.getByText(AI).first()).toBeVisible({ timeout: 20_000 })
  await page.keyboard.press("a")
  const agreed = page.getByRole("dialog", { name: "¿Cuándo lo retomas?" })
  await agreed.locator('input[type="date"]').fill("2026-10-02") // a Friday
  await agreed.getByRole("button", { name: "Guardar" }).click()
  await expect(focus.getByText(/^2 de \d+$/)).toBeVisible()

  // 3. walk to the first draft → Email · más formal → the diff → copy → E (sent)
  // → skips (logged as "skipped"); wait for the counter to move before the next key
  const next = async (dialog: typeof focus) => {
    const at = Number((await dialog.getByText(/^\d+ (de|of) \d+$/).innerText()).split(" ")[0])
    await page.keyboard.press("ArrowRight")
    await expect(dialog.getByText(new RegExp(`^${at + 1} (de|of) \\d+$`))).toBeVisible()
  }
  for (let i = 0; i < 20 && !(await focus.getByText("Borrador para enviar").first().isVisible()); i++) await next(focus)
  await expect(focus.getByText("Borrador para enviar").first()).toBeVisible()
  const drafted = await focus.locator("h3").first().innerText()
  await focus.getByRole("radio", { name: "Email" }).click()
  await focus.getByRole("button", { name: "más formal" }).click()
  await focus.getByRole("button", { name: "Reescribir con IA" }).click()
  await expect(focus.getByText(AI).first()).toBeVisible({ timeout: 20_000 })
  if (process.env.CS_AI_MOCK === "1") await expect(focus.getByText("Cambios contra el borrador")).toBeVisible()
  await page.keyboard.press("e")
  await expect(focus.locator("h3").first()).not.toHaveText(drafted)
  await page.keyboard.press("Escape")
  await expect(page.getByRole("button", { name: `Deshacer: ${first}` })).toBeVisible()
  await expect(page.getByRole("button", { name: `Deshacer: ${drafted}` })).toBeVisible()

  // 4. open a doctor → Análisis IA → Ver contexto shows what the model saw
  // the doctor just agreed with has left the day; the sheet is addressable (?doctor=)
  const id = await page.evaluate(async (name) => {
    const q = await (await fetch("/queue/S01.json")).json()
    return q.items.find((x: { doctor_name: string }) => x.doctor_name === name).doctor_id as string
  }, first)
  await page.goto(`/hoy?doctor=${id}`)
  await expect(page.getByRole("dialog").getByRole("heading", { name: first })).toBeVisible()
  const sheet = page.getByRole("dialog").filter({ has: page.getByRole("tab", { name: "Análisis IA" }) })
  await sheet.getByRole("tab", { name: "Análisis IA" }).click()
  await sheet.getByRole("button", { name: /Analizar con IA/ }).click().catch(() => {}) // it may already be running
  await sheet.getByRole("button", { name: "Ver contexto" }).first().click({ timeout: 20_000 })
  await expect(page.getByRole("dialog", { name: "Lo que vio el modelo" })).toContainText(`"id": "${id}"`)
  await page.keyboard.press("Escape")
  await page.keyboard.press("Escape")

  // 7. kill switch off → the same screens, "IA apagada", deterministic drafts, nothing breaks.
  //    Costo IA is a manager screen, so the switch is flipped as Norte's manager.
  const asRafael = await page.evaluate(() => localStorage.getItem("cs:who"))
  const asManager = () => page.evaluate(() => localStorage.setItem("cs:who", '{"kind":"manager","team":"Farming Norte"}'))
  const asSpecialist = () => page.evaluate((w) => localStorage.setItem("cs:who", w!), asRafael)
  await asManager()
  await page.goto("/costo")
  const live = page.getByTestId("cost-live")
  await live.getByRole("switch").click()
  await expect(live).toContainText("IA apagada")
  await asSpecialist()
  await page.goto("/hoy")
  await expect(page.getByText("IA apagada").first()).toBeVisible()
  await expect(page.getByText(/Versión automática/).first()).toBeVisible()
  await asManager()
  await page.goto("/costo")
  await page.getByTestId("cost-live").getByRole("switch").click()
  await expect(page.getByTestId("cost-live")).not.toContainText("IA apagada")

  // 8. mark one "Sin respuesta", advance → it comes back under Seguimientos
  //    (no answer returns in 2 working days, so from Friday it takes two advances)
  await asSpecialist()
  await page.goto("/hoy")
  await page.getByRole("button", { name: "Empezar" }).click()
  const noAnswer = await focus.locator("h3").first().innerText()
  await page.keyboard.press("s")
  await page.keyboard.press("Escape")
  for (let k = 0; k < 2; k++) {
    await page.getByRole("button", { name: /Datos al|Día simulado/ }).click()
    await page.getByRole("button", { name: "Avanzar un día" }).click()
    await page.keyboard.press("Escape")
  }
  await expect(page.locator("#block-followup")).toContainText(noAnswer)
  await page.getByRole("button", { name: /Día simulado/ }).click()
  await page.getByRole("button", { name: /Volver al/ }).click()
  await page.keyboard.press("Escape")

  // 9. manager Norte → Resumen → the week → Explícame on grade D → click a count → it matches
  await page.evaluate(() => localStorage.setItem("cs:who", '{"kind":"manager","team":"Farming Norte"}'))
  await page.goto("/resumen")
  await expect(page.getByRole("heading", { name: "Qué pasó esta semana" })).toBeVisible()
  await page.getByRole("button", { name: /^Explícame: Tasa de grado D/ }).click()
  await expect(page.getByRole("dialog").filter({ hasText: "Explícame" }).locator("p").first()).toContainText(/gráfica de control/)
  await page.keyboard.press("Escape")
  const count = page.locator('[data-count="kpi:may_cancel"]')
  const n = (await count.innerText()).replace(/[^\d]/g, "")
  await count.click()
  await expect(page.getByTestId("doctors-count")).toHaveText(`${n} doctores`)

  // 10. EN → the same screen in English; drafts to doctors stay Spanish
  await page.goto("/resumen")
  await page.getByRole("radiogroup", { name: "Idioma" }).getByRole("radio", { name: "EN" }).click()
  await expect(page.getByRole("heading", { name: "Summary" })).toBeVisible()
  await page.evaluate(() => localStorage.setItem("cs:who", '{"kind":"specialist","id":"S01"}'))
  await page.goto(`/hoy`)
  await page.getByRole("button", { name: "Start" }).click()
  const focusEn = page.getByRole("dialog", { name: "Focus mode" })
  for (let i = 0; i < 20 && !(await focusEn.getByText("Draft to send").first().isVisible()); i++) await next(focusEn)
  await expect(focusEn.locator("textarea").first()).toHaveValue(/usted|Dra?\.|Doctor/)

  expect(errors).toEqual([])
})
