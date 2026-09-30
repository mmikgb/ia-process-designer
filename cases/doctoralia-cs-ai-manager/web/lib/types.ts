import type { I18n, Text } from "./tx"

export interface Meta {
  built_at: string
  source_file: string
  source_sha256_16: string
  extract_date: string
  asof: string
  queue_capacity: number
  followup_quota: number
  plays: { key: string; mode: "draft" | "brief" | "handoff"; label: I18n }[] // in PLAYS order
}

export interface KpiItem {
  key: string
  label: Text
  value: number | null
  prev: number | null
  delta_pct: number | null
  fmt: string
  good: "up" | "down"
  spark: number[]
  note: Text
  n: number | null // denominator of a rate; null for counts
  suppressed?: I18n // present when value and delta are withheld (n < RULES.min_n_rate)
}

export interface AttentionItem {
  key: string
  label: string
  doctors: number
  active: number
  churn: number
  lift: number
}

export interface SegmentItem {
  band: string
  n: number
  share: number
}

export interface Totals {
  active: number
  churned: number
  specialists: number
  doctors: number
}

export interface KpiBlock {
  asof: string
  window_days: number
  health_score: number
  health_note: string
  kpis: KpiItem[]
  attention: AttentionItem[]
  segments: SegmentItem[]
  totals: Totals
}

export interface WeeklyOnboarding {
  week: string
  n: number
  grade_d_rate: number
  avg_score: number
  activated: number
  struggling: number
}

export interface ActNowItem {
  doctor_id: string
  doctor_name: string
  specialty: string
  city: string
  owner_specialist_id: string
  top_signal: string
  days_of_lead_left: number
  tier: string
  risk_score: number
  quote: string
}

export interface WatchlistTiers {
  act_now: number
  watch: number
  overdue: number
}

/** One watchlist row. Every doctor with a live warning, not just the top 12. */
export interface WatchItem extends ActNowItem {
  days_elapsed: number
  lead_median: number
  overdue: boolean
  bookings_avg: number | null
  median_specialty_city: number | null
  signal_at: string
}

export interface Watchlist {
  tiers: WatchlistTiers
  act_now_top: ActNowItem[]
  items: WatchItem[]
}

export interface Specialist {
  id: string
  name: string
  team: string
}

/** Precomputed in Python for one portfolio: the whole book, a team, or one specialist. */
export interface Scope {
  periods: Record<string, KpiBlock>
  weekly_onboardings: WeeklyOnboarding[]
}

export interface Rules {
  calendar_healthy_slots: number
  escalation_pickup_target_min: number
  peer_low_percentile: number
  stale_contact_days: number
  extract_date: string
}

export interface SpcPoint {
  period: string
  value: number
  n?: number
  ucl: number
  lcl: number
  signals: string[]
}

export interface SpcChart {
  chart: "p" | "c" | "xmr"
  label: string
  center: number
  sigma?: number
  baseline: { from: string; to: string; frozen: boolean; n_points: number }
  points: SpcPoint[]
  stability: { stable: boolean; baseline_out_of_control: number; note: string }
}

export interface LeadTime {
  signal: string
  n: number
  before_churn: number
  median_days: number
  p25: number
  p75: number
}

export interface Day14Evidence {
  calendar_on_by_day_14: boolean
  n: number
  avg_score: number
  grade_a: number
  grade_d: number
  churn: number
}

export interface Predict {
  ceiling: { churned_total: number; with_warning: number; share: number; note: string }
  lead_times: LeadTime[]
  day14: {
    evidence: Day14Evidence[]
    checkpoint_day: number
    worklist_size: number
    live_cohort: boolean
    note: string
    retrospective: {
      failed_checkpoint: number
      of_those_grade_d: number
      grade_d_rate: number
      passed_grade_d_rate: number
    }
  }
}

export interface OverviewData {
  meta: Meta
  rules: Rules
  kpi: KpiBlock
  weekly_onboardings: WeeklyOnboarding[]
  periods: number[]
  specialists: Specialist[]
  teams: string[]
  scopes: Record<string, Scope>
  spc: Record<string, SpcChart>
  team: Team
  pulse: Pulse
  cost: Cost
  predict: Predict
  watchlist: Watchlist
}

export interface Cost {
  enabled: boolean
  reason: string
  estimate: {
    unique_notes_all: number
    unique_notes_untagged: number
    tokens_all: number
    tokens_untagged: number
    themes_usd: number
    summaries_doctors: number
    summaries_usd: number
    total_usd: number
  }
  prices: Record<string, { in: number; out: number }>
  batch_discount: number
  monthly_budget_usd: number | null
  notes_total: number | null
  farming_specialists: number
}

/** One doctor, as the panel shows it. Written per owner by bundle.py (out/doctors/<owner>.json). */
export type Flag =
  | "at_risk" | "may_cancel" | "discouraged" | "hollow" | "not_found"
  | "commitment" | "followup_due" | "calendar_off" | "grade_d" | "upsell"

