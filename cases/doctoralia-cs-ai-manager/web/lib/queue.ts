"use client"

import { useEffect, useState } from "react"
import type { QueueFile } from "@/lib/types"

// One request per owner's day plan, kept for the page's lifetime.
const cache = new Map<string, Promise<QueueFile | null>>()

export function loadQueue(owner: string): Promise<QueueFile | null> {
  let q = cache.get(owner)
  if (!q) {
    q = fetch(`/queue/${owner}.json`)
      .then((r) => (r.ok ? (r.json() as Promise<QueueFile>) : null))
      .catch(() => null)
    q.then((v) => v === null && cache.delete(owner)) // let a later call retry
    cache.set(owner, q)
  }
  return q
}

export function useQueue(owner: string | null): QueueFile | null {
  const [q, setQ] = useState<QueueFile | null>(null)
  useEffect(() => {
    let live = true
    setQ(null)
    if (owner) loadQueue(owner).then((v) => live && setQ(v))
    return () => {
      live = false
    }
  }, [owner])
  return q
}
