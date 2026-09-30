"use client"

// One clock for everything date-relative on screen (lead time left, due today,
// "hace N días"). CS_CLOCK=snapshot (default): the bundle's extract date, plus a demo
// offset ("Avanzar un día", kept in localStorage cs:dayOffset). CS_CLOCK=real: today.
// This is display arithmetic on bundle values, never a metric.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { useShell } from "@/lib/shell"

const STORE = "cs:dayOffset"
export type ClockMode = "snapshot" | "real"
export const CLOCK_MODE: ClockMode = process.env.NEXT_PUBLIC_CS_CLOCK === "real" ? "real" : "snapshot"

/** YYYY-MM-DD plus n days, in calendar days (noon avoids DST edges). */
export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b.slice(0, 10)}T12:00:00Z`) - Date.parse(`${a.slice(0, 10)}T12:00:00Z`)) / 864e5)
}

/** Business days after `iso` (weekends skipped, holidays not modelled): no answer → +2. */
export function addBusinessDays(iso: string, n: number): string {
  let d = iso
  let left = n
  while (left > 0) {
    d = addDays(d, 1)
    const wd = new Date(`${d}T12:00:00Z`).getUTCDay()
    if (wd !== 0 && wd !== 6) left--
  }
  return d
}

function realToday(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
}

interface Clock {
  mode: ClockMode
  /** the bundle's extract date */
  asof: string
  /** calendar days the demo has moved forward (snapshot mode only) */
  offset: number
  /** the app's today */
  today: string
  advance: () => void
  reset: () => void
  /** lead time left, as of the app's today */
  leadLeft: (daysOfLeadLeftAtAsof: number) => number
}

const Ctx = createContext<Clock | null>(null)

export function ClockProvider({ children }: { children: React.ReactNode }) {
  const { asof } = useShell()
  const [offset, setOffset] = useState(0)

  useEffect(() => {
    if (CLOCK_MODE !== "snapshot") return
    try {
      const n = Number(window.localStorage.getItem(STORE) ?? 0)
      if (Number.isFinite(n) && n > 0) setOffset(Math.floor(n))
    } catch {
      // blocked storage: the demo starts at the extract date
    }
  }, [])

  const save = useCallback((n: number) => {
    setOffset(n)
    try {
      window.localStorage.setItem(STORE, String(n))
    } catch {
      // the offset holds for this page
    }
  }, [])

  const value = useMemo<Clock>(() => {
    const today = CLOCK_MODE === "real" ? realToday() : addDays(asof, offset)
    const shift = daysBetween(asof, today)
    return {
      mode: CLOCK_MODE,
      asof,
      offset: CLOCK_MODE === "real" ? 0 : offset,
      today,
      // the next working day: specialists do not work weekends (holidays are not modelled)
      advance: () => save(daysBetween(asof, addBusinessDays(today, 1))),
      reset: () => save(0),
      leadLeft: (x) => x - shift,
    }
  }, [asof, offset, save])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useClock(): Clock {
  const v = useContext(Ctx)
  if (!v) throw new Error("useClock() outside ClockProvider")
  return v
}
