import { expect, test } from "@playwright/test"

// WhatsApp: the draft opens in WhatsApp with the text ready. ElevenLabs: "Escuchar" reads
// the morning aloud; with no key the button is not there, with CS_AI_MOCK=1 it plays a
// silent clip through the same route.
const MOCK = process.env.CS_AI_MOCK === "1"

test("a draft opens in WhatsApp with its text", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("cs:who", '{"kind":"specialist","id":"S04"}'))
  await page.goto("/hoy")
  await page.getByRole("button", { name: "Empezar" }).click()
  const focus = page.getByRole("dialog", { name: "Modo ráfaga" })
  for (let i = 0; i < 20 && !(await focus.getByText("Borrador para enviar").first().isVisible()); i++) {
    const at = Number((await focus.getByText(/^\d+ de \d+$/).innerText()).split(" ")[0])
    await page.keyboard.press("ArrowRight")
    await expect(focus.getByText(new RegExp(`^${at + 1} de \\d+$`))).toBeVisible()
  }
  const draft = await focus.locator("textarea").first().inputValue()
  const link = focus.getByRole("link", { name: "Enviar por WhatsApp" })
  await expect(link).toHaveAttribute("href", `https://wa.me/?text=${encodeURIComponent(draft)}`)
  await expect(link).toHaveAttribute("target", "_blank")
})

test("the morning can be heard (ElevenLabs)", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("cs:who", '{"kind":"specialist","id":"S04"}'))
  await page.goto("/hoy")
  const listen = page.getByRole("button", { name: "Escuchar" })
  if (!MOCK) {
    await expect(page.getByRole("heading", { name: "Tu día" })).toBeVisible()
    await expect(listen).toHaveCount(0)
    return
  }
  await expect(listen).toBeVisible({ timeout: 15_000 })
  const audio = page.waitForResponse((r) => r.url().endsWith("/api/ai/speak"))
  await listen.click()
  const r = await audio
  expect(r.status()).toBe(200)
  expect(r.headers()["content-type"]).toContain("audio/")
  await expect(page.getByText("No se pudo generar el audio.")).toHaveCount(0)
})
