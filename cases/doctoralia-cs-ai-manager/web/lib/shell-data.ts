// Server-safe: app/(shell)/layout.tsx calls shellData() while rendering.
import type { I18n } from "@/lib/tx"
import type { OverviewData } from "@/lib/types"

export interface ShellData {
  asof: string
  meta: OverviewData["meta"]
  specialists: OverviewData["specialists"]
  managers: { team: string; name: string }[]
  teams: string[]
  /** active doctors and doctors at risk per scope key ("all", "team:<name>", "S01"), last 30 days */
  books: Record<string, { active: number; atRisk: number }>
  plays: { key: string; mode: string; label: I18n }[]
  ai: { enabled: boolean; reason: I18n | string }
}

export function shellData(o: OverviewData): ShellData {
  const books: ShellData["books"] = {}
  for (const [k, v] of Object.entries(o.scopes)) {
    const p = v.periods["30"] ?? Object.values(v.periods)[0]
    const atRisk = p.kpis.find((x) => x.key === "at_risk")?.value ?? 0
    books[k] = { active: p.totals.active, atRisk }
  }
  return {
    asof: o.meta.asof ?? o.meta.extract_date,
    meta: o.meta,
    specialists: o.specialists,
    managers: o.managers ?? [],
    teams: o.teams,
    books,
    plays: o.meta.plays ?? [],
    ai: { enabled: o.cost.enabled, reason: o.cost.reason },
  }
}

