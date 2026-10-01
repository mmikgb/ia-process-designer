"use client"

// "Escuchar": a text read aloud by ElevenLabs (POST /api/ai/speak). Shown only when speech
// is available (/api/ai/status tts); with no key the button is simply not there.
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Square, Volume2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { refreshAiStatus, useAiStatus } from "@/lib/ai/client"
import { useT } from "@/lib/i18n"

export function ListenButton({ text, owner, onDark = false }: { text: string; owner?: string | null; onDark?: boolean }) {
  const { t } = useT()
  const ai = useAiStatus()
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle")
  const audio = useRef<HTMLAudioElement | null>(null)
  useEffect(() => {
    return () => {
      audio.current?.pause()
    }
  }, [])
  if (!ai?.tts || !text.trim()) return null

  const stop = () => {
    audio.current?.pause()
    setState("idle")
  }
  const play = async () => {
    setState("loading")
    try {
      const r = await fetch("/api/ai/speak", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, owner: owner ?? null }),
      })
      if (!r.ok) throw new Error(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? String(r.status))
      const url = URL.createObjectURL(await r.blob())
      const a = new Audio(url)
      audio.current = a
      a.onended = () => {
        URL.revokeObjectURL(url)
        setState("idle")
      }
      setState("playing")
      await a.play()
    } catch (e) {
      setState("idle")
      toast(t("ai.listen.error"), { description: e instanceof Error ? e.message.slice(0, 200) : undefined })
    } finally {
      void refreshAiStatus()
    }
  }
  return (
    <Button
      size="xs"
      variant="ghost"
      onClick={state === "playing" ? stop : () => void play()}
      disabled={state === "loading"}
      data-listen={state}
      className={onDark ? "text-white hover:bg-white/15 hover:text-white" : undefined}
    >
      {state === "playing" ? <Square /> : <Volume2 />}
      {state === "playing" ? t("ai.listen.stop") : t("ai.listen")}
    </Button>
  )
}
