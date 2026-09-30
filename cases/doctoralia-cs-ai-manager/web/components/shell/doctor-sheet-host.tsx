"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Suspense, useCallback, useEffect, useState } from "react"
import { DoctorPanel } from "@/components/doctor/doctor-panel"
import { useHandled } from "@/lib/handled"
import { loadSearch } from "@/lib/search"
import { useShell } from "@/lib/shell"

/** The one doctor sheet, on every screen, driven by ?doctor=D03810 (back/forward and links work). */
export function DoctorSheetHost() {
  return (
    <Suspense fallback={null}>
      <Host />
    </Suspense>
  )
}

/** Open a doctor from anywhere: keeps the current screen and its query, adds ?doctor=. */
export function doctorHref(path: string, params: URLSearchParams | null, id: string): string {
  const q = new URLSearchParams(params?.toString() ?? "")
  q.set("doctor", id)
  return `${path}?${q.toString()}`
}

function Host() {
  const params = useSearchParams()
  const router = useRouter()
  const path = usePathname()
  const shell = useShell()
  const id = params.get("doctor")
  const [target, setTarget] = useState<{ id: string; owner: string } | null>(null)
  const [handled, setHandled] = useHandled()

  useEffect(() => {
    let live = true
    if (!id) {
      setTarget(null)
      return
    }
    // The dossier file is per owner; the search index says which owner.
    loadSearch()
      .then((rows) => {
        const row = rows.find((r) => r.id === id)
        if (live) setTarget(row ? { id, owner: row.owner } : { id, owner: "" })
      })
      .catch(() => live && setTarget({ id, owner: "" }))
    return () => {
      live = false
    }
  }, [id])

  const close = useCallback(() => {
    const q = new URLSearchParams(params.toString())
    q.delete("doctor")
    const rest = q.toString()
    router.replace(rest ? `${path}?${rest}` : path, { scroll: false })
  }, [params, path, router])

  const ownerName = useCallback(
    (sid: string) => shell.specialists.find((s) => s.id === sid)?.name ?? sid,
    [shell.specialists],
  )

  return (
    <DoctorPanel
      target={target}
      ownerName={ownerName}
      handled={target ? handled[target.id] : undefined}
      onHandle={(h) => target && setHandled(target.id, h)}
      onClose={close}
    />
  )
}
