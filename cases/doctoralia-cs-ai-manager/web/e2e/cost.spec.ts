import { expect, test } from "@playwright/test"

// T4.8: the live panel reads /api/ai/status; the kill switch and the budget write settings.
// On: "Sin llave de API" with no key, "IA de prueba" with CS_AI_MOCK=1.
const ON = process.env.CS_AI_MOCK === "1" ? "IA de prueba" : "Sin llave de API"

test("cost: live panel, kill switch and budget", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("cs:who", '{"kind":"manager","team":"Farming Norte"}'))
  await page.goto("/costo")
  const live = page.getByTestId("cost-live")
  await expect(live).toContainText(ON)
  await expect(page.getByText("$3.60", { exact: true })).toBeVisible()

  const sw = live.getByRole("switch")
  await sw.click()
  await expect(live).toContainText("IA apagada")
  await expect(sw).toHaveAttribute("aria-checked", "false")
  await sw.click()
  await expect(live).toContainText(ON)

  await live.getByLabel("Presupuesto mensual (USD)").fill("75")
  await live.getByRole("button", { name: "Guardar" }).click()
  await expect(live).toContainText("$0 de $75.00")
  await page.reload()
  await expect(page.getByTestId("cost-live").getByLabel("Presupuesto mensual (USD)")).toHaveValue("75")
})
