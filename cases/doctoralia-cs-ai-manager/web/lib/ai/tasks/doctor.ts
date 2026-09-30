// T4.2 "Analizar doctor" (deep model, structured JSON). Reads the whole record and says
// what happened, what the doctor wants, what is promised, a labelled hypothesis, the next
// step and the questions for the call, each claim with evidence and a date.
import { z } from "zod"
import { DEFINITIONS, O, RULES, doctorFacts, dossier } from "@/lib/ai/context"
import type { TaskSpec } from "@/lib/ai/gateway"
import type { Locale } from "@/lib/tx"
import type { Dossier } from "@/lib/types"

export const DoctorInput = z.object({
  doctor_id: z.string().regex(/^D\d+$/),
  locale: z.enum(["es", "en"]).default("es"),
  actor: z.string().max(40).optional(),
  refresh: z.boolean().optional(),
  cache_only: z.boolean().optional(),
})
export type DoctorInput = z.infer<typeof DoctorInput>

const Analysis = z.object({
  what_happened: z.array(z.string()),
  what_they_want: z.string(),
  promises_open: z.array(z.object({ who: z.enum(["doctor", "specialist"]), what: z.string(), since: z.string() })),
  likely_cause: z.string(),
  next_step: z.string(),
  questions_for_call: z.array(z.string()),
  evidence: z.array(z.object({ claim_index: z.number().int(), source: z.enum(["contact", "booking", "campaign", "escalation"]), date: z.string() })),
})
export type Analysis = z.infer<typeof Analysis>

// For structured outputs: every property required, no extra properties.
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["what_happened", "what_they_want", "promises_open", "likely_cause", "next_step", "questions_for_call", "evidence"],
  properties: {
    what_happened: { type: "array", items: { type: "string" } },
    what_they_want: { type: "string" },
    promises_open: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["who", "what", "since"],
        properties: { who: { type: "string", enum: ["doctor", "specialist"] }, what: { type: "string" }, since: { type: "string" } },
      },
    },
    likely_cause: { type: "string" },
    next_step: { type: "string" },
    questions_for_call: { type: "array", items: { type: "string" } },
    evidence: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["claim_index", "source", "date"],
        properties: {
          claim_index: { type: "integer" },
          source: { type: "string", enum: ["contact", "booking", "campaign", "escalation"] },
          date: { type: "string" },
        },
      },
    },
  },
}

interface Ctx {
  doctor: ReturnType<typeof doctorFacts>
  contacts: { date: string; channel: string; direction: string; note: string | null }[]
  bookings: { month: string; patient_bookings: number }[]
  campaigns: Dossier["campaigns"]
  escalations: Dossier["escalations"]
  followup: Dossier["followup"]
  risk_reasons: string[]
  top_note: { date: string | null; note: string | null }
  play: { key: string | null; why: string | null; ask: string | null; brief: string | null }
  lift: { signal: string; churn: number; lift: number }[]
  rules: Record<string, unknown>
  definitions: typeof DEFINITIONS
}

async function context(i: DoctorInput): Promise<Ctx | { error: string }> {
  const d = await dossier(i.doctor_id)
  if (!d) return { error: "doctor not in this build" }
  const L = i.locale
  return {
    doctor: doctorFacts(d),
    contacts: (d.contacts_all ?? d.contacts).slice(0, 20).map((c) => ({ date: c.occurred_at, channel: c.channel, direction: c.direction, note: c.note })),
    bookings: d.bookings.map((b) => ({ month: b.month, patient_bookings: b.patient_bookings })),
    campaigns: d.campaigns,
    escalations: d.escalations,
    followup: d.followup,
    risk_reasons: d.risk_reasons_i18n.map((r) => r.text[L]),
    top_note: { date: d.top_signal_at, note: d.top_signal_note },
    play: {
      key: d.copilot.play,
      why: d.copilot.i18n.why?.[L] ?? null,
      ask: d.copilot.i18n.ask?.[L] ?? null,
      brief: d.copilot.i18n.instead?.[L] ?? null,
    },
    lift: O.kpi.attention.map((a) => ({ signal: a.key, churn: a.churn, lift: a.lift })),
    rules: RULES(),
    definitions: DEFINITIONS,
  }
}

