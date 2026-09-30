import type { Dossier } from "@/lib/types"

// One request per specialist's book, kept for the page's lifetime.
const cache = new Map<string, Promise<Map<string, Dossier>>>()

export function loadDossier(owner: string, doctorId: string): Promise<Dossier | null> {
  let book = cache.get(owner)
  if (!book) {
    book = fetch(`/doctors/${owner}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`doctors/${owner}.json: ${r.status}`)
        return r.json() as Promise<Dossier[]>
      })
      .then((rows) => new Map(rows.map((d) => [d.doctor_id, d])))
    book.catch(() => cache.delete(owner)) // let a later click retry
    cache.set(owner, book)
  }
  return book.then((m) => m.get(doctorId) ?? null)
}
