import type { OverviewData, WatchItem } from "@/lib/types"

export type Tier = "act_now" | "at_risk" | "watch" | "overdue" | "all"
export type Action = "all" | "brief" | "draft" | "handoff"
export type Compare = "prev" | "team" | "all" | "baseline"
export type SortKey = "lead" | "risk" | "name" | "bookings" | "contact" | "action" | "signal" | "owner"
export type SortDir = "asc" | "desc"

export interface Filters {
  scope: string // "all" | "team:<name>" | specialist id
  period: string // KPI window; fixed at 30 days
  compare: Compare
  tier: Tier
  signal: string // "all" | a top_signal key
  action: Action
  sortKey: SortKey
  sortDir: SortDir
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
  at_risk: "At risk",
  watch: "Watch",
  overdue: "Overdue",
}

export const TIER_HINT: Record<Exclude<Tier, "all">, string> = {
  act_now: "A warning note, still inside the window it usually gives",
  at_risk: "Risk 50% or more, with or without a note — the same doctors as the at-risk count",
  watch: "A weaker warning note, still in its window",
  overdue: "Past the usual warning window; kept visible so an empty list is never read as good news",
}

export const ACTION_LABEL: Record<Exclude<Action, "all">, string> = {
  brief: "Call",
  draft: "Message",
  handoff: "Route",
}

export const COMPARE_LABEL: Record<Compare, string> = {
  prev: "Previous 30 days",
  team: "My team",
  all: "Whole portfolio",
  baseline: "Baseline Mar–Jun",
}

export function defaultFilters(data: OverviewData, scope = "all"): Filters {
  return {
    scope,
    period: String(data.kpi.window_days),
    compare: "prev",
    tier: "act_now",
    signal: "all",
    action: "all",
    sortKey: "lead",
    sortDir: "asc",
    showHandled: false,
  }
}

/** The comparisons a scope can make: a specialist against their team and the book, a team against the book. */
export function compareOptions(scope: string): Compare[] {
  if (scope === "all") return ["prev", "baseline"]
  if (scope.startsWith("team:")) return ["prev", "all", "baseline"]
  return ["prev", "team", "all", "baseline"]
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

// Filters survive moving between screens in this tab ("cross-screen filters persist").
const FILTERS = "cs-control-room:filters:v2"

export function loadFilters(data: OverviewData): Filters | null {
  try {
    const raw = window.sessionStorage.getItem(FILTERS)
    if (!raw) return null
    const f = { ...defaultFilters(data), ...(JSON.parse(raw) as Partial<Filters>) }
    // A rebuild can drop a specialist; fall back rather than show nothing.
    if (!data.scopes[f.scope]) f.scope = "all"
    if (!compareOptions(f.scope).includes(f.compare)) f.compare = "prev"
    return f
  } catch {
    return null
  }
}

export function saveFilters(f: Filters) {
  try {
    window.sessionStorage.setItem(FILTERS, JSON.stringify(f))
  } catch {
    // storage blocked: filters still work, they just reset on navigation
  }
}

// ---- done / snooze -------------------------------------------------------
// Kept in this browser only. The plan puts this in out/state.db behind the
// Streamlit app; a static web build has no server, so it lives here for now.

export interface Handled {
  state: "done" | "snoozed"
  at: string // ISO date it was marked
  until?: string // ISO date a snooze ends
  via?: "whatsapp" | "call" // how it was handled, when the app knows
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

export function inTier(w: WatchItem, tier: Tier): boolean {
  if (tier === "all") return true
  if (tier === "at_risk") return w.status === "active" && w.risk_score >= 0.5
  return w.tier === tier
}

const ACTION_ORDER: Record<string, number> = { brief: 0, draft: 1, handoff: 2, none: 3 }

// Missing values always sort last, whichever way the column is ordered.
function cmp(a: number | string | null | undefined, b: number | string | null | undefined, dir: SortDir): number {
  const na = a == null || a === ""
  const nb = b == null || b === ""
  if (na || nb) return na === nb ? 0 : na ? 1 : -1
  const r = typeof a === "string" ? a.localeCompare(String(b), "es") : (a as number) - (b as number)
  return dir === "asc" ? r : -r
}

function sortValue(w: WatchItem, k: SortKey, owners: Record<string, string>): number | string | null {
  switch (k) {
    case "lead":
      return w.days_of_lead_left
    case "risk":
      return w.risk_score
    case "name":
      return w.doctor_name
    case "bookings":
      return w.bookings_avg
    case "contact":
      return w.days_since_contact
    case "action":
      return ACTION_ORDER[w.action] ?? 9
    case "signal":
      return SIGNAL_LABEL[w.top_signal ?? ""] ?? w.top_signal
    case "owner":
      return owners[w.owner_specialist_id] ?? w.owner_specialist_id
  }
}

/** Rows for the worklist: scope, tier, signal, action, handled, then sort. Filtering only — no metrics. */
export function worklist(
  data: OverviewData,
  f: Filters,
  handled: Record<string, Handled>,
  now: Date,
): WatchItem[] {
  const owners = scopeOwners(data, f.scope)
  const names = Object.fromEntries(data.specialists.map((s) => [s.id, s.name]))
  const rows = data.watchlist.items.filter(
    (w) =>
      owners.has(w.owner_specialist_id) &&
      inTier(w, f.tier) &&
      (f.signal === "all" || w.top_signal === f.signal) &&
      (f.action === "all" || w.action === f.action) &&
      (f.showHandled || !isHandled(handled[w.doctor_id], now)),
  )
  // Default: lead time left (who you lose first), then risk. Ties fall back to risk.
  return rows.sort(
    (a, b) =>
      cmp(sortValue(a, f.sortKey, names), sortValue(b, f.sortKey, names), f.sortDir) ||
      b.risk_score - a.risk_score,
  )
}
