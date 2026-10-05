import type { I18n, Text } from "./tx"

export interface Meta {
  built_at: string
  source_file: string
  source_sha256_16: string
  extract_date: string
  asof?: string
  queue_capacity?: number
  followup_quota?: number
  plays?: { key: string; mode: "draft" | "brief" | "handoff"; label: I18n }[] // in PLAYS order
  web_schema?: number
  /** the segments bar's cuts, [lo, hi); /doctores?risk_band= uses the same */
  risk_bands?: { key: string; label: Text; lo: number; hi: number }[]
  flag_bits?: string[]
  signal_bits?: string[]
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
  label: Text
  doctors: number
  active: number
  churn: number
  lift: number
}

export interface SegmentItem {
  key?: string // healthy | watch | at_risk | critical (meta.risk_bands)
  band: Text
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
  health_note: Text
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
/** One KPI of this scope against a reference, precomputed in kpi.py scopes(). */
export interface CompareCell {
  mine: number
  ref: number
  unit: "value" | "per100" // counts are compared per 100 active doctors
  delta_pct: number | null
}

export type CompareRef = "team" | "all" | "baseline"

export interface Scope {
  periods: Record<string, KpiBlock>
  weekly_onboardings: WeeklyOnboarding[]
  /** KPI key -> this scope against its team, the whole book, or the Mar–Jun baseline. */
  compare?: Partial<Record<CompareRef, Record<string, CompareCell>>>
}

export interface Rules {
  calendar_healthy_slots: number
  escalation_pickup_target_min: number
  peer_low_percentile: number
  stale_contact_days: number
  extract_date: string
  min_n_rate?: number // below this many cases a rate is withheld; show the count
  followup_stale_days?: number
}

export interface SpcPoint {
  period: string
  value: number
  n?: number
  ucl: number
  lcl: number
  signals: string[]
  eligible?: boolean
}

export interface SpcChart {
  chart: "p" | "c" | "xmr"
  label: Text
  available?: boolean
  data_note?: Text
  min_n?: number
  excluded_points?: number
  snapshot?: { hollow: number; n: number }
  /** the headline: a signal in the last 28 days, or none (spc.finding) */
  finding?: Text
  center: number
  sigma?: number
  baseline: { from: string; to: string; frozen: boolean; n_points: number }
  points: SpcPoint[]
  stability: { stable: boolean | null; baseline_out_of_control: number; note: Text }
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
  ceiling: { churned_total: number; with_warning: number; share: number; note: Text }
  lead_times: LeadTime[]
  day14: {
    evidence: Day14Evidence[]
    checkpoint_day: number
    worklist_size: number
    live_cohort: boolean
    note: Text
    retrospective: {
      failed_checkpoint: number
      of_those_grade_d: number
      grade_d_rate: number
      passed_grade_d_rate: number
    }
  }
}

/** One note theme on Señales (bundle web_view "themes", from insight.rules_themes). */
export interface Theme {
  tag: string
  label: Text
  notes: number
  doctors: number
  churn: number
  lift: number
  trend: { month: string; n: number }[]
  examples: string[]
}

/** How the risk score is built: the table pipeline.risk() adds up (RISK_WEIGHTS). */
export interface RiskRules {
  baseline_churn: number
  cap: number
  rules: { key: string; points: number; label: I18n; doctors: number; churn: number; lift: number }[]
}

export interface OverviewData {
  risk: RiskRules
  meta: Meta
  rules: Rules
  kpi: KpiBlock
  weekly_onboardings: WeeklyOnboarding[]
  periods: number[]
  specialists: Specialist[]
  teams: string[]
  managers?: { team: string; name: string }[]
  scopes: Record<string, Scope>
  spc: Record<string, SpcChart>
  team: Team
  pulse: Pulse
  cost: Cost
  themes?: Theme[]
  predict: Predict
  watchlist: Watchlist
}

export interface Cost {
  enabled: boolean
  reason: Text
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
  /** src/llm.py usage_estimate(): the daily tool's monthly cost, before prompt-cache savings */
  usage_v2: {
    rows: { task: string; tier: "fast" | "deep"; model: string; per_day: number; tokens_in: number; tokens_out: number; note: string | null; usd_per_call: number; usd_month: number }[]
    working_days: number
    specialists: number
    per_specialist_usd: number
    team_usd: number
    recommended_budget_usd: number
  }
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
  onboarding_closed_at?: string | null
  calendar_enabled_at?: string | null
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
  // For the live re-cut (lib/dayplan.ts mirrors src/dayplan.py plan()): the blocks this
  // doctor can occupy in priority order, the order inside each, and the line for each.
  claims: Exclude<Block, "later">[]
  ranks: Partial<Record<Block, number>>
  reasons: Partial<Record<Block, I18n>>
  later_kind?: "past_lead" | "watch" | "thin"
}
export interface QueueFile {
  owner: string
  asof: string
  capacity: number
  followup_quota: number
  followup_stale_days: number
  counts: Record<Block, number> // before capacity is applied
  items: QueueItem[] // ordered: call, followup, message, handoff, later
}

// public/search.json (SPEC §5.2), written with short keys and bitmasks to stay under 1 MB
export interface SearchRowRaw {
  i: string // id
  n: string // name
  s: string // specialty
  c: string // city
  o: string // owner
  st?: "churned" // status; absent = active
  p: string | null // play
  m: string | null // mode
  r: number // risk
  f: number // flags, bit n = FLAG_BITS[n]
  lc?: number // days since the last contact, at the data date; absent = never
  fu?: number // days until the open follow-up is due (negative = overdue); absent = none
  a?: number // attention signals, bit n = SIGNAL_BITS[n]; absent = none
  b?: number // patient bookings a month, on average; absent = no bookings history
  pm?: number // median of the same specialty and city; absent = no peers
}
export interface SearchRow {
  id: string; name: string; specialty: string; city: string
  owner: string; status: "active" | "churned"
  play: string | null; mode: string | null; risk: number
  flags: Flag[]
  lastContact: number | null
  followup: number | null
  signals: string[]
  bookings: number | null
  peers: number | null
}
// The bit orders, copied from src/dayplan.py FLAGS and src/kpi.py ATTENTION (overview.json
// meta.flag_bits / meta.signal_bits); tests/search.test.ts fails if they drift.
export const FLAG_BITS: Flag[] = [
  "at_risk", "may_cancel", "discouraged", "hollow", "not_found", "commitment",
  "followup_due", "calendar_off", "grade_d", "upsell",
]
export const SIGNAL_BITS = ["churn_threat", "discouraged", "grade_d", "bottom_q", "calendar_off", "complaint"]
const bits = <T,>(v: number | undefined, order: readonly T[]): T[] => order.filter((_, n) => ((v ?? 0) >> n) & 1)
export const searchRow = (x: SearchRowRaw): SearchRow => ({
  id: x.i, name: x.n, specialty: x.s, city: x.c, owner: x.o, status: x.st ?? "active",
  play: x.p, mode: x.m, risk: x.r, flags: bits(x.f, FLAG_BITS),
  lastContact: x.lc ?? null, followup: x.fu ?? null, signals: bits(x.a, SIGNAL_BITS),
  bookings: x.b ?? null, peers: x.pm ?? null,
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
  label: Text
  unit: "per day" | "rate"
  points: { date: string; n: number | null; r7: number | null }[]
  zero_days?: string[]
  zero_pattern?: Text | null
  /** the headline: the last 7-day average against four weeks earlier (series._finding) */
  finding?: Text | null
}

export interface Pulse {
  end: string
  rows: PulseRow[]
  events: { date: string; label: Text; kind: string }[]
  bookings_monthly: { month: string; patient_bookings: number; doctors: number; per_doctor: number }[]
  note: Text
}
