"use client"

// The outcome log in the browser: one store per owner, shared by Hoy, focus mode
// and the doctor sheet. Server first (/api/work → out/work_log.jsonl); when the API
// is not there (a static deploy) it falls back to localStorage and says so.
import { useCallback, useEffect, useSyncExternalStore } from "react"
import { fold, newId, type NewEvent, type WorkEvent } from "@/lib/work"

interface Store {
  events: WorkEvent[]
  local: boolean
  loaded: boolean
  listeners: Set<() => void>
  snapshot: { events: WorkEvent[]; local: boolean; loaded: boolean }
}

const stores = new Map<string, Store>()
const KEY = (owner: string) => `cs:work:${owner}`

function store(owner: string): Store {
  let s = stores.get(owner)
  if (!s) {
    s = { events: [], local: false, loaded: false, listeners: new Set(), snapshot: { events: [], local: false, loaded: false } }
    stores.set(owner, s)
  }
  return s
}

function emit(s: Store) {
  s.snapshot = { events: s.events, local: s.local, loaded: s.loaded }
  s.listeners.forEach((l) => l())
}

function readLocal(owner: string): WorkEvent[] {
  try {
    return JSON.parse(window.localStorage.getItem(KEY(owner)) ?? "[]") as WorkEvent[]
  } catch {
    return []
  }
}

function writeLocal(owner: string, events: WorkEvent[]) {
  try {
    window.localStorage.setItem(KEY(owner), JSON.stringify(events))
  } catch {
    // nowhere left to keep it: it lasts for this page
  }
}

async function load(owner: string) {
  const s = store(owner)
  if (s.loaded) return
  try {
    const r = await fetch(`/api/work?owner=${encodeURIComponent(owner)}`, { cache: "no-store" })
    if (!r.ok) throw new Error(String(r.status))
    s.events = ((await r.json()) as { events: WorkEvent[] }).events
    s.local = false
  } catch {
    s.events = readLocal(owner)
    s.local = true
  }
  s.loaded = true
  emit(s)
}

async function record(owner: string, e: NewEvent): Promise<WorkEvent> {
  const s = store(owner)
  const local = (): WorkEvent => ({ ...e, id: newId(), ts: new Date().toISOString() })
  let saved: WorkEvent
  if (s.local) {
    saved = local()
  } else {
    try {
      const r = await fetch("/api/work", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(e),
      })
      if (!r.ok) throw new Error(String(r.status))
      saved = (await r.json()) as WorkEvent
    } catch {
      // the API went away mid-session: keep working in this browser
      s.local = true
      s.events = [...readLocal(owner), ...s.events.filter((x) => !readLocal(owner).some((y) => y.id === x.id))]
      saved = local()
    }
  }
  s.events = [...s.events, saved]
  if (s.local) writeLocal(owner, s.events)
  emit(s)
  return saved
}

const EMPTY = { events: [] as WorkEvent[], local: false, loaded: false }

export function useWork(owner: string | null) {
  const snap = useSyncExternalStore(
    (fn) => {
      if (!owner) return () => {}
      const s = store(owner)
      s.listeners.add(fn)
      return () => s.listeners.delete(fn)
    },
    () => (owner ? store(owner).snapshot : EMPTY),
    () => EMPTY,
  )
  useEffect(() => {
    if (owner) void load(owner)
  }, [owner])
  const add = useCallback((e: NewEvent) => (owner ? record(owner, e) : Promise.reject(new Error("no owner"))), [owner])
  return { ...snap, state: fold(snap.events), record: add }
}

/** For a sheet opened on any doctor: record against that doctor's owner. */
export function recordFor(owner: string, e: NewEvent) {
  return record(owner, e)
}
