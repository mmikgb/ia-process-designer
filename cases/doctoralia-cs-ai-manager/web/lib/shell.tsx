"use client"

// The slice of overview.json every screen's frame needs (sidebar, top bar, identity).
// Built on the server in app/(shell)/layout.tsx so the full overview is not shipped twice.
import { createContext, useContext } from "react"
import type { ShellData } from "@/lib/shell-data"

export type { ShellData }

const Ctx = createContext<ShellData | null>(null)

export function ShellDataProvider({ value, children }: { value: ShellData; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useShell(): ShellData {
  const v = useContext(Ctx)
  if (!v) throw new Error("useShell() outside the app shell")
  return v
}
