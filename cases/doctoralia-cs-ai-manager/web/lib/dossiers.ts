import type { Dossier } from "@/lib/types"

// One request per specialist's book, kept for the page's lifetime.
const cache = new Map<string, Promise<Map<string, Dossier>>>()

/** Every dossier in a specialist's book, keyed by doctor id. */
export function loadBook(owner: string): Promise<Map<string, Dossier>> {
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
  return book
}

export function loadDossier(owner: string, doctorId: string): Promise<Dossier | null> {
  return loadBook(owner).then((m) => m.get(doctorId) ?? null)
}