const has = (c: unknown): c is Ctx => !!c && typeof c === "object" && "doctor" in c

const T = (l: Locale, en: string, es: string) => (l === "es" ? es : en)

/** No model: the last five events in order, open items from the record, the play's ask. */
function fallback(ctx: unknown, i: DoctorInput): Analysis {
  const L = i.locale
  if (!has(ctx)) return { what_happened: [], what_they_want: "", promises_open: [], likely_cause: "", next_step: "", questions_for_call: [], evidence: [] }
  const last = ctx.contacts.slice(0, 5).reverse()
  return {
    what_happened: last.map((c) => `${c.date}: ${c.note ?? "—"}`),
    what_they_want: ctx.top_note.note ?? T(L, "Not in the record.", "No está en el expediente."),
    promises_open: ctx.followup ? [{ who: "specialist", what: ctx.followup.note, since: ctx.followup.set_at }] : [],
    likely_cause: "",
    next_step: ctx.play.ask ?? T(L, "No play: leave the account alone.", "Sin play: no hace falta contactarlo."),
    questions_for_call: [],
    evidence: last.map((c, k) => ({ claim_index: k, source: "contact" as const, date: c.date })),
  }
}

/** Canned, for tests and the no-key demo; built from the record so the guard passes. */
function mock(ctx: unknown, i: DoctorInput): Analysis {
  const f = fallback(ctx, i)
  if (!has(ctx)) return f
  const L = i.locale
  return {
    ...f,
    what_happened: f.what_happened.slice(-3),
    likely_cause: T(
      L,
      `It could be that the calendar setup was never finished: ${ctx.risk_reasons[0] ?? "no signal in the record"}.`,
      `Podría ser que la configuración nunca se terminó: ${ctx.risk_reasons[0] ?? "no hay señal en el expediente"}.`,
    ),
    questions_for_call: [
      T(L, "What changed since your last message?", "¿Qué cambió desde su último mensaje?"),
      T(L, "Which part of the platform do you use every day?", "¿Qué parte de la plataforma usa a diario?"),
      T(L, "When can we review it together?", "¿Cuándo lo revisamos juntos?"),
    ],
    evidence: f.evidence.slice(-3).map((e, k) => ({ ...e, claim_index: k })),
  }
}

export const doctorTask: TaskSpec<DoctorInput, Analysis> = {
  task: "doctor",
  tier: "deep",
  effort: "medium",
  maxTokens: 6000,
  guard: "flag",
  context,
  schema: { json: SCHEMA, parse: (v) => Analysis.safeParse(v).data ?? null },
  instruction: (i) =>
    T(
      i.locale,
      `Task: analyse this doctor's record for the specialist. what_happened: 2 to 4 bullets in chronological order, each with a date from the record. what_they_want: in the doctor's own terms. promises_open: what the doctor or the specialist committed to and has not closed. likely_cause: a hypothesis, written as one ("it could be…"). next_step: consistent with context.play unless the evidence contradicts it; if so, say why. questions_for_call: 3. evidence: for each what_happened bullet, its source and date (dates must be in the context). Answer in English.`,
      `Tarea: analiza el expediente de este doctor para el especialista. what_happened: de 2 a 4 viñetas en orden cronológico, cada una con una fecha del expediente. what_they_want: en los términos del doctor. promises_open: lo que el doctor o el especialista se comprometió a hacer y no se ha cerrado. likely_cause: una hipótesis, escrita como hipótesis ("podría ser…"). next_step: coherente con context.play salvo que la evidencia lo contradiga; si es así, di por qué. questions_for_call: 3. evidence: por cada viñeta de what_happened, su fuente y fecha (las fechas deben estar en el contexto). Responde en español.`,
    ),
  fallback,
  mock,
  text: (o) => [...o.what_happened, o.what_they_want, ...o.promises_open.map((p) => p.what), o.likely_cause, o.next_step, ...o.questions_for_call].join("\n"),
  // every date given as evidence must exist in the record
  extraFlags: (o, ctx) => {
    const blob = JSON.stringify(ctx)
    return o.evidence.map((e) => e.date).filter((d) => d && !blob.includes(d.slice(0, 10)))
  },
}
