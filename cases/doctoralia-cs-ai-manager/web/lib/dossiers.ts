import type { ChatRow, DoctorIndex, Dossier } from "@/lib/types"

// Each file is fetched once per page lifetime. A failed fetch is forgotten so a later click retries.
const cache = new Map<string, Promise<unknown>>()

function once<T>(url: string): Promise<T> {
  let p = cache.get(url) as Promise<T> | undefined
  if (!p) {
    p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`${url}: ${r.status}`)
      return r.json() as Promise<T>
    })
    p.catch(() => cache.delete(url))
    cache.set(url, p)
  }
  return p
}

const books = new Map<string, Promise<Map<string, Dossier>>>()

/** One specialist's book: every doctor they own, with the copilot's action. */
export function loadBook(owner: string): Promise<Map<string, Dossier>> {
  let b = books.get(owner)
  if (!b) {
    b = once<Dossier[]>(`/doctors/${owner}.json`).then((rows) => new Map(rows.map((d) => [d.doctor_id, d])))
    b.catch(() => books.delete(owner))
    books.set(owner, b)
  }
  return b
}

export function loadDossier(owner: string, doctorId: string): Promise<Dossier | null> {
  return loadBook(owner).then((m) => m.get(doctorId) ?? null)
}

/** Every logged contact for one specialist's doctors, oldest first. */
export function loadChats(owner: string): Promise<Record<string, ChatRow[]>> {
  return once<Record<string, ChatRow[]>>(`/doctors/chats/${owner}.json`)
}

/** Where every doctor lives: id -> [owner, name, specialty, city, status]. */
export function loadIndex(): Promise<DoctorIndex> {
  return once<DoctorIndex>("/doctors/index.json")
}

export const MISSING_FILES = "Doctor files are missing. Run python3 src/bundle.py, then reload."
