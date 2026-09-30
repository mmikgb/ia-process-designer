// POST /api/ai/doctor: the structured analysis of one doctor (JSON).
import { searchIndex } from "@/lib/ai/context"
import { runOnce } from "@/lib/ai/gateway"
import { DoctorInput, doctorTask } from "@/lib/ai/tasks/doctor"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const b = DoctorInput.safeParse(await req.json().catch(() => null))
  if (!b.success) return Response.json({ error: b.error.issues }, { status: 400 })
  const { refresh, cache_only, actor, ...input } = b.data
  const owner = (await searchIndex()).find((r) => r.id === input.doctor_id)?.owner ?? null
  const r = await runOnce(doctorTask, input, { locale: input.locale, actor, owner, doctor: input.doctor_id, refresh, cacheOnly: cache_only })
  return Response.json(r)
}
