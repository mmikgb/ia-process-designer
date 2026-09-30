// POST /api/ai/briefing: the day's briefing (specialist) or "Qué pasó esta semana" (SSE).
import { sse } from "@/lib/ai/gateway"
import { BriefingInput, briefingTask } from "@/lib/ai/tasks/briefing"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const b = BriefingInput.safeParse(await req.json().catch(() => null))
  if (!b.success) return Response.json({ error: b.error.issues }, { status: 400 })
  const { refresh, actor, ...input } = b.data
  return sse(briefingTask, input, { locale: input.locale, actor, owner: /^S\d+$/.test(input.scope) ? input.scope : null, refresh })
}
