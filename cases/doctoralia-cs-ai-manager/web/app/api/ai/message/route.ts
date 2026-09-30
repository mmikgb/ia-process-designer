// POST /api/ai/message: rewrite a draft for a channel and tone (SSE).
import { searchIndex } from "@/lib/ai/context"
import { sse } from "@/lib/ai/gateway"
import { MessageInput, messageTask } from "@/lib/ai/tasks/message"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const b = MessageInput.safeParse(await req.json().catch(() => null))
  if (!b.success) return Response.json({ error: b.error.issues }, { status: 400 })
  const { refresh, actor, ...input } = b.data
  const owner = (await searchIndex()).find((r) => r.id === input.doctor_id)?.owner ?? null
  return sse(messageTask, input, { locale: input.locale, actor, owner, doctor: input.doctor_id, refresh })
}
