"use client"

// Calling the AI routes from the browser: SSE for text tasks, JSON for the rest.
import { useCallback, useEffect, useRef, useState } from "react"
import type { GuardFlags } from "@/lib/ai/guard"

export interface AiMeta {
  source: string
  model: string
  cost_usd: number
  tokens_in: number
  tokens_out: number
  prompt_version: string
  flags: GuardFlags & { rejected: boolean }
  context_hash: string
}

export interface AiAnswer<O = string> {
  text: string
  output: O | null
  meta: AiMeta | null
  context: unknown
  loading: boolean
  error: boolean
}

const EMPTY: AiAnswer<never> = { text: "", output: null, meta: null, context: null, loading: false, error: false }

/** POST to an /api/ai route and read its event stream; text arrives as it is written. */
export async function streamAi<O>(route: string, body: unknown, on: (a: AiAnswer<O>) => void, signal?: AbortSignal) {
  let a: AiAnswer<O> = { ...EMPTY, loading: true }
  on(a)
  try {
    const r = await fetch(route, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal })
    if (!r.ok || !r.body) throw new Error(String(r.status))
    const reader = r.body.getReader()
    const dec = new TextDecoder()
    let buf = ""
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      let i
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const chunk = buf.slice(0, i)
        buf = buf.slice(i + 2)
        const ev = /^event: (.+)$/m.exec(chunk)?.[1]
        const data = /^data: (.+)$/m.exec(chunk)?.[1]
        if (!ev || !data) continue
        const d = JSON.parse(data)
        if (ev === "delta") a = { ...a, text: a.text + d.text }
        else if (ev === "replace") a = { ...a, text: d.text }
        else if (ev === "output") a = { ...a, output: d.output, context: d.context, text: typeof d.output === "string" ? d.output : a.text }
        else if (ev === "meta") a = { ...a, meta: d }
        on(a)
      }
    }
    on((a = { ...a, loading: false }))
  } catch (e) {
    if ((e as Error).name === "AbortError") return
    on({ ...a, loading: false, error: true })
  }
}

/** A streamed AI answer tied to a component: run(body) starts or restarts it. */
export function useAi<O = string>(route: string) {
  const [a, setA] = useState<AiAnswer<O>>(EMPTY)
  const ctrl = useRef<AbortController | null>(null)
  useEffect(() => () => ctrl.current?.abort(), [])
  const run = useCallback(
    (body: unknown) => {
      ctrl.current?.abort()
      ctrl.current = new AbortController()
      return streamAi<O>(route, body, setA, ctrl.current.signal)
    },
    [route],
  )
  const reset = useCallback(() => setA(EMPTY), [])
  return { ...a, run, reset }
}

export interface AiStatus {
  enabled: boolean
  reason: string
  mock: boolean
  key: boolean
  models: { fast: string; deep: string }
  budget: number
  ai_runtime_enabled: boolean
  spend_30d: number
  calls: number
  fallbacks: number
  by_task: Record<string, { calls: number; fallbacks: number; cost: number }>
  by_owner: Record<string, { calls: number; fallbacks: number; cost: number }>
  cache_hit: number | null
  tts?: boolean
}

let statusCache: Promise<AiStatus | null> | null = null
const listeners = new Set<(s: AiStatus | null) => void>()

export function refreshAiStatus() {
  statusCache = fetch("/api/ai/status", { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<AiStatus>) : null))
    .catch(() => null)
  statusCache.then((s) => listeners.forEach((l) => l(s)))
  return statusCache
}

/** The AI's live status (null on a static deploy with no API). */
export function useAiStatus(): AiStatus | null {
  const [s, setS] = useState<AiStatus | null>(null)
  useEffect(() => {
    listeners.add(setS)
    ;(statusCache ?? refreshAiStatus()).then(setS)
    return () => {
      listeners.delete(setS)
    }
  }, [])
  return s
}

/** "claude-haiku-4-5-20251001" → "Haiku" */
export function modelName(id: string): string {
  const m = /claude-(\w+)/.exec(id)?.[1] ?? id
  return m.charAt(0).toUpperCase() + m.slice(1)
}

/** A JSON AI route (the doctor analysis): run(body) posts it; loading until it answers. */
export function useAiJson<O>(route: string) {
  const [a, setA] = useState<AiAnswer<O>>(EMPTY)
  const seq = useRef(0)
  const run = useCallback(
    async (body: unknown) => {
      const n = ++seq.current
      setA((x) => ({ ...x, loading: true, error: false }))
      try {
        const r = await fetch(route, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
        if (!r.ok) throw new Error(String(r.status))
        const d = (await r.json()) as { output: O; meta: AiMeta; context: unknown }
        if (n === seq.current) setA({ text: "", output: d.output, meta: d.meta, context: d.context, loading: false, error: false })
      } catch {
        if (n === seq.current) setA((x) => ({ ...x, loading: false, error: true }))
      }
    },
    [route],
  )
  const reset = useCallback(() => {
    seq.current++
    setA(EMPTY)
  }, [])
  return { ...a, run, reset }
}
