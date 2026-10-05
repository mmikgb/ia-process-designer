"use client"

/**
 * Contacts logged from this browser (a WhatsApp opened, a call noted). They are not
 * written back anywhere: the tool stays read-only against the operation, so these
 * live here until a real CRM write-back exists.
 */
export interface LocalNote {
  at: string // ISO timestamp
  channel: "whatsapp" | "phone" | "note"
  direction: "outbound" | "inbound" | "internal"
  text: string
}

const KEY = "cs-control-room:notes:v1"

export function loadNotes(): Record<string, LocalNote[]> {
  try {
    const raw = window.localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Record<string, LocalNote[]>) : {}
  } catch {
    return {}
  }
}

export function addNote(doctorId: string, note: LocalNote): Record<string, LocalNote[]> {
  const all = loadNotes()
  all[doctorId] = [...(all[doctorId] ?? []), note]
  try {
    window.localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    // storage blocked: the note shows for this page view only
  }
  return all
}
