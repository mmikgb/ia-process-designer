"use client"

// T4.3: rewrite the deterministic draft for a channel and tone, see the diff, use it.
import { useState } from "react"
import { Check, Copy, Sparkles, TriangleAlert } from "lucide-react"
import { ContextButton, Flagged, RegenerateButton, SourceBadge, WordDiff } from "@/components/ai/bits"
import { aiUsed } from "@/components/today/outcome-menu"
import { Button } from "@/components/ui/button"
import { useAi } from "@/lib/ai/client"
import { useT } from "@/lib/i18n"
import type { Key } from "@/lib/i18n/es"
import { useIdentity } from "@/lib/identity"
import { actorOf } from "@/lib/day"
import { cn } from "@/lib/utils"

type Kind = "whatsapp" | "email" | "call_script" | "followup_email" | "upsell_note"
const TONES = ["breve", "calido", "formal", "directo"] as const

export function Writer({
  doctorId,
  mode,
  base,
  onUse,
}: {
  doctorId: string
  mode: "draft" | "brief" | "handoff" | null
  /** the deterministic text the rewrite starts from (and falls back to) */
  base: string
  /** drafts only: put a version into the editable draft */
  onUse?: (text: string) => void
}) {
  const { t } = useT()
  const { who } = useIdentity()
  const kinds: Kind[] = mode === "brief" ? ["call_script", "whatsapp"] : mode === "handoff" ? ["upsell_note"] : ["whatsapp", "email", "call_script"]
  const [kind, setKind] = useState<Kind>(kinds[0])
  const [tones, setTones] = useState<string[]>([])
  const [instruction, setInstruction] = useState("")
  const [copied, setCopied] = useState(false)
  const ai = useAi<string>("/api/ai/message")

  const go = (refresh = false) => {
    setCopied(false)
    const used = aiUsed.get(doctorId) ?? new Set<string>()
    used.add(kind === "call_script" ? "call_script" : `message:${kind}`)
    aiUsed.set(doctorId, used)
    void ai.run({ doctor_id: doctorId, kind, tone: tones, instruction: instruction || undefined, base_text: base, locale: "es", actor: actorOf(who), refresh })
  }
  const out = ai.text || (typeof ai.output === "string" ? ai.output : "")
  const flags = ai.meta?.flags
  const sendable = kind === "whatsapp" || kind === "email" || kind === "followup_email"
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(out)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Sparkles className="size-4 text-primary" aria-hidden />
          {t("writer.title")}
        </h4>
        {kinds.length > 1 && (
          <div role="radiogroup" aria-label={t("writer.title")} className="inline-flex rounded-lg border border-border bg-background p-0.5">
            {kinds.map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                onClick={() => setKind(k)}
                className={cn(
                  "h-7 rounded-md px-2.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  kind === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(`writer.${k}` as Key)}
              </button>
            ))}
          </div>
        )}
      </div>
      {kind !== "call_script" && kind !== "upsell_note" && (
        <div className="flex flex-wrap gap-1.5">
          {TONES.map((tone) => {
            const on = tones.includes(tone)
            return (
              <button
                key={tone}
                type="button"
                aria-pressed={on}
                onClick={() => setTones((ts) => (on ? ts.filter((x) => x !== tone) : [...ts, tone]))}
                className={cn(
                  "h-7 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  on ? "border-primary bg-chip-green text-chip-green-fg" : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                {t(`writer.tone.${tone}` as Key)}
              </button>
            )
          })}
        </div>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={instruction}
          maxLength={300}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder={t("writer.instruction")}
          aria-label={t("writer.instruction")}
          className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        />
        <Button onClick={() => go()} disabled={ai.loading}>
          <Sparkles />
          {kind === "call_script" ? t("writer.script") : t("ai.rewrite")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t("writer.always_es")}</p>

      {(ai.loading || out || ai.error) && (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <SourceBadge meta={ai.meta} />
            <span className="ml-auto flex items-center gap-1">
              <ContextButton context={ai.context} />
              <RegenerateButton onClick={() => go(true)} disabled={ai.loading} />
            </span>
          </div>
          {ai.error && <p className="text-sm text-destructive">{t("ai.error")}</p>}
          {flags?.rejected && (
            <p className="flex items-start gap-2 rounded-lg bg-chip-amber px-3 py-2 text-sm text-chip-amber-fg">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                {t("writer.rejected")}
                {flags.unverified_numbers.length > 0 && (
                  <span className="font-medium"> ({t("ai.unverified")}: {flags.unverified_numbers.join(", ")})</span>
                )}
              </span>
            </p>
          )}
          {!flags?.rejected && flags && flags.banned_phrases.length > 0 && (
            <p className="rounded-lg bg-chip-amber px-3 py-2 text-sm text-chip-amber-fg">{t("writer.banned", { p: flags.banned_phrases.join(", ") })}</p>
          )}
          {sendable && out && !ai.loading ? (
            <>
              <span className="text-xs font-medium text-muted-foreground">{t("writer.diff")}</span>
              <div className="rounded-lg border border-border bg-background p-3">
                <WordDiff from={base} to={out} />
              </div>
            </>
          ) : (
            <pre className="rounded-lg border border-border bg-background p-3 font-sans text-sm leading-relaxed whitespace-pre-wrap text-foreground">
              <Flagged text={out} numbers={flags?.unverified_numbers ?? []} />
            </pre>
          )}
          {out && !ai.loading && (
            <div className="flex flex-wrap gap-2">
              {onUse && sendable && (
                <>
                  <Button size="sm" onClick={() => onUse(out)}>
                    {t("writer.use")}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => onUse(base)}>
                    {t("writer.original")}
                  </Button>
                </>
              )}
              {(!onUse || !sendable) && (
                <Button size="sm" variant="outline" onClick={copy}>
                  {copied ? <Check /> : <Copy />}
                  {t("writer.copy")}
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
