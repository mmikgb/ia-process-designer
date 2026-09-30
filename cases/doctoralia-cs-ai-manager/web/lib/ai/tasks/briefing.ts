// T4.4 Daily briefing (fast model). Specialist: what changed, who first and why, one
// thing to watch, from the day's own plan. Manager ("Qué pasó esta semana"): the KPI
// deltas and the control charts; a move is "real" only if a chart flags it.
import { z } from "zod"
import { DEFINITIONS, O, RULES, kpiBlock, queue, specialistName, spcSummary } from "@/lib/ai/context"
import type { TaskSpec } from "@/lib/ai/gateway"
import { addBusinessDays, addDays, isWeekend } from "@/lib/dates"
import { applyWork, plan } from "@/lib/dayplan"
import { readWorkLog } from "@/lib/server/work-log"
import type { Locale } from "@/lib/tx"
import { fold } from "@/lib/work"

export const BriefingInput = z.object({
  scope: z.string().regex(/^(all|team:[\w ]+|S\d+)$/),
  app_day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  locale: z.enum(["es", "en"]).default("es"),
  capacity: z.number().int().min(1).max(200).optional(),
  quota: z.number().int().min(0).max(200).optional(),
  window: z.number().int().min(0).max(365).optional(),
  actor: z.string().max(40).optional(),
  refresh: z.boolean().optional(),
})
export type BriefingInput = z.infer<typeof BriefingInput>

const T = (l: Locale, en: string, es: string) => (l === "es" ? es : en)
const prevWorkday = (d: string) => {
  let x = addDays(d, -1)
  while (isWeekend(x)) x = addDays(x, -1)
  return x
}

async function specialistContext(i: BriefingInput) {
  const q = await queue(i.scope)
  if (!q) return { error: "no day plan for this owner" }
  const events = await readWorkLog(i.scope)
  const w = applyWork(q.items, fold(events), i.app_day)
  const opts = { capacity: i.capacity ?? q.capacity, quota: i.quota ?? q.followup_quota, window: i.window ?? q.followup_stale_days }
  const items = plan(w.items, i.app_day, opts)
  const n = (b: string) => items.filter((y) => y.block === b).length
  const yesterday = prevWorkday(i.app_day)
  const logged: Record<string, number> = {}
  for (const e of events.filter((e) => e.app_day === yesterday && e.outcome !== "undo")) logged[e.outcome] = (logged[e.outcome] ?? 0) + 1
  const L = i.locale
  return {
    specialist: specialistName(i.scope).split(" ")[0],
    app_day: i.app_day,
    plan: { calls: n("call"), followups: n("followup"), messages: n("message"), handoffs: n("handoff"), later: n("later"), capacity: opts.capacity },
    first_items: items
      .filter((y) => y.block === "call" || y.block === "followup" || y.block === "message")
      .slice(0, 5)
      .map((y) => ({ doctor: y.doctor_name, block: y.block, reason: y.reason[L], play: y.play })),
    returning_next_workday: w.returning.filter((r) => r.due === addBusinessDays(i.app_day, 1)).length,
    logged_yesterday: { day: yesterday, by_outcome: logged },
    kpis: kpiBlock(i.scope, L),
    lead_times: O.predict.lead_times,
    rules: RULES(),
    definitions: DEFINITIONS,
  }
}

function managerContext(i: BriefingInput) {
  return {
    scope: i.scope === "all" ? T(i.locale, "whole portfolio", "toda la cartera") : i.scope.slice(5),
    kpis: kpiBlock(i.scope, i.locale),
    control_charts: spcSummary(O.meta.extract_date, i.locale),
    rules: RULES(),
    definitions: { ...DEFINITIONS, control_chart: "límites a 3 sigma sobre una línea base congelada; una señal es un punto fuera o una racha (reglas de Western Electric)" },
  }
}

type Ctx = Awaited<ReturnType<typeof specialistContext>> | ReturnType<typeof managerContext>

function fallback(ctx: unknown, i: BriefingInput): string {
  const L = i.locale
  const c = ctx as Record<string, unknown>
  if ("plan" in c) {
    const p = c.plan as { calls: number; followups: number; messages: number }
    const first = (c.first_items as { doctor: string; reason: string }[])[0]
    const head = T(L, `Today: ${p.calls} calls, ${p.followups} follow-ups, ${p.messages} messages.`, `Hoy: ${p.calls} llamadas, ${p.followups} seguimientos, ${p.messages} mensajes.`)
    const start = first ? T(L, ` Start with ${first.doctor}: ${first.reason.toLowerCase()}.`, ` Empieza por ${first.doctor}: ${first.reason.toLowerCase()}.`) : ""
    const back = (c.returning_next_workday as number) || 0
    return head + start + (back ? T(L, ` Tomorrow ${back} doctors you contacted come back.`, ` Mañana vuelven ${back} doctores que ya contactaste.`) : "")
  }
  if ("control_charts" in c) {
    const k = (c.kpis as ReturnType<typeof kpiBlock>).kpis
    const charts = c.control_charts as ReturnType<typeof spcSummary>
    const lines = k
      .filter((x) => x.delta_pct != null)
      .slice(0, 4)
      .map((x) => `${x.label}: ${x.delta_pct! > 0 ? "+" : ""}${Math.round(x.delta_pct! * 100)}% ${T(L, "vs the previous 30 days", "vs los 30 días anteriores")}`)
    const real = charts.filter((ch) => ch.verdict === "signal").map((ch) => ch.label)
    lines.push(
      real.length
        ? T(L, `Real (the control chart flags it): ${real.join("; ")}.`, `Real (la gráfica de control lo marca): ${real.join("; ")}.`)
        : T(L, "No control chart flags a change: the rest is normal variation.", "Ninguna gráfica de control marca un cambio: lo demás es variación normal."),
    )
    return lines.join("\n")
  }
  return ""
}

export const briefingTask: TaskSpec<BriefingInput, string> = {
  task: "briefing",
  tier: "fast",
  maxTokens: 700,
  guard: "flag",
  context: async (i) => (/^S\d+$/.test(i.scope) ? specialistContext(i) : managerContext(i)) as Promise<Ctx>,
  instruction: (i) =>
    /^S\d+$/.test(i.scope)
      ? T(
          i.locale,
          "Task: the specialist's morning briefing, 3 to 5 short lines: what changed since yesterday, who first and why (from first_items), one thing to watch. Plain text, no headings. Answer in English.",
          "Tarea: el briefing de la mañana del especialista, de 3 a 5 líneas cortas: qué cambió desde ayer, por quién empezar y por qué (de first_items), una cosa a vigilar. Texto plano, sin títulos. Responde en español.",
        )
      : T(
          i.locale,
          "Task: 'What happened this week' for the manager, 3 to 5 short lines on the KPI moves. Only call a move 'real' if control_charts marks it (verdict 'signal'); otherwise it is normal variation. Do not quote a rate the KPI block withholds. Plain text. Answer in English.",
          "Tarea: 'Qué pasó esta semana' para el manager, de 3 a 5 líneas cortas sobre los movimientos de los KPIs. Solo llama 'real' a un movimiento si control_charts lo marca (verdict 'signal'); si no, es variación normal. No cites una tasa que el bloque de KPIs retiene. Texto plano. Responde en español.",
        ),
  fallback,
  mock: (ctx, i) => fallback(ctx, i).replace(/^(Hoy|Today):/, i.locale === "es" ? "Buen día. Hoy:" : "Good morning. Today:"),
}
