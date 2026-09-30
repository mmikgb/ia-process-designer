// POST /api/ai/settings: the kill switch and the monthly budget (local use only: no auth).
import { z } from "zod"
import { status } from "@/lib/ai/gateway"
import { writeSettings } from "@/lib/server/settings"

export const dynamic = "force-dynamic"

const Body = z.object({
  ai_runtime_enabled: z.boolean().optional(),
  monthly_budget_usd: z.number().min(0).max(10_000).optional(),
})

export async function POST(req: Request) {
  const b = Body.safeParse(await req.json().catch(() => null))
  if (!b.success) return Response.json({ error: b.error.issues }, { status: 400 })
  await writeSettings(b.data)
  return Response.json(await status())
}
