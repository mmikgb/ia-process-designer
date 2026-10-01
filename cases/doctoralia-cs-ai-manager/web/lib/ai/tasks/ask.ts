// T4.7 "Pregúntale a tu cartera" (deep model, with tools). The model gets the screen's
// context and four read-only tools that server code runs over the bundle files. Counts in
// the answer must come from a tool result or the context (guarded). The buttons under an
// answer are derived here from the tools the model actually used, not written by it: a
// search becomes "open the list", a doctor lookup "open the doctor", the queue "start".
import Anthropic from "@anthropic-ai/sdk"
import { z } from "zod"
import { DEFINITIONS, O, RULES, doctorFacts, dossier, kpiBlock, queue, searchIndex, specialistName, spcSummary } from "@/lib/ai/context"
import { blocked, type Meta } from "@/lib/ai/gateway"
import { guard } from "@/lib/ai/guard"
import { MODELS, price, usesFallbacks } from "@/lib/ai/models"
import { system, VERSIONS } from "@/lib/ai/prompts"
import { en } from "@/lib/i18n/en"
import { es, type Key } from "@/lib/i18n/es"
import { writeLedger } from "@/lib/server/ledger"
import type { Locale } from "@/lib/tx"
import type { Block, Flag, SearchRow } from "@/lib/types"

const FLAGS = ["at_risk", "may_cancel", "discouraged", "hollow", "not_found", "commitment", "followup_due", "calendar_off", "grade_d", "upsell"] as const
const MAX_ROUNDS = 4

export const AskInput = z.object({
  screen: z.string().max(40).default("hoy"),
  scope: z.string().regex(/^(all|team:[\w ]+|S\d+)$/).default("all"),
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(2000) }))
    .min(1)
    .max(12)
    .refine((m) => m[m.length - 1].role === "user", "the last message must be the user's"),
  locale: z.enum(["es", "en"]).default("es"),
  actor: z.string().max(40).optional(),
})
export type AskInput = z.infer<typeof AskInput>

export type AskAction =
  | { type: "open_list"; filters: Record<string, string>; count?: number }
  | { type: "open_doctor"; doctor_id: string; name: string }
  | { type: "start_focus"; block: Block }

export interface AskOutput {
  text: string
  actions: AskAction[]
}

const T = (l: Locale, en: string, es: string) => (l === "es" ? es : en)

// ---- scope ----------------------------------------------------------------------------
function owners(scope: string): Set<string> | null {
  if (/^S\d+$/.test(scope)) return new Set([scope])
  if (scope.startsWith("team:")) return new Set(O.specialists.filter((s) => `team:${s.team}` === scope).map((s) => s.id))
  return null
}

// ---- the screen's context -------------------------------------------------------------
export async function screenContext(i: AskInput) {
  const base = { screen: i.screen, scope: i.scope, asof: O.meta.extract_date, rules: RULES(), definitions: DEFINITIONS }
  const mine = owners(i.scope)
  if (i.screen === "hoy" && /^S\d+$/.test(i.scope)) {
    const q = await queue(i.scope)
    return {
      ...base,
      specialist: specialistName(i.scope),
      queue: q && {
        capacity: q.capacity,
        counts: q.counts,
        top: q.items
          .filter((x) => x.block !== "later")
          .slice(0, 10)
          .map((x) => ({ doctor_id: x.doctor_id, name: x.doctor_name, block: x.block, play: x.play, why: x.reason[i.locale] })),
      },
    }
  }
  if (i.screen === "equipo") return { ...base, team: O.team.rows.filter((r) => !mine || mine.has(r.id)), pickup_target_min: O.team.target_min }
  if (i.screen === "control") return { ...base, control_charts: spcSummary(O.meta.extract_date, i.locale) }
  return { ...base, kpis: kpiBlock(i.scope, i.locale), attention: O.kpi.attention.map((a) => ({ key: a.key, label: typeof a.label === "object" ? a.label[i.locale] : a.label, active: a.active, churn: a.churn, lift: a.lift })) }
}

