import type { OverviewData, WatchItem } from "@/lib/types"

export type Role = "manager" | "specialist"
export type Tier = "act_now" | "watch" | "overdue" | "all"
export type SortKey = "lead" | "risk"

export interface Filters {
  role: Role
  scope: string // "all" | "team:<name>" | specialist id
  period: string // "30" | "60" | "90"
  tier: Tier
  signal: string // "all" | a top_signal key
  sort: SortKey
  showHandled: boolean
}

export const SIGNAL_LABEL: Record<string, string> = {
  churn_threat: "May cancel",
  discouraged: "Discouraged",
  complaint_no_patients: "No patients",
  complaint_noshow: "No-shows",
}

export const TIER_LABEL: Record<Exclude<Tier, "all">, string> = {
  act_now: "Act now",
  watch: "Watch",
  overdue: "Overdue",
}

export function defaultFilters(data: OverviewData): Filters {
  return {
    role: "manager",
    scope: "all",
    period: String(data.kpi.window_days),
    tier: "act_now",
    signal: "all",
    sort: "lead",
    showHandled: false,
  }
}

/** The specialist ids whose doctors belong to a scope. */
export function scopeOwners(data: OverviewData, scope: string): Set<string> {
  if (scope === "all") return new Set(data.specialists.map((s) => s.id))
  if (scope.startsWith("team:")) {
    const team = scope.slice(5)
    return new Set(data.specialists.filter((s) => s.team === team).map((s) => s.id))
  }
  return new Set([scope])
}

export function scopeLabel(data: OverviewData, scope: string): string {
  if (scope === "all") return "Whole portfolio"
  if (scope.startsWith("team:")) return scope.slice(5)
  return data.specialists.find((s) => s.id === scope)?.name ?? scope
}

// ---- done / snooze -------------------------------------------------------
// Kept in this browser only. The plan puts this in out/state.db behind the
// Streamlit app; a static web build has no server, so it lives here for now.

export interface Handled {
  state: "done" | "snoozed"
  at: string // ISO date it was marked
  until?: string // ISO date a snooze ends
}

const STORE = "cs-control-room:handled:v1"

export function loadHandled(): Record<string, Handled> {
  try {
    const raw = window.localStorage.getItem(STORE)
    return raw ? (JSON.parse(raw) as Record<string, Handled>) : {}
  } catch {
    return {}
  }
}

export function saveHandled(h: Record<string, Handled>) {
  try {
    window.localStorage.setItem(STORE, JSON.stringify(h))
  } catch {
    // private window or blocked storage: the list still works, it just forgets
  }
}

export function isHandled(h: Handled | undefined, now: Date): boolean {
  if (!h) return false
  if (h.state === "done") return true
  return !!h.until && new Date(h.until) > now
}

/** Rows for the worklist: scope, tier, signal, handled, then sort. Filtering only — no metrics. */
export function worklist(
  data: OverviewData,
  f: Filters,
  handled: Record<string, Handled>,
  now: Date,
): WatchItem[] {
  const owners = scopeOwners(data, f.scope)
  const rows = data.watchlist.items.filter(
    (w) =>
      owners.has(w.owner_specialist_id) &&
      (f.tier === "all" || w.tier === f.tier) &&
      (f.signal === "all" || w.top_signal === f.signal) &&
      (f.showHandled || !isHandled(handled[w.doctor_id], now)),
  )
  // Lead time left says who you lose by Friday; risk says who is worst.
  // Overdue rows have no lead left, so they fall back to risk.
  return rows.sort((a, b) =>
    f.sort === "lead"
      ? a.days_of_lead_left - b.days_of_lead_left || b.risk_score - a.risk_score
      : b.risk_score - a.risk_score || a.days_of_lead_left - b.days_of_lead_left,
  )
}
