// T4.5 "Explícame" (fast model): one block only (a KPI, a control chart, a team row, an
// attention signal): what it measures, whether the change is real or noise and why (n,
// limits), what to do. At most three sentences.
import { z } from "zod"
import { DEFINITIONS, O, RULES, kpiBlock, spcSummary } from "@/lib/ai/context"
import type { TaskSpec } from "@/lib/ai/gateway"
import type { Locale } from "@/lib/tx"

export const ExplainInput = z.object({
  kind: z.enum(["kpi", "spc", "team_row", "signal", "pulse"]),
  key: z.string().max(60),
  scope: z.string().regex(/^(all|team:[\w ]+|S\d+)$/).default("all"),
  period: z.string().regex(/^\d+$/).default("30"),
  locale: z.enum(["es", "en"]).default("es"),
  actor: z.string().max(40).optional(),
  refresh: z.boolean().optional(),
})
export type ExplainInput = z.infer<typeof ExplainInput>

// Which control chart speaks to which KPI.
const KPI_CHART: Record<string, string> = {
  grade_d: "onboarding_grade_d_daily",
  onb_score: "onboarding_score_weekly",
  sla: "pickup_weekly",
  conversion: "pickup_weekly",
}
const SIGNAL_LEAD: Record<string, string> = { churn_threat: "churn_threat", discouraged: "discouraged", complaint: "complaint_no_patients" }

const T = (l: Locale, en: string, es: string) => (l === "es" ? es : en)
const pct = (v: number) => `${Math.round(v * 1000) / 10}%`

async function context(i: ExplainInput) {
  const base = { rules: RULES(), definitions: DEFINITIONS, min_n_for_a_rate: 10 }
  const charts = spcSummary(O.meta.extract_date, i.locale)
  if (i.kind === "kpi") {
    const periods = (O.scopes[i.scope] ?? O.scopes.all).periods
    const k = kpiBlock(i.scope, i.locale)
    const item = (periods[i.period] ?? periods["30"]).kpis.find((x) => x.key === i.key)
    const same = k.kpis.find((x) => x.key === i.key)
    return {
      ...base,
      block: same && item ? { ...same, value: item.value, prev: item.prev, delta_pct: item.delta_pct, n: item.n, window_days: Number(i.period) } : null,
      control_chart: charts.find((c) => c.key === KPI_CHART[i.key]) ?? null,
      lift: i.key === "may_cancel" ? O.kpi.attention.find((a) => a.key === "churn_threat") ?? null : null,
    }
  }
  if (i.kind === "spc") {
    const c = O.spc[i.key]
    const note = c?.stability.note
    return {
      ...base,
      block: charts.find((x) => x.key === i.key) ?? null,
      baseline: c?.baseline ?? null,
      stability_note: note && typeof note === "object" ? note[i.locale] : (note ?? null),
    }
  }
  if (i.kind === "pulse") {
    const tx = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, string>)[i.locale] : (v as string | null))
    const row = O.pulse.rows.find((r) => r.key === i.key)
    const r7 = row ? row.points.filter((p) => p.r7 != null) : []
    const last = r7[r7.length - 1]
    const before = r7[r7.length - 1 - 28]
    return {
      ...base,
      block: row
        ? {
            label: tx(row.label),
            unit: row.unit,
            finding: tx(row.finding ?? null),
            last_7day_average: last ? { date: last.date, value: last.r7 } : null,
            four_weeks_earlier: before ? { date: before.date, value: before.r7 } : null,
            zero_days: row.zero_days?.length ?? 0,
            zero_pattern: tx(row.zero_pattern ?? null),
          }
        : null,
      note: tx(O.pulse.note),
      rule: T(i.locale, "Pulse only describes; whether a move is real is decided on the Control screen.", "Pulse solo describe; si un movimiento es real se decide en Control."),
    }
  }
  if (i.kind === "team_row") {
    const row = O.team.rows.find((r) => r.id === i.key)
    return { ...base, block: row ?? null, conversion_by_pickup: O.team.buckets, pickup_target_min: O.team.target_min, min_escalations: O.team.min_escalations }
  }
  const a = O.kpi.attention.find((x) => x.key === i.key)
  return {
    ...base,
    block: a ?? null,
    baseline_churn: O.kpi.totals.churned / Math.max(O.kpi.totals.doctors, 1),
    lead_time: O.predict.lead_times.find((l) => l.signal === SIGNAL_LEAD[i.key]) ?? null,
  }
}