// ---- tools ----------------------------------------------------------------------------
const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "search_doctors",
    description:
      "Count and list doctors in the user's scope. Filters combine with AND. Returns {count, rows} with at most `limit` rows (count is the full total). Only active doctors unless status says otherwise.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "part of the doctor's name, accents ignored" },
        owner: { type: "string", description: "specialist id, e.g. S01" },
        flags: { type: "array", items: { type: "string", enum: [...FLAGS] }, description: "every flag must be present" },
        play: { type: "string" },
        specialty: { type: "string" },
        city: { type: "string" },
        risk_min: { type: "number", description: "0 to 1" },
        status: { type: "string", enum: ["active", "churned"] },
        limit: { type: "integer", maximum: 50 },
      },
    },
  },
  {
    name: "get_doctor",
    description: "One doctor's record: facts, flags, risk reasons, the last contacts, open follow-up and the copilot's play.",
    input_schema: { type: "object", properties: { doctor_id: { type: "string" } }, required: ["doctor_id"] },
  },
  {
    name: "get_kpis",
    description: "The KPI block for a scope ('all', 'team:<name>' or a specialist id) over a period in days (7, 30 or 90), with n and suppression.",
    input_schema: { type: "object", properties: { scope: { type: "string" }, period: { type: "string" } } },
  },
  {
    name: "get_queue",
    description: "A specialist's day: capacity, counts per block and the top items with why each is today.",
    input_schema: { type: "object", properties: { owner: { type: "string" } }, required: ["owner"] },
  },
]

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()

interface Trace {
  searches: { filters: Record<string, string>; count: number }[]
  doctors: { doctor_id: string; name: string }[]
  queue: { owner: string; block: Block | null } | null
}

async function runTool(name: string, raw: unknown, i: AskInput, trace: Trace): Promise<unknown> {
  const a = (raw ?? {}) as Record<string, unknown>
  const mine = owners(i.scope)
  if (name === "search_doctors") {
    const flags = (Array.isArray(a.flags) ? a.flags : []).filter((f): f is Flag => (FLAGS as readonly string[]).includes(String(f)))
    const status = a.status === "churned" ? "churned" : "active"
    const owner = typeof a.owner === "string" ? a.owner : null
    const test = (r: SearchRow) =>
      r.status === status &&
      (!mine || mine.has(r.owner)) &&
      (!owner || r.owner === owner) &&
      flags.every((f) => r.flags.includes(f)) &&
      (!a.name || norm(r.name).includes(norm(String(a.name)))) &&
      (!a.play || r.play === a.play) &&
      (!a.specialty || norm(r.specialty).includes(norm(String(a.specialty)))) &&
      (!a.city || norm(r.city).includes(norm(String(a.city)))) &&
      (typeof a.risk_min !== "number" || r.risk >= a.risk_min)
    const rows = (await searchIndex()).filter(test).sort((x, y) => y.risk - x.risk)
    const limit = Math.min(Math.max(Number(a.limit) || 10, 1), 50)
    const filters: Record<string, string> = {}
    const own = owner ?? (mine && mine.size === 1 ? [...mine][0] : null)
    if (own) filters.owner = own
    else if (i.scope.startsWith("team:")) filters.team = i.scope.slice(5)
    if (flags.length) filters.flag = flags.join(",")
    for (const k of ["play", "specialty", "city"] as const) if (a[k]) filters[k] = String(a[k])
    if (a.name) filters.q = String(a.name)
    if (typeof a.risk_min === "number") filters.risk_min = String(a.risk_min)
    if (status !== "active") filters.status = status
    trace.searches.push({ filters, count: rows.length })
    return {
      count: rows.length,
      rows: rows.slice(0, limit).map((r) => ({ doctor_id: r.id, name: r.name, specialty: r.specialty, city: r.city, owner: r.owner, play: r.play, risk: r.risk, flags: r.flags })),
    }
  }
  if (name === "get_doctor") {
    const d = await dossier(String(a.doctor_id ?? ""))
    if (!d || (mine && !mine.has(d.owner_specialist_id))) return { error: "not found in this scope" }
    trace.doctors.push({ doctor_id: d.doctor_id, name: d.doctor_name })
    return {
      ...doctorFacts(d),
      flags: d.flags,
      risk_reasons: d.risk_reasons_i18n.map((r) => r.text[i.locale]),
      top_signal: d.top_signal,
      top_signal_at: d.top_signal_at,
      top_signal_note: d.top_signal_note,
      followup: d.followup,
      contacts: d.contacts.map((c) => ({ ...c })),
      play: d.copilot.play,
      why: d.copilot.i18n.why?.[i.locale] ?? null,
    }
  }
  if (name === "get_kpis") {
    const scope = typeof a.scope === "string" && O.scopes[a.scope] ? a.scope : i.scope
    if (mine && scope !== i.scope && !(/^S\d+$/.test(scope) && mine.has(scope))) return { error: "outside this scope" }
    const period = String(a.period ?? "30")
    const periods = (O.scopes[scope] ?? O.scopes.all).periods
    const k = periods[period] ?? periods["30"]
    const tx = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, string>)[i.locale] : v)
    return { scope, window_days: k.window_days, asof: k.asof, totals: k.totals, kpis: k.kpis.map((x) => ({ key: x.key, label: tx(x.label), value: x.value, prev: x.prev, delta_pct: x.delta_pct, n: x.n, suppressed: x.suppressed ? tx(x.suppressed) : undefined })) }
  }
  if (name === "get_queue") {
    const owner = String(a.owner ?? "")
    if (mine && !mine.has(owner)) return { error: "outside this scope" }
    const q = await queue(owner)
    if (!q) return { error: "no queue for this owner" }
    const top = q.items.filter((x) => x.block !== "later")
    trace.queue = { owner, block: top[0]?.block ?? null }
    return {
      owner,
      specialist: specialistName(owner),
      capacity: q.capacity,
      counts: q.counts,
      top: top.slice(0, 10).map((x) => ({ doctor_id: x.doctor_id, name: x.doctor_name, block: x.block, play: x.play, why: x.reason[i.locale] })),
    }
  }
  return { error: `unknown tool ${name}` }
}

