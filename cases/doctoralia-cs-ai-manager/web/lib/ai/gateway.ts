// The only web module that talks to Anthropic (server-only). The same three guarantees
// as src/llm.py:
//   1. It never throws. No key, AI switched off, budget reached, rate limit, network
//      error, refusal, bad JSON → the task's deterministic fallback, with the reason.
//   2. Every call writes a ledger row (out/llm_ledger_web.jsonl) before it returns.
//   3. A kill switch (CS_AI_DISABLED, settings.ai_runtime_enabled) and a monthly budget
//      shared with llm.py actually stop calls.
// Plus: a response cache (out/ai_cache), prompt caching on the system prompt, a mock
// mode (CS_AI_MOCK=1) for tests and a no-key demo, and the number guard on every output.
import Anthropic from "@anthropic-ai/sdk"
import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import overview from "@/data/overview.json"
import { guard, type GuardFlags } from "@/lib/ai/guard"
import { MODELS, price, usesFallbacks, type Tier } from "@/lib/ai/models"
import { system, VERSIONS, type Task } from "@/lib/ai/prompts"
import { writeLedger } from "@/lib/server/ledger"
import { OUT } from "@/lib/server/paths"
import { readSettings } from "@/lib/server/settings"
import { spend } from "@/lib/server/ledger"
import type { Locale } from "@/lib/tx"

export type Source = "llm" | "cache" | "mock" | `fallback:${string}`

export interface Meta {
  source: Source
  model: string
  cost_usd: number
  tokens_in: number
  tokens_out: number
  prompt_version: string
  flags: GuardFlags & { rejected: boolean }
  context_hash: string
}

export interface Opts {
  locale: Locale
  actor?: string | null
  owner?: string | null
  doctor?: string | null
  refresh?: boolean
  /** only return a cached answer; never call the model (e.g. the summary in focus mode) */
  cacheOnly?: boolean
}

/** What a task defines; the gateway does the rest. O is text (string) or a JSON object. */
export interface TaskSpec<I, O> {
  task: Task
  tier: Tier
  effort?: "low" | "medium" | "high"
  maxTokens: number
  /** the grounded context, built from the bundle files; this is exactly what "Ver contexto" shows */
  context: (input: I, opts: Opts) => Promise<unknown>
  /** the task's instruction; the context JSON is appended by the gateway */
  instruction: (input: I, locale: Locale) => string
  fallback: (ctx: unknown, input: I, locale: Locale) => O
  mock: (ctx: unknown, input: I, locale: Locale) => O
  /** JSON tasks: the output schema (structured outputs) and a validator */
  schema?: { json: Record<string, unknown>; parse: (v: unknown) => O | null }
  /** "reject": an unverified number or a banned phrase returns the fallback (messages to doctors) */
  guard: "flag" | "reject"
  /** text the specialist typed, which counts as context for the guard */
  typed?: (input: I) => string[]
  /** the text the guard reads, for JSON outputs */
  text?: (o: O) => string
  /** task-specific checks (e.g. evidence dates that are not in the context), reported as unverified */
  extraFlags?: (o: O, ctx: unknown) => string[]
}

export interface Result<O> {
  output: O
  meta: Meta
  context: unknown
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySpec = TaskSpec<any, any>

const EMPTY_FLAGS = { unverified_numbers: [], banned_phrases: [], rejected: false }
const BUNDLE = (() => {
  const m = (overview as unknown as { meta: { source_sha256_16: string; built_at: string } }).meta
  return `${m.source_sha256_16}:${m.built_at}`
})()

const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 16)

// ---- rate limit: in-process, 20 calls a minute per identity -------------------------
const calls = new Map<string, number[]>()
function limited(actor: string): boolean {
  const now = Date.now()
  const recent = (calls.get(actor) ?? []).filter((t) => now - t < 60_000)
  if (recent.length >= 20) return true
  recent.push(now)
  calls.set(actor, recent)
  return false
}

/** Why the model will not be called right now, or null when it may be. */
export async function blocked(actor = "anon"): Promise<string | null> {
  if (process.env.CS_AI_DISABLED === "1") return "disabled"
  const s = await readSettings()
  if (s.ai_runtime_enabled === false) return "switched_off"
  if (process.env.CS_AI_MOCK === "1") return null
  if (!process.env.ANTHROPIC_API_KEY) return "no_key"
  if ((await spend(30)) >= (s.monthly_budget_usd ?? 25)) return "budget"
  if (limited(actor)) return "rate_limit"
  return null
}

export async function status() {
  const s = await readSettings()
  const why = process.env.CS_AI_DISABLED === "1" ? "disabled" : s.ai_runtime_enabled === false ? "switched_off" : null
  const mock = process.env.CS_AI_MOCK === "1"
  const key = !!process.env.ANTHROPIC_API_KEY
  const reason = why ?? (mock ? "mock" : key ? ((await spend(30)) >= s.monthly_budget_usd ? "budget" : "ready") : "no_key")
  return {
    enabled: reason === "ready" || reason === "mock",
    reason,
    mock,
    key,
    models: MODELS,
    budget: s.monthly_budget_usd,
    ai_runtime_enabled: s.ai_runtime_enabled !== false,
  }
}

