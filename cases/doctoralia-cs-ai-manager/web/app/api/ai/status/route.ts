// GET /api/ai/status: is the AI on and why, what it has cost, where it went.
import { status } from "@/lib/ai/gateway"
import { readLedger } from "@/lib/server/ledger"

export const dynamic = "force-dynamic"

export async function GET() {
  const s = await status()
  const rows = await readLedger(30)
  const group = (key: "task" | "owner") => {
    const out: Record<string, { calls: number; fallbacks: number; cost: number }> = {}
    for (const r of rows) {
      const k = r[key] ?? "—"
      const g = (out[k] ??= { calls: 0, fallbacks: 0, cost: 0 })
      g.calls++
      if (r.source.startsWith("fallback")) g.fallbacks++
      g.cost += r.cost
    }
    return out
  }
  const answered = rows.filter((r) => r.source === "llm" || r.source === "cache")
  return Response.json({
    ...s,
    spend_30d: rows.reduce((a, r) => a + r.cost, 0),
    calls: rows.length,
    fallbacks: rows.filter((r) => r.source.startsWith("fallback")).length,
    by_task: group("task"),
    by_owner: group("owner"),
    cache_hit: answered.length ? answered.filter((r) => r.source === "cache").length / answered.length : null,
  })
}
