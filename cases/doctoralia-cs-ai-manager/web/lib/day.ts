"use client"

// One specialist's day on screen: the queue file (Python's claims and order), the
// outcome log, the app clock and the specialist's own capacity, cut by lib/dayplan.
import { useCallback, useEffect, useMemo, useState } from "react"
import { useClock } from "@/lib/clock"
import { applyWork, plan, type Planned, type PlanOptions, type Returning } from "@/lib/dayplan"
import { useIdentity, type Who } from "@/lib/identity"
import { useQueue } from "@/lib/queue"
import { useWork } from "@/lib/use-work"
import { nextDueFor, todayLog, type WorkEvent } from "@/lib/work"
import type { Outcome } from "@/lib/dayplan"

const KEY = (owner: string) => `cs:plan:${owner}`

/** Who wrote an event: the specialist's id, "mgr-norte", or "direccion". */
export function actorOf(who: Who | null): string {
  if (!who) return "unknown"
  if (who.kind === "specialist") return who.id
  if (who.kind === "manager") return `mgr-${who.team.replace(/^Farming\s+/, "").toLowerCase().replace(/\W+/g, "")}`
  return "direccion"
}

/** Capacity, follow-up quota and stale window: RULES defaults, changed live per person. */
export function usePlanOptions(owner: string | null, defaults: PlanOptions | null) {
  const [custom, setCustom] = useState<Partial<PlanOptions>>({})
  useEffect(() => {
    if (!owner) return
    try {
      setCustom(JSON.parse(window.localStorage.getItem(KEY(owner)) ?? "{}") as Partial<PlanOptions>)
    } catch {
      setCustom({})
    }
  }, [owner])
  const set = useCallback(
    (patch: Partial<PlanOptions> | null) => {
      if (!owner) return
      setCustom((c) => {
        const next = patch ? { ...c, ...patch } : {}
        try {
          window.localStorage.setItem(KEY(owner), JSON.stringify(next))
        } catch {
          // holds for this page
        }
        return next
      })
    },
    [owner],
  )
  const opts = defaults ? { ...defaults, ...custom } : null
  return { opts, custom: Object.keys(custom).length > 0, set }
}

export interface Day {
  owner: string
  today: string
  items: Planned[]
  pending: Planned[] // call, followup, message, handoff, in order
  returning: Returning[]
  done: WorkEvent[]
  counts: { call: number; followup: number; message: number; handoff: number; later: number }
  totals: { followup: number; message: number } // candidates before the cut
  opts: PlanOptions
  defaults: PlanOptions
  custom: boolean
  setOpts: (p: Partial<PlanOptions> | null) => void
  local: boolean
  log: (x: { doctor_id: string; doctor_name?: string; play?: string | null }, outcome: Outcome | "undo", extra?: LogExtra) => Promise<WorkEvent>
}

export interface LogExtra {
  next_due?: string | null
  note?: string | null
  reason?: string | null
  draft_copied?: boolean
  draft_edited?: boolean
  ai_used?: string[]
  undo_of?: string
}

export function useDay(owner: string | null): Day | null {
  const file = useQueue(owner)
  const work = useWork(owner)
  const clock = useClock()
  const { who } = useIdentity()
  const defaults = useMemo<PlanOptions | null>(
    () => (file ? { capacity: file.capacity, quota: file.followup_quota, window: file.followup_stale_days } : null),
    [file],
  )
  const { opts, custom, set } = usePlanOptions(owner, defaults)
  const today = clock.today

  const log = useCallback<Day["log"]>(
    (x, outcome, extra = {}) =>
      work.record({
        doctor_id: x.doctor_id,
        doctor_name: x.doctor_name ?? null,
        owner: owner!,
        actor: actorOf(who),
        outcome,
        app_day: today,
        play: x.play ?? null,
        ...extra,
        next_due: outcome === "undo" ? null : (extra.next_due ?? nextDueFor(outcome, today, extra.next_due)),
      }),
    [work, owner, who, today],
  )

  return useMemo(() => {
    if (!owner || !file || !opts || !defaults) return null
    const w = applyWork(file.items, work.state, today)
    const items = plan(w.items, today, opts)
    const pending = items.filter((y) => y.block !== "later")
    const n = (b: string) => items.filter((y) => y.block === b).length
    const cand = (b: string) => items.filter((y) => y.block === b || y.origin === b).length
    return {
      owner,
      today,
      items,
      pending,
      returning: w.returning,
      done: todayLog(work.events, today),
      counts: { call: n("call"), followup: n("followup"), message: n("message"), handoff: n("handoff"), later: n("later") },
      totals: { followup: cand("followup"), message: cand("message") },
      opts,
      defaults,
      custom,
      setOpts: set,
      local: work.local,
      log,
    }
  }, [owner, file, opts, defaults, work.state, work.events, work.local, today, custom, set, log])
}