// ---- cache --------------------------------------------------------------------------
function cacheFile(task: string, key: string) {
  return path.join(OUT, "ai_cache", task, `${key}.json`)
}
async function readCache<O>(task: string, key: string): Promise<{ output: O; meta: Meta } | null> {
  try {
    return JSON.parse(await readFile(cacheFile(task, key), "utf8"))
  } catch {
    return null
  }
}
async function writeCache(task: string, key: string, v: unknown) {
  try {
    await mkdir(path.dirname(cacheFile(task, key)), { recursive: true })
    await writeFile(cacheFile(task, key), JSON.stringify(v))
  } catch {
    // a cache that cannot be written only costs a repeat call
  }
}

// ---- the call ----------------------------------------------------------------------
function client() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
}

function params(spec: AnySpec, ctx: unknown, instruction: string, locale: Locale) {
  const model = MODELS[spec.tier]
  const deep = usesFallbacks(model)
  return {
    model,
    max_tokens: spec.maxTokens,
    // stable prefix first, cached: the system prompt, then the context block
    system: [{ type: "text" as const, text: system(locale), cache_control: { type: "ephemeral" as const } }],
    messages: [
      {
        role: "user" as const,
        content: [
          { type: "text" as const, text: `CONTEXTO:\n${JSON.stringify(ctx)}`, cache_control: { type: "ephemeral" as const } },
          { type: "text" as const, text: instruction },
        ],
      },
    ],
    ...(deep
      ? {
          // a refused request is re-run server-side on Anthropic's recommended model
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default" as const,
          output_config: {
            effort: spec.effort ?? "medium",
            ...(spec.schema ? { format: { type: "json_schema" as const, schema: spec.schema.json } } : {}),
          },
        }
      : spec.schema
        ? { output_config: { format: { type: "json_schema" as const, schema: spec.schema.json } } }
        : {}),
  }
}

function checked<O>(spec: TaskSpec<unknown, O>, output: O, ctx: unknown, input: unknown): { flags: Meta["flags"]; ok: boolean } {
  const text = typeof output === "string" ? output : spec.text ? spec.text(output) : JSON.stringify(output)
  const g = guard(text, ctx, spec.typed ? spec.typed(input as never) : [])
  if (spec.extraFlags) g.unverified_numbers = [...new Set([...g.unverified_numbers, ...spec.extraFlags(output, ctx)])]
  const bad = g.unverified_numbers.length > 0 || g.banned_phrases.length > 0
  const rejected = spec.guard === "reject" && bad
  return { flags: { ...g, rejected }, ok: !rejected }
}

function meta(spec: AnySpec, ctx: unknown, source: Source, extra: Partial<Meta> = {}): Meta {
  return {
    source,
    model: MODELS[spec.tier],
    cost_usd: 0,
    tokens_in: 0,
    tokens_out: 0,
    prompt_version: VERSIONS[spec.task],
    flags: EMPTY_FLAGS,
    context_hash: hash(ctx),
    ...extra,
  }
}

async function ledger(spec: AnySpec, m: Meta, opts: Opts, cacheRead = 0) {
  await writeLedger({
    ts: new Date().toISOString(),
    task: spec.task,
    model: m.model,
    tokens_in: m.tokens_in,
    tokens_out: m.tokens_out,
    cache_read: cacheRead,
    cost: m.cost_usd,
    ok: m.source === "llm" || m.source === "cache" || m.source === "mock",
    source: m.source,
    owner: opts.owner ?? null,
    doctor: opts.doctor ?? null,
    prompt_version: m.prompt_version,
  })
}

/** One event of a streamed answer. */
export type StreamEvent<O> =
  | { type: "delta"; text: string }
  | { type: "replace"; text: string }
  | { type: "done"; output: O; meta: Meta; context: unknown }

/**
 * Run a task. Text tasks stream their deltas (unless the guard may reject, in which case
 * the answer is checked before the first byte leaves); JSON tasks yield only "done".
 * Never throws.
 */
