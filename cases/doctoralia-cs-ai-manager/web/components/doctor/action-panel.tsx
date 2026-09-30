"use client"

import { useEffect, useState } from "react"
import { Check, Copy, RotateCcw, TriangleAlert } from "lucide-react"
import { Writer } from "@/components/ai/writer"
import { Button } from "@/components/ui/button"
import { useT } from "@/lib/i18n"
import type { Dossier } from "@/lib/types"

/**
 * What to do with this doctor: the editable draft (always Spanish), the call brief
 * or the handoff note, plus the channel note. Shared by focus mode and the sheet.
 */
export function ActionPanel({
  doc,
  onCopied,
  onEdited,
  banner,
}: {
  doc: Dossier
  onCopied?: () => void
  onEdited?: (edited: boolean) => void
  banner?: React.ReactNode
}) {
  const { t, tx } = useT()
  const original = doc.copilot.draft ?? ""
  const [text, setText] = useState(original)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    setText(original)
    setCopied(false)
  }, [doc.doctor_id, original])
  useEffect(() => {
    onEdited?.(!!original && text !== original)
  }, [text, original, onEdited])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      onCopied?.()
    } catch {
      setCopied(false)
    }
  }
  const handoff = doc.copilot.mode === "handoff"
  return (
    <div className="flex flex-col gap-4">
      {banner}
      {doc.copilot.i18n.channel && (
        <div className="flex items-start gap-2 rounded-lg bg-chip-amber px-3 py-2 text-sm text-chip-amber-fg">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            <span className="font-medium">{t("focus.channel")}:</span> {tx(doc.copilot.i18n.channel)}
          </span>
        </div>
      )}
      {doc.copilot.draft && doc.copilot.confident ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-foreground">{t("focus.draft")}</h4>
            {doc.copilot.i18n.ask && <span className="text-xs text-muted-foreground">{tx(doc.copilot.i18n.ask)}</span>}
          </div>
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setCopied(false)
            }}
            rows={9}
            aria-label={t("focus.draft")}
            className="w-full resize-y rounded-lg border border-input bg-card p-3 text-sm leading-relaxed text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          />
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={copy}>
              {copied ? <Check /> : <Copy />}
              {copied ? t("focus.copied") : t("focus.copy")}
            </Button>
            {text !== original && (
              <Button size="sm" variant="ghost" onClick={() => setText(original)}>
                <RotateCcw />
                {t("focus.reset")}
              </Button>
            )}
          </div>
          {doc.copilot.i18n.why && <p className="text-xs text-pretty text-muted-foreground">{tx(doc.copilot.i18n.why)}</p>}
          <Writer
            doctorId={doc.doctor_id}
            mode="draft"
            base={original}
            onUse={(v) => {
              setText(v)
              setCopied(false)
            }}
          />
        </div>
      ) : doc.copilot.i18n.instead ? (
        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-semibold text-foreground">
            {handoff ? t("focus.handoff") : doc.copilot.mode === "brief" ? t("focus.brief") : t("focus.facts")}
          </h4>
          <pre className="rounded-lg border border-border bg-background p-4 font-sans text-sm leading-relaxed whitespace-pre-wrap text-foreground">
            {tx(doc.copilot.i18n.instead)}
          </pre>
          {doc.copilot.i18n.why && <p className="text-xs text-pretty text-muted-foreground">{tx(doc.copilot.i18n.why)}</p>}
          {(doc.copilot.mode === "brief" || handoff) && (
            <Writer doctorId={doc.doctor_id} mode={doc.copilot.mode} base={doc.copilot.i18n.instead.es} />
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t("focus.nodraft")}</p>
      )}
    </div>
  )
}
