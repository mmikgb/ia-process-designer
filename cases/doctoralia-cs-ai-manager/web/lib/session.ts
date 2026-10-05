"use client"

import { useCallback, useSyncExternalStore } from "react"

/**
 * Who is using the app. A demo switch, not authentication: there is no login,
 * so this decides what is shown, not what is protected.
 *
 * manager    → every screen, any portfolio
 * specialist → their own book only: My day, Conversations, doctor profiles
 */
export interface Session {
  role: "manager" | "specialist"
  me: string | null // specialist id when role is specialist
}

const KEY = "cs-control-room:session:v1"
const EVENT = "cs-session"
const DEFAULT: Session = { role: "manager", me: null }

let cache: { raw: string | null; value: Session } = { raw: null, value: DEFAULT }

function read(): Session {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (raw === cache.raw) return cache.value
    const v = raw ? ({ ...DEFAULT, ...JSON.parse(raw) } as Session) : DEFAULT
    cache = { raw, value: v.role === "specialist" && !v.me ? DEFAULT : v }
    return cache.value
  } catch {
    return DEFAULT
  }
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb)
  window.addEventListener("storage", cb) // other tabs
  return () => {
    window.removeEventListener(EVENT, cb)
    window.removeEventListener("storage", cb)
  }
}

export function useSession(): [Session, (s: Session) => void] {
  const session = useSyncExternalStore(subscribe, read, () => DEFAULT)
  const set = useCallback((s: Session) => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(s))
    } catch {
      // storage blocked: the switch still works for this page view
      cache = { raw: JSON.stringify(s), value: s }
    }
    window.dispatchEvent(new Event(EVENT))
  }, [])
  return [session, set]
}

/** Screens a specialist does not get. */
export const MANAGER_ONLY = ["/team", "/pulse", "/control", "/cost"]