export async function* run<I, O>(specIn: TaskSpec<I, O>, input: I, opts: Opts): AsyncGenerator<StreamEvent<O>> {
  const spec = specIn as unknown as TaskSpec<unknown, O>
  let ctx: unknown = null
  try {
    ctx = await spec.context(input, opts)
  } catch {
    ctx = { error: "context unavailable" }
  }
  const key = hash([spec.task, input, opts.locale, BUNDLE, VERSIONS[spec.task]])
  const done = (output: O, m: Meta): StreamEvent<O> => ({ type: "done", output, meta: m, context: ctx })
  const fallback = async (reason: string, cost = 0, tin = 0, tout = 0) => {
    const m = meta(spec, ctx, `fallback:${reason}`, { cost_usd: cost, tokens_in: tin, tokens_out: tout })
    await ledger(spec, m, opts)
    return done(spec.fallback(ctx, input, opts.locale), m)
  }

  // cache first (unless "Regenerar")
  if (!opts.refresh) {
    const hit = await readCache<O>(spec.task, key)
    if (hit) {
      const m = { ...hit.meta, source: "cache" as const, cost_usd: 0 }
      if (!opts.cacheOnly) await ledger(spec, m, opts) // a peek at the cache is not a call
      yield done(hit.output, m)
      return
    }
  }
  if (opts.cacheOnly) {
    yield done(spec.fallback(ctx, input, opts.locale), meta(spec, ctx, "fallback:not_cached"))
    return
  }

  const why = await blocked(opts.actor ?? "anon")
  if (why) {
    yield await fallback(why)
    return
  }

  if (process.env.CS_AI_MOCK === "1") {
    const output = spec.mock(ctx, input, opts.locale)
    const c = checked(spec, output, ctx, input)
    const m = meta(spec, ctx, "mock", { flags: c.flags })
    await ledger(spec, m, opts)
    if (!c.ok) {
      yield done(spec.fallback(ctx, input, opts.locale), m)
      return
    }
    if (typeof output === "string" && spec.guard !== "reject") {
      for (const part of output.match(/[\s\S]{1,24}(?:\s|$)/g) ?? [output]) yield { type: "delta", text: part }
    }
    // mock answers are not cached: a cached one would later read as a real model's
    yield done(output, m)
    return
  }

  // the real call
  const instruction = spec.instruction(input, opts.locale)
  const p = params(spec, ctx, instruction, opts.locale)
  let final: Anthropic.Beta.BetaMessage
  try {
    const stream = client().beta.messages.stream(p as Anthropic.Beta.MessageCreateParamsStreaming)
    const live = !spec.schema && spec.guard !== "reject"
    for await (const ev of stream) {
      if (live && ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
        yield { type: "delta", text: ev.delta.text }
      }
    }
    final = await stream.finalMessage()
  } catch (e) {
    yield await fallback(e instanceof Error ? e.constructor.name : "error")
    return
  }
  const u = final.usage
  const tin = u.input_tokens + (u.cache_creation_input_tokens ?? 0)
  const tout = u.output_tokens
  const served = final.model || MODELS[spec.tier]
  const cost = price(served, u.input_tokens, tout, u.cache_read_input_tokens ?? 0, u.cache_creation_input_tokens ?? 0)
  if (final.stop_reason === "refusal") {
    yield await fallback("refusal", cost, tin, tout)
    return
  }
  const text = final.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim()
  let output: O | null
  if (spec.schema) {
    try {
      output = spec.schema.parse(JSON.parse(text))
    } catch {
      output = null
    }
    if (output === null) {
      yield await fallback("bad_json", cost, tin, tout)
      return
    }
  } else {
    output = text as O
  }
  if (!text) {
    yield await fallback("empty", cost, tin, tout)
    return
  }
  const c = checked(spec, output, ctx, input)
  const m = meta(spec, ctx, "llm", { model: served, cost_usd: cost, tokens_in: tin, tokens_out: tout, flags: c.flags })
  await ledger(spec, m, opts, u.cache_read_input_tokens ?? 0)
  if (!c.ok) {
    // a message with a number that is not in the record goes out as the original draft
    const base = spec.fallback(ctx, input, opts.locale)
    yield done(base, m)
    return
  }
  if (typeof output === "string" && spec.guard === "reject") yield { type: "delta", text: output }
  await writeCache(spec.task, key, { output, meta: m })
  yield done(output, m)
}

/** Run to completion (JSON tasks, and callers that do not stream). */
export async function runOnce<I, O>(spec: TaskSpec<I, O>, input: I, opts: Opts): Promise<Result<O>> {
  let last: StreamEvent<O> | null = null
  for await (const ev of run(spec, input, opts)) last = ev
  const d = last as Extract<StreamEvent<O>, { type: "done" }>
  return { output: d.output, meta: d.meta, context: d.context }
}

/** An answer as Server-Sent Events: "delta" events, then a final "meta" (and "output"). */
export function sse<I, O>(spec: TaskSpec<I, O>, input: I, opts: Opts): Response {
  const enc = new TextEncoder()
  const body = new ReadableStream({
    async start(ctrl) {
      const send = (event: string, data: unknown) => ctrl.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      try {
        for await (const ev of run(spec, input, opts)) {
          if (ev.type === "delta") send("delta", { text: ev.text })
          else if (ev.type === "replace") send("replace", { text: ev.text })
          else {
            send("output", { output: ev.output, context: ev.context })
            send("meta", ev.meta)
          }
        }
      } catch {
        // run() never throws; this guards the stream itself
      }
      ctrl.close()
    },
  })
  return new Response(body, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store" } })
}