function fallback(ctx: unknown, i: ExplainInput): string {
  const c = ctx as Record<string, unknown> & { block: Record<string, unknown> | null }
  const L = i.locale
  const b = c.block
  if (!b) return T(L, "This block is not in the current build.", "Este bloque no está en la versión actual de los datos.")
  if (i.kind === "kpi") {
    const chart = c.control_chart as { verdict: string; label: string } | null
    const note = String(b.suppressed ?? b.note ?? "").trim()
    const parts = [note ? `${b.label}: ${note.replace(/\.?$/, ".")}` : `${b.label}.`]
    if (b.n != null) parts.push(T(L, `Based on ${b.n} cases.`, `Con base en ${b.n} casos.`))
    parts.push(
      !chart
        ? T(L, "There is no control chart for it: read the change as a trend, not as a signal.", "No tiene gráfica de control: lee el cambio como tendencia, no como señal.")
        : chart.verdict === "signal"
          ? T(L, `The control chart flags a real change (${chart.label}).`, `La gráfica de control marca un cambio real (${chart.label}).`)
          : T(L, "The control chart shows normal variation.", "La gráfica de control muestra variación normal."),
    )
    return parts.filter(Boolean).join(" ")
  }
  if (i.kind === "spc") {
    const n = (b.signals_last_28_days as unknown[]).length
    return n
      ? T(L, `${n} point(s) outside the normal range in the last 28 days: worth a question.`, `${n} punto(s) fuera del rango normal en los últimos 28 días: vale la pena preguntar.`) + ` ${c.stability_note ?? ""}`
      : T(L, "No signal in the last 28 days: normal variation.", "Sin señales en los últimos 28 días: variación normal.") + ` ${c.stability_note ?? ""}`
  }
  if (i.kind === "pulse") {
    return [String(b.finding ?? b.label ?? ""), T(L, "Whether that is a real change is the Control screen's job.", "Si es un cambio real lo decide la pantalla de Control.")]
      .filter(Boolean)
      .join(". ")
  }
  if (i.kind === "team_row") {
    return T(
      L,
      `${b.name}: ${b.portfolio} active doctors, ${b.at_risk} at risk, ${b.escalations} escalations${b.median_pickup != null ? `, median pickup ${b.median_pickup} min` : ""}. Under ${c.min_escalations} escalations there is a count, not a rate.`,
      `${b.name}: ${b.portfolio} doctores activos, ${b.at_risk} en riesgo, ${b.escalations} escalaciones${b.median_pickup != null ? `, atención mediana de ${b.median_pickup} min` : ""}. Con menos de ${c.min_escalations} escalaciones se muestra el conteo, no un porcentaje.`,
    )
  }
  return T(
    L,
    `${b.label}: ${b.active} active doctors carry it; ${pct(b.churn as number)} of those with it churned, ${b.lift}× the baseline.`,
    `${b.label}: lo tienen ${b.active} doctores activos; el ${pct(b.churn as number)} de quienes lo tuvieron se fue, ${b.lift}× la base.`,
  )
}

export const explainTask: TaskSpec<ExplainInput, string> = {
  task: "explain",
  tier: "fast",
  maxTokens: 400,
  guard: "flag",
  context,
  instruction: (i) =>
    T(
      i.locale,
      "Task: explain context.block in at most 3 sentences: what it measures; whether the change is real or noise and why (n, the control chart's verdict, limits); what to do. Only call a change real if the control chart says 'signal'. If a rate is withheld for small n, say so. Answer in English.",
      "Tarea: explica context.block en máximo 3 frases: qué mide; si el cambio es real o ruido y por qué (n, el veredicto de la gráfica de control, los límites); qué hacer. Solo llama real a un cambio si la gráfica de control dice 'signal'. Si una tasa se retiene por n pequeño, dilo. Responde en español.",
    ),
  fallback,
  mock: (ctx, i) => fallback(ctx, i),
}
