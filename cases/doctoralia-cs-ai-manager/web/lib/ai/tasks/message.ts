// T4.3 Message writer (fast model). Starts from the deterministic draft, which carries
// the facts; the model changes tone and channel, never facts. Any new number, date,
// price or promise → rejected, and the original draft goes out instead.
import { z } from "zod"
import { DEFINITIONS, RULES, doctorFacts, dossier, specialistName } from "@/lib/ai/context"
import type { TaskSpec } from "@/lib/ai/gateway"

export const KINDS = ["whatsapp", "email", "call_script", "followup_email", "upsell_note"] as const
export const TONES = ["breve", "calido", "formal", "directo"] as const

export const MessageInput = z.object({
  doctor_id: z.string().regex(/^D\d+$/),
  kind: z.enum(KINDS),
  tone: z.array(z.enum(TONES)).max(4).default([]),
  instruction: z.string().max(300).optional(),
  base_text: z.string().min(1).max(4000),
  note: z.string().max(300).optional(), // the outcome note, for a follow-up email
  locale: z.enum(["es", "en"]).default("es"),
  actor: z.string().max(40).optional(),
  refresh: z.boolean().optional(),
})
export type MessageInput = z.infer<typeof MessageInput>

const TONE_ES: Record<(typeof TONES)[number], string> = {
  breve: "más breve",
  calido: "más cálido",
  formal: "más formal",
  directo: "más directo",
}

const LIMIT: Record<(typeof KINDS)[number], string> = {
  whatsapp: "máximo 70 palabras; es un WhatsApp",
  email: "máximo 140 palabras; es un email: primera línea 'Asunto: …', una línea en blanco, el cuerpo con saludo y firma con el nombre del especialista",
  call_script: "NO es un mensaje para enviar: es un guion de llamada para el especialista, con apertura, 3 preguntas, el único arreglo a ofrecer y cómo cerrar con una fecha",
  followup_email: "máximo 140 palabras; email de seguimiento después de una llamada, usando la nota del resultado; primera línea 'Asunto: …', línea en blanco, cuerpo con saludo y firma",
  upsell_note: "nota interna breve para el equipo de productos adicionales, con la cita textual del doctor; no es un mensaje al doctor",
}

function signature(ctx: { specialist?: string }) {
  return ctx.specialist ? `\n\nSaludos,\n${ctx.specialist}\nDoctoralia` : ""
}

export const messageTask: TaskSpec<MessageInput, string> = {
  task: "message",
  tier: "fast",
  maxTokens: 900,
  guard: "reject",
  typed: (i) => [i.instruction ?? "", i.note ?? ""],
  context: async (i) => {
    const d = await dossier(i.doctor_id)
    return {
      doctor: d ? doctorFacts(d) : { id: i.doctor_id },
      play: d ? { key: d.copilot.play, ask: d.copilot.i18n.ask?.es ?? null } : null,
      base_text: i.base_text,
      specialist: d ? specialistName(d.owner_specialist_id).split(" ")[0] : undefined,
      last_contacts: d ? d.contacts.slice(0, 3).map((c) => ({ at: c.occurred_at, channel: c.channel, note: c.note })) : [],
      followup: d?.followup ?? null,
      channel_note: d?.copilot.i18n.channel?.es ?? null,
      outcome_note: i.note ?? null,
      rules: RULES(),
      definitions: DEFINITIONS,
    }
  },
  // Messages to doctors are Spanish (usted) whatever the UI language.
  instruction: (i) =>
    [
      `Tarea: reescribe el texto BASE (context.base_text) para este canal: ${LIMIT[i.kind]}.`,
      "Español de México, de usted. Parte del texto BASE: ya trae los hechos.",
      "No agregues hechos, números, fechas, precios ni promesas que no estén en el CONTEXTO o en la instrucción del especialista.",
      "Nunca prometas más pacientes. Mantén un solo pedido: el de context.play.ask.",
      i.tone.length ? `Tono: ${i.tone.map((t) => TONE_ES[t]).join(", ")}.` : "",
      i.instruction ? `Instrucción del especialista: ${i.instruction}` : "",
      "Devuelve solo el texto final, sin comentarios.",
    ]
      .filter(Boolean)
      .join("\n"),
  fallback: (ctx, i) => {
    const c = ctx as { specialist?: string }
    if (i.kind === "email") return `Asunto: Seguimiento de su cuenta en Doctoralia\n\n${i.base_text}${signature(c)}`
    if (i.kind === "followup_email")
      return `Asunto: Seguimiento de nuestra llamada\n\n${i.base_text}${i.note ? `\n\n${i.note}` : ""}${signature(c)}`
    return i.base_text // whatsapp: the draft; call script: the brief; upsell note: the handoff note
  },
  // Canned rewrites for tests and a no-key demo. "más directo" adds a number that is not in
  // the record, on purpose: the guard must reject it and hand back the original.
  mock: (ctx, i) => {
    const c = ctx as { specialist?: string }
    let t = i.base_text
    if (i.tone.includes("breve")) t = t.split(/(?<=[.?!])\s+/).slice(0, 2).join(" ")
    if (i.tone.includes("calido")) t = `Espero que esté muy bien. ${t}`
    if (i.tone.includes("formal")) t = t.replace(/^Doctor(a)? /, "Estimado Doctor$1 ")
    if (i.tone.includes("directo")) t = `${t} Con esto recibiría 7 citas más al mes.`
    if (i.instruction) t = `${t} (${i.instruction})`
    if (i.kind === "email" || i.kind === "followup_email") return `Asunto: Su agenda en Doctoralia\n\n${t}${signature(c)}`
    return t
  },
}
