"use client"

// Done / snooze, shared by every screen and the doctor sheet (one store, one
// localStorage key). Phase 3 replaces it with the outcome log behind /api/work.
import { useCallback, useSyncExternalStore } from "react"
import { loadHandled, saveHandled, type Handled } from "@/lib/controls"

type Map = Record<string, Handled>
const listeners = new Set<() => void>()
let state: Map | null = null
const EMPTY: Map = {}

function get(): Map {
  if (state === null) state = typeof window === "undefined" ? EMPTY : loadHandled()
  return state
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function setHandled(id: string, h: Handled | null) {
  const next = { ...get() }
  if (h) next[id] = h
  else delete next[id]
  state = next
  saveHandled(next)
  listeners.forEach((l) => l())
}

export function useHandled(): [Map, (id: string, h: Handled | null) => void] {
  const map = useSyncExternalStore(subscribe, get, () => EMPTY)
  const set = useCallback((id: string, h: Handled | null) => setHandled(id, h), [])
  return [map, set]
}
