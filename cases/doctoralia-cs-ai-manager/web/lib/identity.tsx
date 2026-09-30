"use client"

// Who is using the app, and which book they are looking at. No auth (out of scope):
// the person picks themselves once; it is kept in this browser ("cs:who").
// Role is derived from the identity; there is no "view as" switch any more.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { useShell, type ShellData } from "@/lib/shell"

export type Who =
  | { kind: "specialist"; id: string }
  | { kind: "manager"; team: string }
  | { kind: "director" }

export type Role = Who["kind"]

const WHO = "cs:who"
const SCOPE = "cs:scope"

export function homePath(who: Who | null): string {
  if (!who) return "/"
  return who.kind === "specialist" ? "/hoy" : "/resumen"
}

/** The book a person starts on: their own, their team's, or the whole portfolio. */
export function defaultScope(who: Who | null): string {
  if (!who) return "all"
  if (who.kind === "specialist") return who.id
  if (who.kind === "manager") return `team:${who.team}`
  return "all"
}

export function whoName(who: Who | null, shell: ShellData, director: string): string {
  if (!who) return ""
  if (who.kind === "specialist") return shell.specialists.find((s) => s.id === who.id)?.name ?? who.id
  if (who.kind === "manager") return shell.managers.find((m) => m.team === who.team)?.name ?? who.team
  return director
}

export function firstName(name: string): string {
  return name.split(/\s+/)[0] ?? name
}

function valid(who: unknown, shell: ShellData): who is Who {
  if (!who || typeof who !== "object") return false
  const w = who as Record<string, unknown>
  if (w.kind === "specialist") return shell.specialists.some((s) => s.id === w.id)
  if (w.kind === "manager") return shell.managers.some((m) => m.team === w.team)
  return w.kind === "director"
}

interface IdentityCtx {
  who: Who | null
  /** false until localStorage has been read: avoid redirecting on the first paint */
  ready: boolean
  setWho: (w: Who) => void
  /** "all" | "team:<name>" | specialist id. A specialist's scope is always their book. */
  scope: string
  setScope: (s: string) => void
  /** the identity dialog, opened from the user card, the palette or a first visit */
  pickerOpen: boolean
  setPickerOpen: (o: boolean) => void
}

const Ctx = createContext<IdentityCtx | null>(null)

export function IdentityProvider({ children }: { children: React.ReactNode }) {
  const shell = useShell()
  const [who, setWhoState] = useState<Who | null>(null)
  const [ready, setReady] = useState(false)
  const [scope, setScopeState] = useState("all")
  const [pickerOpen, setPickerOpen] = useState(false)

  useEffect(() => {
    let w: Who | null = null
    try {
      const raw = window.localStorage.getItem(WHO)
      const parsed = raw ? JSON.parse(raw) : null
      if (valid(parsed, shell)) w = parsed
    } catch {
      // blocked storage: ask every visit
    }
    let s = defaultScope(w)
    try {
      const saved = window.sessionStorage.getItem(SCOPE)
      if (saved && shell.books[saved] && w?.kind !== "specialist") s = saved
    } catch {
      // fine: start from the default book
    }
    setWhoState(w)
    setScopeState(s)
    setPickerOpen(!w)
    setReady(true)
  }, [shell])

  const setWho = useCallback((w: Who) => {
    setWhoState(w)
    const s = defaultScope(w)
    setScopeState(s)
    try {
      window.localStorage.setItem(WHO, JSON.stringify(w))
      window.sessionStorage.setItem(SCOPE, s)
    } catch {
      // the choice holds for this page
    }
  }, [])

  const setScope = useCallback(
    (s: string) => {
      if (who?.kind === "specialist") return
      setScopeState(s)
      try {
        window.sessionStorage.setItem(SCOPE, s)
      } catch {
        // the choice holds for this page
      }
    },
    [who],
  )

  const value = useMemo(
    () => ({ who, ready, setWho, scope, setScope, pickerOpen, setPickerOpen }),
    [who, ready, setWho, scope, setScope, pickerOpen],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useIdentity(): IdentityCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error("useIdentity() outside IdentityProvider")
  return v
}
