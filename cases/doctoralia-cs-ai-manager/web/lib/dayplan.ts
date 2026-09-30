// The day's cut, in the browser. plan() is a line-for-line copy of src/dayplan.py
// plan(): Python decides who can go in which block, in what order and why (the
// queue file's claims/ranks/reasons); this only applies capacity, the follow-up
// quota, the stale window and the app's day, so a specialist can change them live.
// tests/dayplan.test.ts checks it reproduces the file cut exactly.
//
// applyWork() layers the outcome log on top: handled doctors leave today's plan,
// and a doctor with a next date comes back as a follow-up on that date, ahead of
// the bundle's follow-ups. Filtering and ordering only; no metric is computed here.
import { daysBetween, shortDay } from "./dates.ts"

export type Block = "call" | "followup" | "message" | "handoff" | "later"
export type Claim = Exclude<Block, "later">
export type I18n = { en: string; es: string }
export const BLOCKS: Block[] = ["call", "followup", "message", "handoff", "later"]

export interface Candidate {
  doctor_id: string
  doctor_name: string
  specialty?: string
  city?: string
  play: string | null
  mode: "draft" | "brief" | "handoff" | null
  risk_score: number
  confident?: boolean
  due_at?: string
  signal_at?: string
  lead_median?: number
  days_of_lead_left?: number
  claims: Claim[]
  ranks: Partial<Record<Block, number>>
  reasons: Partial<Record<Block, I18n>>
  later_kind?: "past_lead" | "watch" | "thin"
  /** a follow-up the specialist set in the app: holds whenever it is due, never stale */
  pinned?: boolean
}

export interface Planned extends Candidate {
  block: Block
  reason: I18n
  later_reason?: I18n
  origin?: "followup" | "message" | null
  rank: number
}

export interface PlanOptions {
  capacity: number
  quota: number
  window: number
}

// Same text as src/dayplan.py LATER / _stale_reason / _due_reason.
export const LATER: Record<"past_lead" | "watch" | "thin" | "capacity", I18n> = {
  past_lead: {
    en: "past the usual warning time; they have probably decided",
    es: "pasó su tiempo típico de aviso; probablemente ya decidió",
  },
  watch: {
    en: "weaker signal: keep an eye on it, not a call for today",
    es: "señal más débil: en observación, no es para llamar hoy",
  },
  thin: {
    en: "evidence too thin to draft; open the account first",
    es: "evidencia insuficiente para redactar; revisa la cuenta primero",
  },
  capacity: { en: "beyond today's capacity", es: "más allá de tu capacidad de hoy" },
}

const staleReason = (days: number, window: number): I18n => ({
  en: `follow-up ${days} days overdue, past the ${window}-day window`,
  es: `seguimiento vencido hace ${days} días, fuera de la ventana de ${window}`,
})

const dueReason = (due: string): I18n => {
  const d = shortDay(due)
  return { en: `due on ${d.en}`, es: `vence el ${d.es}` }
}

export function plan(items: Candidate[], today: string, { capacity, quota, window }: PlanOptions): Planned[] {
  const blocks: Record<Block, Planned[]> = { call: [], followup: [], message: [], handoff: [], later: [] }
  for (const x of items) {
    const late = x.due_at ? daysBetween(x.due_at, today) : null
    const held = x.claims.filter(
      (c) => c !== "followup" || (late !== null && late >= 0 && (x.pinned || late <= window)),
    )
    let y: Planned
    if (held.length) {
      y = { ...x, block: held[0], reason: x.reasons[held[0]]!, rank: 0 }
    } else if (x.later_kind) {
      y = { ...x, block: "later", origin: null, reason: x.reasons.later!, later_reason: LATER[x.later_kind], rank: 0 }
    } else if (late !== null && late > window) {
      y = { ...x, block: "later", origin: null, reason: x.reasons.followup!, later_reason: staleReason(late, window), rank: 0 }
    } else {
      // a follow-up that is not due yet
      y = { ...x, block: "later", origin: null, reason: x.reasons.followup!, later_reason: dueReason(x.due_at!), rank: 0 }
    }
    blocks[y.block].push(y)
  }
  for (const b of BLOCKS) blocks[b].sort((p, q) => (p.ranks[b] ?? 1e9) - (q.ranks[b] ?? 1e9))
  const { call, followup: fu, message: msg } = blocks
  const fuToday = fu.slice(0, quota)
  const fuOver = fu.slice(quota)
  const room = Math.max(capacity - call.length - fuToday.length, 0)
  const msgToday = msg.slice(0, room)
  const msgOver = msg.slice(room)
  // Overflow keeps its place (follow-ups first, then messages in PLAYS order) and
  // comes back on the next day it fits.
  const over: Planned[] = [...fuOver, ...msgOver].map((y) => ({
    ...y,
    block: "later",
    origin: y.block as "followup" | "message",
    later_reason: LATER.capacity,
  }))
  const out = [...call, ...fuToday, ...msgToday, ...blocks.handoff, ...over, ...blocks.later]
  out.forEach((y, i) => (y.rank = i + 1))
  return out
}

