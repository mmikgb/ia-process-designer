"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Suspense, useCallback, useEffect, useState } from "react"
import { DoctorSheet } from "@/components/doctor/doctor-sheet"
import { loadSearch } from "@/lib/search"

/** The one doctor sheet, on every screen, driven by ?doctor=D03810 (back/forward and links work). */
export function DoctorSheetHost() {
  return (
    <Suspense fallback={null}>
      <Host />
    </Suspense>
  )
}

/** Open a doctor from anywhere: keeps the current screen and its query, adds ?doctor=. */
export function doctorHref(path: string, params: URLSearchParams | null, id: string, tab?: string): string {
  const q = new URLSearchParams(params?.toString() ?? "")
  q.set("doctor", id)
  if (tab) q.set("tab", tab)
  else q.delete("tab")
  return `${path}?${q.toString()}`
}

function Host() {
  const params = useSearchParams()
  const router = useRouter()
  const path = usePathname()
  const id = params.get("doctor")
  const [target, setTarget] = useState<{ id: string; owner: string } | null>(null)

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
    q.delete("tab")
    const rest = q.toString()
    router.replace(rest ? `${path}?${rest}` : path, { scroll: false })
  }, [params, path, router])

  return <DoctorSheet target={target} tab={params.get("tab")} onClose={close} />
}