function actions(trace: Trace, i: AskInput): AskAction[] {
  const out: AskAction[] = []
  const seen = new Set<string>()
  for (const s of trace.searches.slice(-2)) {
    const k = JSON.stringify(s.filters)
    if (seen.has(k) || s.count === 0) continue
    seen.add(k)
    out.push({ type: "open_list", filters: s.filters, count: s.count })
  }
  for (const d of trace.doctors.slice(-3)) out.push({ type: "open_doctor", ...d })
  if (i.screen === "hoy" && trace.queue?.block && trace.queue.owner === i.scope && trace.queue.block !== "handoff") out.push({ type: "start_focus", block: trace.queue.block })
  return out
}

/** With no model: the screen's suggested lists, as buttons. */
function suggested(i: AskInput): AskAction[] {
  const owner: Record<string, string> = /^S\d+$/.test(i.scope) ? { owner: i.scope } : i.scope.startsWith("team:") ? { team: i.scope.slice(5) } : {}
  const lists: Flag[] = i.screen === "hoy" ? ["may_cancel", "hollow", "followup_due"] : ["at_risk", "may_cancel", "discouraged"]
  return lists.map((f) => ({ type: "open_list" as const, filters: { ...owner, flag: f } }))
}

function offText(code: string, l: Locale) {
  const dict: Record<string, string> = l === "es" ? es : en
  const reason = dict[`ai.reason.${code}` as Key] ?? dict["ai.reason.other"]
  return T(
    l,
    `The assistant is off (${reason}). These lists answer the usual questions:`,
    `El asistente está apagado (${reason}). Estas listas responden las preguntas de siempre:`,
  )
}

