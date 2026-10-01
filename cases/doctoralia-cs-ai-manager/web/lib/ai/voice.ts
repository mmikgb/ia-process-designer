// Text to speech with ElevenLabs (server only): the specialist's morning and the manager's
// week, read aloud in Mexican Spanish. Optional like the rest of the AI layer: no key, the
// kill switch or CS_AI_DISABLED hide the button; CS_AI_MOCK=1 returns a short silent clip.
// ElevenLabs bills per character on its own account; the ledger records the characters,
// not dollars, so this spend is not in the Anthropic budget.
import { readSettings } from "@/lib/server/settings"

export const VOICE = {
  // "Ana Sofía – Conversational": female, neutral Mexican accent (ElevenLabs voice library)
  id: process.env.ELEVENLABS_VOICE_ID || "ewn5JTa3lNPY8QVuZJi6",
  model: process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2",
}
export const MAX_CHARS = 2500

/** Why speech is off right now, or null when it may run. */
export async function voiceBlocked(): Promise<string | null> {
  if (process.env.CS_AI_DISABLED === "1") return "disabled"
  if ((await readSettings()).ai_runtime_enabled === false) return "switched_off"
  if (process.env.CS_AI_MOCK === "1") return null
  if (!process.env.ELEVENLABS_API_KEY) return "no_key"
  return null
}

/** A valid WAV of `seconds` of silence: the mock answer, so tests exercise the whole path. */
export function silentWav(seconds = 0.5, rate = 8000): Uint8Array {
  const n = Math.round(seconds * rate)
  const buf = new ArrayBuffer(44 + n)
  const v = new DataView(buf)
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  str(0, "RIFF"); v.setUint32(4, 36 + n, true); str(8, "WAVE"); str(12, "fmt ")
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, rate, true); v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true)
  str(36, "data"); v.setUint32(40, n, true)
  new Uint8Array(buf, 44).fill(128) // 8-bit PCM silence
  return new Uint8Array(buf)
}

/** MP3 bytes from ElevenLabs, or throws (the route turns that into a 502). */
export async function synthesize(text: string): Promise<ArrayBuffer> {
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE.id}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY!, "content-type": "application/json", accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: VOICE.model }),
  })
  if (!r.ok) throw new Error(`elevenlabs ${r.status}: ${(await r.text()).slice(0, 200)}`)
  return r.arrayBuffer()
}
