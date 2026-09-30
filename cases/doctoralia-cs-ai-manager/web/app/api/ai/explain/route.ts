// POST /api/ai/explain: explain one KPI, chart, team row or signal (SSE).
import { sse } from "@/lib/ai/gateway"
import { ExplainInput, explainTask } from "@/lib/ai/tasks/explain"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const b = ExplainInput.safeParse(await req.json().catch(() => null))
  if (!b.success) return Response.json({ error: b.error.issues }, { status: 400 })
  const { refresh, actor, ...input } = b.data
  return sse(explainTask, input, { locale: input.locale, actor, owner: /^S\d+$/.test(input.scope) ? input.scope : null, refresh })
}
