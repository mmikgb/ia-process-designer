import { expect, test, type Page } from "@playwright/test"

// T5.6: in Spanish, no screen shows interface English. Data stays as written (doctor names,
// notes, a campaign's own title), so the list is interface words only, whole words, case
// sensitive where Spanish uses the same letters ("Doctor" is Spanish too).
const ENGLISH = [
  "Doctors", "Escalation", "Escalations", "Overview", "Portfolio", "Signals", "Churn", "churned", "Active",
  "Specialist", "Specialists", "Show", "Median", "Weekly", "Daily", "baseline", "Settings", "Budget", "Calls",
  "Today", "Search", "Summary", "Follow-up", "overdue", "Health", "Healthy", "Critical", "Watch", "Rule",
  "limits", "centre", "signal", "the", "and", "with", "of",
]
const pattern = new RegExp(`(^|[^\\p{L}])(${ENGLISH.join("|")})(?=$|[^\\p{L}])`, "u")

async function englishOn(page: Page, path: string) {
  await page.goto(path)
  await page.waitForLoadState("networkidle")
  await page.waitForTimeout(600)
  const text = await page.locator("body").innerText()
  const hits = text.split("\n").filter((l) => pattern.test(l))
  return hits.map((l) => `${path}: ${l.trim().slice(0, 140)}`)
}

for (const [who, id] of [
  ['{"kind":"manager","team":"Farming Norte"}', "manager"],
  ['{"kind":"specialist","id":"S01"}', "specialist"],
] as const) {
  test(`no interface English in Spanish (${id})`, async ({ page }) => {
    await page.addInitScript((w) => {
      localStorage.setItem("cs:who", w)
      localStorage.setItem("cs:locale", "es")
    }, who)
    const hits: string[] = []
    for (const path of ["/hoy", "/doctores", "/senales", "/resumen", "/equipo", "/pulse", "/control", "/costo", "/hoy?doctor=D01184"]) {
      hits.push(...(await englishOn(page, path)))
    }
    expect(hits).toEqual([])
  })
}