// ---- mock: a fixed plan that exercises the tools, so the drawer can be tested with no key
async function mock(i: AskInput, trace: Trace): Promise<{ text: string; results: unknown[] }> {
  const l = i.locale
  if (/^S\d+$/.test(i.scope)) {
    const q = (await runTool("get_queue", { owner: i.scope }, i, trace)) as { counts: Record<Block, number>; top: { name: string; why: string }[] }
    const s = (await runTool("search_doctors", { flags: ["may_cancel"], limit: 5 }, i, trace)) as { count: number }
    const first = q.top[0]
    const why = first ? first.why.trim().replace(/^./, (c) => c.toLowerCase()).replace(/([^.!?])$/, "$1.") : ""
    return {
      results: [q, s],
      text: first
        ? T(l, `Start with ${first.name}: ${why} You have ${s.count} active doctors who said they might cancel.`, `Empieza por ${first.name}: ${why} Tienes ${s.count} doctores activos que dijeron que cancelarían.`)
        : T(l, `Your day is empty. You have ${s.count} active doctors who said they might cancel.`, `Tu día está vacío. Tienes ${s.count} doctores activos que dijeron que cancelarían.`),
    }
  }
  const s = (await runTool("search_doctors", { flags: ["at_risk"], limit: 5 }, i, trace)) as { count: number }
  return { results: [s], text: T(l, `There are ${s.count} active doctors at critical risk in this view.`, `Hay ${s.count} doctores activos en riesgo crítico en esta vista.`) }
}

// ---- the run --------------------------------------------------------------------------
export type AskEvent =
  | { type: "status"; tool: string }
  | { type: "delta"; text: string }
  | { type: "replace"; text: string }
  | { type: "done"; output: AskOutput; meta: Meta; context: unknown }

