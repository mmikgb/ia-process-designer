import { expect, test } from "@playwright/test"

// The features brought over from the master branch: compare with, sortable doctors with
// bookings, conversations with up to three open, the risk table, manager-only screens.
const S01 = '{"kind":"specialist","id":"S01"}'
const NORTE = '{"kind":"manager","team":"Farming Norte"}'
const as = (page: import("@playwright/test").Page, who: string) =>
  page.addInitScript((w) => {
    localStorage.setItem("cs:who", w)
    localStorage.setItem("cs:locale", "es")
  }, who)

test("Resumen compares a specialist with their team, per 100 active doctors", async ({ page }) => {
  await as(page, S01)
  await page.goto("/resumen")
  const group = page.getByRole("radiogroup", { name: "Comparar con" })
  await expect(group.getByRole("radio")).toHaveText(["Periodo anterior", "Mi equipo", "Toda la cartera", "Base mar–jun"])
  await group.getByRole("radio", { name: "Mi equipo" }).click()
  await expect(page.getByText(/vs Mi equipo · .* por 100 activos/).first()).toBeVisible()
})

test("a team has no team to compare with", async ({ page }) => {
  await as(page, NORTE)
  await page.goto("/resumen")
  await expect(page.getByRole("radiogroup", { name: "Comparar con" }).getByRole("radio")).toHaveText(["Periodo anterior", "Toda la cartera", "Base mar–jun"])
})

test("doctors sort by bookings a month, missing values last", async ({ page }) => {
  await as(page, S01)
  await page.goto("/doctores")
  await page.getByRole("button", { name: "Ordenar por Citas/mes · pares" }).click()
  await expect(page).toHaveURL(/sort=bookings&dir=desc/)
  const cells = page.getByTestId("doctors-rows").locator("tr td:nth-child(5)")
  const first = Number((await cells.nth(0).innerText()).split("·")[0].replace(",", "."))
  const second = Number((await cells.nth(1).innerText()).split("·")[0].replace(",", "."))
  expect(first).toBeGreaterThanOrEqual(second)
})

test("conversations: three open side by side, a fourth closes the oldest", async ({ page }) => {
  await as(page, S01)
  await page.goto("/conversaciones")
  const inbox = page.getByTestId("conv-inbox").getByRole("button")
  for (let i = 0; i < 4; i++) await inbox.nth(i).click()
  await expect(page.getByTestId("conv-pane")).toHaveCount(3)
  await expect(page).toHaveURL(/open=/)
  const pane = page.getByTestId("conv-pane").first()
  await pane.getByRole("textbox").fill("Hola doctor")
  await expect(pane.getByRole("link", { name: /WhatsApp/ })).toHaveAttribute("href", /wa\.me\/\?text=Hola%20doctor/)
  await pane.getByRole("button", { name: "Cerrar conversación" }).click()
  await expect(page.getByTestId("conv-pane")).toHaveCount(2)
})

test("the doctor sheet shows how risk is computed", async ({ page }) => {
  await as(page, S01)
  await page.goto("/hoy?doctor=D01184")
  await page.getByRole("button", { name: "¿Cómo se calcula?" }).click()
  await expect(page.getByTestId("risk-rules").locator("tbody tr")).toHaveCount(9)
})

test("manager screens are closed to a specialist and hidden from the menu", async ({ page }) => {
  await as(page, S01)
  for (const path of ["/equipo", "/pulse", "/control", "/costo"]) {
    await page.goto(path)
    await expect(page.getByTestId("managers-only"), path).toBeVisible()
  }
  await expect(page.locator('a[href="/equipo"]')).toHaveCount(0)
  await as(page, NORTE)
  await page.goto("/equipo")
  await expect(page.getByTestId("managers-only")).toHaveCount(0)
})
