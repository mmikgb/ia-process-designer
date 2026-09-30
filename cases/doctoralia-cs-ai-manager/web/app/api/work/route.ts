// The outcome log: POST appends one line to out/work_log.jsonl (never rewrites it),
// GET returns an owner's events and the folded state per doctor.
import { appendFile, mkdir } from "node:fs/promises"
import { z } from "zod"
import { OUT } from "@/lib/server/paths"
import { WORK_LOG as LOG, readWorkLog } from "@/lib/server/work-log"
import { fold, newId, type WorkEvent } from "@/lib/work"

export const dynamic = "force-dynamic"

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const id = z.string().regex(/^[A-Za-z0-9_:.-]{1,40}$/)

const Body = z.object({
  doctor_id: id,
  doctor_name: z.string().max(120).nullish(),
  owner: id,
  actor: id,
  outcome: z.enum(["sent", "no_answer", "agreed", "not_applicable", "routed", "skipped", "undo"]),
  next_due: day.nullish(),
  reason: z.string().max(200).nullish(),
  note: z.string().max(500).nullish(),
  play: z.string().max(40).nullish(),
  draft_copied: z.boolean().optional(),
  draft_edited: z.boolean().optional(),
  ai_used: z.array(z.string().max(40)).max(10).optional(),
  app_day: day,
  undo_of: z.string().max(40).nullish(),
})

export async function GET(req: Request) {
  const owner = new URL(req.url).searchParams.get("owner")
  const events = await readWorkLog(owner)
  return Response.json({ events, state: fold(events) })
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: parsed.error.issues }, { status: 400 })
  const b = parsed.data
  if (b.outcome === "undo" && !b.undo_of) return Response.json({ error: "undo needs undo_of" }, { status: 400 })
  const event: WorkEvent = {
    id: newId(),
    ts: new Date().toISOString(),
    ...b,
    next_due: b.next_due ?? null,
    reason: b.reason ?? null,
    note: b.note ?? null,
    play: b.play ?? null,
    undo_of: b.undo_of ?? null,
    draft_copied: b.draft_copied ?? false,
    draft_edited: b.draft_edited ?? false,
    ai_used: b.ai_used ?? [],
  }
  await mkdir(OUT, { recursive: true })
  await appendFile(LOG, JSON.stringify(event) + "\n", "utf8")
  return Response.json(event, { status: 201 })
}