export interface Contact {
  occurred_at: string
  channel: string
  direction: string
  specialist_id: string
  note: string | null
}

export interface Dossier {
  doctor_id: string
  doctor_name: string
  specialty: string
  city: string
  status: string
  signup_date: string | null
  churned_at: string | null
  owner_specialist_id: string
  onboarding_grade: string | null
  onboarding_score: number | null
  closed_at_cap: boolean | null
  sig_onboarding_no_show: boolean | null
  calendar_enabled: boolean | null
  weekly_slots_published: number | null
  bookings_avg: number | null
  bookings_per_slot: number | null
  pct_specialty_city: number | null
  median_specialty_city: number | null
  days_since_contact: number | null
  risk_score: number
  risk_reasons_i18n: { key: string; text: I18n }[]
  top_signal: string | null
  top_signal_at: string | null
  top_signal_note: string | null
  bookings: { month: string; patient_bookings: number; admin_bookings: number }[]
  bookings_last: number | null
  bookings_prev: number | null
  contacts: Contact[] // newest first, at most 6
  contacts_all?: Contact[] // every contact, newest first; absent when `contacts` already is every contact
  campaigns: { campaign_id: string; name: string | null; enrolled_at: string; engaged: boolean; converted: boolean | null }[]
  escalations: { escalated_at: string; minutes_to_pickup: number; converted: boolean; handler: string }[]
  followup: { due_at: string; kind: string; note: string; set_at: string; set_by: string } | null
  flags: Flag[]
  copilot: {
    mode: "draft" | "brief" | "handoff" | null
    play: string | null
    draft: string | null // always Spanish (usted)
    confident: boolean
    confidence: number
    // English and Spanish for everything the specialist reads (the English is only here)
    i18n: { why: I18n | null; ask: I18n | null; instead: I18n | null; channel: I18n | null; gaps: I18n[] }
  }
}

// public/queue/<owner>.json (SPEC §5.1)
export type Block = "call" | "followup" | "message" | "handoff" | "later"
export interface QueueItem {
  doctor_id: string
  doctor_name: string
  specialty: string
  city: string
  block: Block
  rank: number // 1..n within the owner's day
  play: string | null
  mode: "draft" | "brief" | "handoff" | null
  reason: I18n // one line, "why today"
  risk_score: number
  due_at?: string // follow-ups
  signal_at?: string // calls
  lead_median?: number
  days_of_lead_left?: number // at asof; the UI subtracts dayOffset
  confident: boolean
  later_reason?: I18n // why it is not in today's plan
  origin?: "followup" | "message" | null // later items pushed out by capacity: the block they came from
}
export interface QueueFile {
  owner: string
  asof: string
  capacity: number
  followup_quota: number
  counts: Record<Block, number> // before capacity is applied
  items: QueueItem[] // ordered: call, followup, message, handoff, later
}

// public/search.json (SPEC §5.2), written with short keys to stay under 1 MB
export interface SearchRowRaw {
  i: string // id
  n: string // name
  s: string // specialty
  c: string // city
  o: string // owner
  st: "active" | "churned" // status
  p: string | null // play
  m: string | null // mode
  r: number // risk
  f: Flag[] // flags
}
export interface SearchRow {
  id: string; name: string; specialty: string; city: string
  owner: string; status: "active" | "churned"
  play: string | null; mode: string | null; risk: number
  flags: Flag[]
}
export const searchRow = (x: SearchRowRaw): SearchRow => ({
  id: x.i, name: x.n, specialty: x.s, city: x.c, owner: x.o, status: x.st,
  play: x.p, mode: x.m, risk: x.r, flags: x.f,
})

export interface TeamRow {
  id: string
  name: string
  team: string
  portfolio: number
  at_risk: number
  at_risk_share: number | null
  may_cancel: number
  hollow: number
  not_found: number
  open_commitments: number
  escalations: number
  median_pickup: number | null
  within_target: number | null
  converted: number | null
  converted_when_fast: number | null
  pickup_weeks: (number | null)[]
}

export interface Team {
  rows: TeamRow[]
  weeks: string[]
  buckets: { bucket: string; n: number; converted: number }[]
  target_min: number
  min_escalations: number
  unowned: { n: number; by_queue: Record<string, number> }
}

export interface PulseRow {
  key: string
  label: string
  unit: "per day" | "rate"
  points: { date: string; n: number | null; r7: number | null }[]
  zero_days?: string[]
  zero_pattern?: string | null
}

export interface Pulse {
  end: string
  rows: PulseRow[]
  events: { date: string; label: string; kind: string }[]
  bookings_monthly: { month: string; patient_bookings: number; doctors: number; per_doctor: number }[]
  note: string
}
