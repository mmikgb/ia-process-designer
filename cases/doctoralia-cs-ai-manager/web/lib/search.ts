"use client"

import { searchRow, type SearchRow, type SearchRowRaw } from "@/lib/types"

// public/search.json, loaded once, the first time something needs it.
let index: Promise<SearchRow[]> | null = null

export function loadSearch(): Promise<SearchRow[]> {
  if (!index) {
    index = fetch("/search.json")
      .then((r) => {
        if (!r.ok) throw new Error(`search.json: ${r.status}`)
        return r.json() as Promise<SearchRowRaw[]>
      })
      .then((rows) => rows.map(searchRow))
    index.catch(() => {
      index = null // let a later call retry
    })
  }
  return index
}

/** Lowercase, no accents: "Querétaro" matches "queretaro". */
export function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
}

/** Every word of the query must appear in the doctor's name, id, specialty or city. */
export function matchDoctors(rows: SearchRow[], query: string, owner: string | null, limit = 30): SearchRow[] {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const hits = rows.filter((r) => {
    const hay = fold(`${r.name} ${r.id} ${r.specialty} ${r.city}`)
    return words.every((w) => hay.includes(w))
  })
  // the person's own book first, then active before churned, then risk
  hits.sort(
    (a, b) =>
      Number(b.owner === owner) - Number(a.owner === owner) ||
      Number(a.status !== "active") - Number(b.status !== "active") ||
      b.risk - a.risk,
  )
  return hits.slice(0, limit)
}
