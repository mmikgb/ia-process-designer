// POST /api/ai/speak {text}: the text read aloud (audio/mpeg from ElevenLabs, audio/wav
// silence in mock mode). Every call writes a ledger row (task "speak", characters in
// tokens_in). 503 with the reason when speech is off.
import { z } from "zod"
import { writeLedger } from "@/lib/server/ledger"
import { MAX_CHARS, VOICE, silentWav, synthesize, voiceBlocked } from "@/lib/ai/voice"

export const dynamic = "force-dynamic"

const Body = z.object({ text: z.string().min(1).max(MAX_CHARS * 2), owner: z.string().max(40).nullish() })

export async function POST(req: Request) {
  const b = Body.safeParse(await req.json().catch(() => null))
  if (!b.success) return Response.json({ error: b.error.issues }, { status: 400 })
  const text = b.data.text.slice(0, MAX_CHARS)
  const row = (source: string, ok: boolean) =>
    writeLedger({
      ts: new Date().toISOString(), task: "speak", model: `elevenlabs:${VOICE.model}`, tokens_in: text.length, tokens_out: 0,
      cache_read: 0, cost: 0, ok, source, owner: b.data.owner ?? null, doctor: null, prompt_version: "speak-v1",
    })
  const why = await voiceBlocked()
  if (why) {
    await row(`fallback:${why}`, false)
    return Response.json({ error: why }, { status: 503 })
  }
  if (process.env.CS_AI_MOCK === "1") {
    await row("mock", true)
    return new Response(silentWav() as BodyInit, { headers: { "content-type": "audio/wav", "cache-control": "no-store" } })
  }
  try {
    const audio = await synthesize(text)
    await row("llm", true)
    return new Response(audio, { headers: { "content-type": "audio/mpeg", "cache-control": "no-store" } })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error"
    console.error(`[speak] ${msg}`) // the reason shows in the terminal running the app
    await row("fallback:error", false)
    return Response.json({ error: msg }, { status: 502 })
  }
}
