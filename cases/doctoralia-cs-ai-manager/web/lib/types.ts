export interface Meta {
  built_at: string
  source_file: string
  source_sha256_16: string
  extract_date: string
}

export interface KpiItem {
  key: string
  label: string
  value: number
  prev: number | null
  delta_pct: number | null
  fmt: string
  good: "up" | "down"
  spark: number[]
  note: string
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
  predict: Predict
  watchlist: Watchlist
}