/** Never throws. */
export async function* ask(i: AskInput): AsyncGenerator<AskEvent> {
  const model = MODELS.deep
  const trace: Trace = { searches: [], doctors: [], queue: null }
  let ctx: unknown
  try {
    ctx = await screenContext(i)
  } catch {
    ctx = { error: "context unavailable" }
  }
  const owner = /^S\d+$/.test(i.scope) ? i.scope : null
  const meta = (source: Meta["source"], extra: Partial<Meta> = {}): Meta => ({
    source,
    model,
    cost_usd: 0,
    tokens_in: 0,
    tokens_out: 0,
    prompt_version: VERSIONS.ask,
    flags: { unverified_numbers: [], banned_phrases: [], rejected: false },
    context_hash: "",
    ...extra,
  })
  const ledger = (m: Meta, cacheRead = 0) =>
    writeLedger({
      ts: new Date().toISOString(),
      task: "ask",
      model: m.model,
      tokens_in: m.tokens_in,
      tokens_out: m.tokens_out,
      cache_read: cacheRead,
      cost: m.cost_usd,
      ok: !m.source.startsWith("fallback"),
      source: m.source,
      owner,
      doctor: null,
      prompt_version: m.prompt_version,
    })
  const typed = i.messages.filter((m) => m.role === "user").map((m) => m.content)

  const why = await blocked(i.actor ?? "anon")
  if (why) {
    const m = meta(`fallback:${why}`)
    await ledger(m)
    yield { type: "done", output: { text: offText(why, i.locale), actions: suggested(i) }, meta: m, context: ctx }
    return
  }

  if (process.env.CS_AI_MOCK === "1") {
    const r = await mock(i, trace)
    const g = guard(r.text, { ctx, tools: r.results }, typed)
    const m = meta("mock", { flags: { ...g, rejected: false } })
    await ledger(m)
    for (const part of r.text.match(/[\s\S]{1,24}(?:\s|$)/g) ?? [r.text]) yield { type: "delta", text: part }
    yield { type: "done", output: { text: r.text, actions: actions(trace, i) }, meta: m, context: { ctx, tools: r.results } }
    return
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const instruction = T(
    i.locale,
    "You answer questions about this CS book. Use the tools for any count or doctor; never estimate. If the data does not hold what is asked (e.g. profile visits), say so plainly. Keep answers to a few sentences or a short list. Do not write links or buttons: the app adds them from the tools you used.",
    "Respondes preguntas sobre esta cartera de CS. Usa las herramientas para cualquier conteo o doctor; nunca estimes. Si los datos no tienen lo que se pregunta (p. ej. visitas al perfil), dilo claramente. Responde en pocas frases o una lista corta. No escribas ligas ni botones: la app los agrega según las herramientas que usaste.",
  )
  const messages: Anthropic.Beta.BetaMessageParam[] = i.messages.map((m, k) =>
    k === 0
      ? {
          role: "user",
          content: [
            { type: "text", text: `CONTEXTO:\n${JSON.stringify(ctx)}`, cache_control: { type: "ephemeral" } },
            { type: "text", text: `${instruction}\n\n${m.content}` },
          ],
        }
      : { role: m.role, content: m.content },
  )
  const results: unknown[] = []
  let tin = 0,
    tout = 0,
    cacheRead = 0,
    cost = 0,
    served = model,
    text = ""
  try {
    for (let round = 0; round <= MAX_ROUNDS; round++) {
      const last = round === MAX_ROUNDS
      const stream = client.beta.messages.stream({
        model,
        max_tokens: 1200,
        system: [{ type: "text", text: system(i.locale), cache_control: { type: "ephemeral" } }],
        tools: TOOLS,
        ...(last ? { tool_choice: { type: "none" as const } } : {}),
        messages,
        ...(usesFallbacks(model)
          ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const, output_config: { effort: "medium" as const } }
          : {}),
      } as Anthropic.Beta.MessageCreateParamsStreaming)
      let said = ""
      for await (const ev of stream) {
        if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
          said += ev.delta.text
          yield { type: "delta", text: ev.delta.text }
        }
      }
      const msg = await stream.finalMessage()
      const u = msg.usage
      served = msg.model || served
      tin += u.input_tokens + (u.cache_creation_input_tokens ?? 0)
      tout += u.output_tokens
      cacheRead += u.cache_read_input_tokens ?? 0
      cost += price(served, u.input_tokens, u.output_tokens, u.cache_read_input_tokens ?? 0, u.cache_creation_input_tokens ?? 0)
      if (msg.stop_reason === "refusal") throw new Error("refusal")
      const uses = msg.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use")
      if (msg.stop_reason !== "tool_use" || !uses.length) {
        text = said.trim()
        break
      }
      // a preamble before tool calls is not the answer
      if (said) yield { type: "replace", text: "" }
      messages.push({ role: "assistant", content: msg.content as Anthropic.Beta.BetaContentBlockParam[] })
      const outs: Anthropic.Beta.BetaToolResultBlockParam[] = []
      for (const u of uses) {
        yield { type: "status", tool: u.name }
        const r = await runTool(u.name, u.input, i, trace)
        results.push({ tool: u.name, input: u.input, result: r })
        outs.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(r) })
      }
      messages.push({ role: "user", content: outs })
    }
  } catch (e) {
    const reason = e instanceof Error && e.message === "refusal" ? "refusal" : e instanceof Error ? e.constructor.name : "error"
    const m = meta(`fallback:${reason}`, { cost_usd: cost, tokens_in: tin, tokens_out: tout })
    await ledger(m, cacheRead)
    yield { type: "replace", text: "" }
    yield { type: "done", output: { text: offText(reason, i.locale), actions: suggested(i) }, meta: m, context: ctx }
    return
  }
  if (!text) {
    const m = meta("fallback:empty", { model: served, cost_usd: cost, tokens_in: tin, tokens_out: tout })
    await ledger(m, cacheRead)
    yield { type: "done", output: { text: offText("empty", i.locale), actions: suggested(i) }, meta: m, context: ctx }
    return
  }
  const seen = { ctx, tools: results }
  const g = guard(text, seen, typed)
  const m = meta("llm", { model: served, cost_usd: cost, tokens_in: tin, tokens_out: tout, flags: { ...g, rejected: false } })
  await ledger(m, cacheRead)
  yield { type: "done", output: { text, actions: actions(trace, i) }, meta: m, context: seen }
}