// ---- the outcome log on top of the file -------------------------------------

export type Outcome = "sent" | "no_answer" | "agreed" | "not_applicable" | "routed" | "skipped"

/** A doctor's latest outcome (see lib/work.ts fold()). */
export interface DocState {
  id: string
  outcome: Outcome
  app_day: string
  next_due?: string | null
  doctor_name?: string
  play?: string | null
  note?: string | null
}

export interface Returning {
  item: Candidate
  due: string
  state: DocState
}

function workReason(st: DocState): I18n {
  const on = shortDay(st.app_day)
  const due = shortDay(st.next_due ?? st.app_day)
  if (st.outcome === "sent")
    return { en: `Sent on ${on.en}: check whether they replied`, es: `Enviado el ${on.es}: revisa si respondió` }
  if (st.outcome === "no_answer")
    return { en: `No answer on ${on.en}: try again`, es: `Sin respuesta el ${on.es}: intenta de nuevo` }
  const note = st.note ? ` · ${st.note}` : ""
  return { en: `You agreed to pick it up on ${due.en}${note}`, es: `Acordaste retomarlo el ${due.es}${note}` }
}

const RETURNS: Outcome[] = ["sent", "no_answer", "agreed"]

/**
 * The file's candidates with the outcome log applied, for the app's today:
 * done doctors leave, returning ones come back pinned to the follow-up block
 * (ahead of the bundle's follow-ups, ordered by their date), and doctors whose
 * date is still ahead are listed as `returning`.
 */
export function applyWork(
  items: Candidate[],
  state: Record<string, DocState>,
  today: string,
): { items: Candidate[]; returning: Returning[] } {
  const out: Candidate[] = []
  const returning: Returning[] = []
  const seen = new Set<string>()
  const back = (x: Candidate, st: DocState): Candidate => ({
    ...x,
    claims: ["followup", ...x.claims.filter((c) => c !== "followup" && c !== "call")],
    due_at: st.next_due!,
    pinned: true,
    ranks: { ...x.ranks, followup: -1e6 + daysBetween("2000-01-01", st.next_due!) },
    reasons: { ...x.reasons, followup: workReason(st) },
  })
  for (const x of items) {
    seen.add(x.doctor_id)
    const st = state[x.doctor_id]
    if (!st || st.outcome === "skipped") {
      out.push(x)
      continue
    }
    if (!RETURNS.includes(st.outcome) || !st.next_due) continue // not applicable, routed: off the list
    if (st.next_due > today) returning.push({ item: x, due: st.next_due, state: st })
    else out.push(back(x, st))
  }
  // doctors acted on from outside the day plan (e.g. the doctor sheet) still come back
  for (const [id, st] of Object.entries(state)) {
    if (seen.has(id) || !RETURNS.includes(st.outcome) || !st.next_due) continue
    const x: Candidate = {
      doctor_id: id,
      doctor_name: st.doctor_name ?? id,
      play: st.play ?? null,
      mode: null,
      risk_score: 0,
      claims: [],
      ranks: {},
      reasons: {},
    }
    if (st.next_due > today) returning.push({ item: x, due: st.next_due, state: st })
    else out.push(back(x, st))
  }
  returning.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0))
  return { items: out, returning }
}
