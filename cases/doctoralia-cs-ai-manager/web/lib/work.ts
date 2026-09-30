// The outcome log (SPEC §5.5): one append-only line per action in out/work_log.jsonl.
// Pure: shared by the /api/work route and the browser, and testable with node --test.
import { addBusinessDays, addDays, daysBetween } from "./dates.ts"
import type { DocState, Outcome } from "./dayplan.ts"

export type WorkOutcome = Outcome | "undo"

export interface WorkEvent {
  id: string
  ts: string
  app_day: string
  actor: string
  owner: string
  doctor_id: string
  doctor_name?: string | null
  outcome: WorkOutcome
  next_due?: string | null
  reason?: string | null
  note?: string | null
  play?: string | null
  draft_copied?: boolean
  draft_edited?: boolean
  ai_used?: string[]
  undo_of?: string | null
}

export type NewEvent = Omit<WorkEvent, "id" | "ts">

/** The ids an undo has reverted. An undo cannot itself be undone (log it again instead). */
function undone(events: WorkEvent[]): Set<string> {
  return new Set(events.filter((e) => e.outcome === "undo" && e.undo_of).map((e) => e.undo_of!))
}

/** Latest non-undone event per doctor. */
export function fold(events: WorkEvent[]): Record<string, DocState> {
  const gone = undone(events)
  const out: Record<string, DocState> = {}
  for (const e of events) {
    if (e.outcome === "undo" || gone.has(e.id)) continue
    out[e.doctor_id] = {
      id: e.id,
      outcome: e.outcome,
      app_day: e.app_day,
      next_due: e.next_due ?? null,
      doctor_name: e.doctor_name ?? undefined,
      play: e.play ?? null,
      note: e.note ?? null,
    }
  }
  return out
}

/** What was done on the app's today, newest first ("Hecho hoy"). */
export function todayLog(events: WorkEvent[], today: string): WorkEvent[] {
  const gone = undone(events)
  return events.filter((e) => e.outcome !== "undo" && !gone.has(e.id) && e.app_day === today).reverse()
}

/**
 * When the doctor comes back. no answer: 2 working days; sent: 5 working days (did
 * they reply?); agreed: the date chosen; not applicable, routed, skipped: no return.
 */
export function nextDueFor(outcome: Outcome, today: string, chosen?: string | null): string | null {
  if (outcome === "no_answer") return addBusinessDays(today, 2)
  if (outcome === "sent") return addBusinessDays(today, 5)
  if (outcome === "agreed") return chosen ?? addBusinessDays(today, 2)
  return null
}

/** A sortable, unique event id. */
export function newId(): string {
  return `w_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

export interface FollowThrough {
  /** outcomes logged on the app's today and in its week (Monday on), skips excluded */
  today: number
  week: number
  /** doctors whose follow-up is past due: a return the log scheduled, or a note's
   *  follow-up (at most `staleDays` late, as on Hoy) the log has not touched since */
  overdue: number
  /** drafts copied and marked sent, and how many went out as written */
  sent: number
  unedited: number
}

/** One specialist's follow-through, from their events and their notes' follow-ups. */
export function followThrough(
  events: WorkEvent[],
  noteDue: Map<string, string>,
  today: string,
  staleDays: number,
): FollowThrough {
  const gone = undone(events)
  const acts = events.filter((e) => e.outcome !== "undo" && e.outcome !== "skipped" && !gone.has(e.id))
  const wd = new Date(`${today}T12:00:00Z`).getUTCDay()
  const monday = addDays(today, -((wd + 6) % 7))
  const state = fold(events)
  let overdue = 0
  for (const s of Object.values(state)) if (s.next_due && s.next_due < today) overdue++
  for (const [id, due] of noteDue) {
    if (state[id]) continue // the log has the latest word on this doctor
    const late = daysBetween(due, today)
    if (late > 0 && late <= staleDays) overdue++
  }
  const sent = acts.filter((e) => e.outcome === "sent" && e.draft_copied)
  return {
    today: acts.filter((e) => e.app_day === today).length,
    week: acts.filter((e) => e.app_day >= monday && e.app_day <= today).length,
    overdue,
    sent: sent.length,
    unedited: sent.filter((e) => !e.draft_edited).length,
  }
}
