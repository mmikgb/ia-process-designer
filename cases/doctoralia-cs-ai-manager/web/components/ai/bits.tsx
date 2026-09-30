"use client"

// Shared pieces of every AI surface: where the answer came from, what the model saw,
// and numbers that are not in the data.
import { useState } from "react"
import { Braces, RefreshCw, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { modelName, type AiMeta } from "@/lib/ai/client"
import { useT } from "@/lib/i18n"
import type { Key } from "@/lib/i18n/es"
import { cn } from "@/lib/utils"

const REASONS = ["no_key", "disabled", "switched_off", "budget", "rate_limit", "refusal", "bad_json", "not_cached"]

export function useSourceLabel() {
  const { t } = useT()
  return (m: AiMeta | null): { label: string; reason?: string; ai: boolean } => {
    if (!m) return { label: "", ai: false }
    if (m.source === "llm") return { label: t("ai.src.llm", { model: modelName(m.model) }), ai: true }
    if (m.source === "cache") return { label: t("ai.src.cache", { model: modelName(m.model) }), ai: true }
    if (m.source === "mock") return { label: t("ai.src.mock"), ai: true }
    const r = m.source.replace("fallback:", "")
    return { label: t("ai.src.fallback"), reason: t((REASONS.includes(r) ? `ai.reason.${r}` : "ai.reason.other") as Key), ai: false }
  }
}

export function SourceBadge({ meta, className, onDark = false }: { meta: AiMeta | null; className?: string; onDark?: boolean }) {
  const { label, reason, ai } = useSourceLabel()(meta)
  if (!label) return null
  return (
    <span
      title={reason}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        onDark ? "bg-white/15 text-white" : ai ? "bg-chip-green text-chip-green-fg" : "bg-muted text-muted-foreground",
        className,
      )}
    >
      {ai && <Sparkles className="size-3" aria-hidden />}
      {label}
      {reason && <span className="font-normal opacity-80">· {reason}</span>}
    </span>
  )
}

export function ContextButton({ context, onDark = false }: { context: unknown; onDark?: boolean }) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  if (!context) return null
  return (
    <>
      <Button
        size="xs"
        variant="ghost"
        onClick={() => setOpen(true)}
        className={onDark ? "text-white hover:bg-white/15 hover:text-white" : undefined}
      >
        <Braces />
        {t("ai.context")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl" closeLabel={t("sheet.close")}>
          <DialogHeader>
            <DialogTitle>{t("ai.context.title")}</DialogTitle>
            <DialogDescription>{t("ai.context.body")}</DialogDescription>
          </DialogHeader>
          <pre className="max-h-[60vh] overflow-auto rounded-lg bg-muted p-3 font-mono text-xs leading-relaxed text-foreground">
            {JSON.stringify(context, null, 2)}
          </pre>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function RegenerateButton({ onClick, disabled, onDark = false }: { onClick: () => void; disabled?: boolean; onDark?: boolean }) {
  const { t } = useT()
  return (
    <Button
      size="xs"
      variant="ghost"
      onClick={onClick}
      disabled={disabled}
      className={onDark ? "text-white hover:bg-white/15 hover:text-white" : undefined}
    >
      <RefreshCw />
      {t("ai.regenerate")}
    </Button>
  )
}

/** Text with the numbers the guard could not find in the context underlined. */
export function Flagged({ text, numbers }: { text: string; numbers: string[] }) {
  const { t } = useT()
  if (!numbers.length) return <>{text}</>
  const esc = numbers.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  const parts = text.split(new RegExp(`(${esc.join("|")})`, "g"))
  return (
    <>
      {parts.map((p, i) =>
        numbers.includes(p) ? (
          <Tooltip key={i}>
            <TooltipTrigger render={<span className="cursor-help underline decoration-destructive decoration-dotted decoration-2 underline-offset-4" />}>
              {p}
            </TooltipTrigger>
            <TooltipContent>{t("ai.unverified")}</TooltipContent>
          </Tooltip>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  )
}

/** Word-level diff: added words in green, removed ones struck through. */
export function WordDiff({ from, to }: { from: string; to: string }) {
  const a = from.split(/(\s+)/)
  const b = to.split(/(\s+)/)
  const n = a.length
  const m = b.length
  // LCS table; drafts are short enough for O(n·m)
  const L = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1])
  const out: { t: string; k: "same" | "add" | "del" }[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) out.push({ t: a[i++], k: "same" }), j++
    else if (L[i + 1][j] >= L[i][j + 1]) out.push({ t: a[i++], k: "del" })
    else out.push({ t: b[j++], k: "add" })
  }
  while (i < n) out.push({ t: a[i++], k: "del" })
  while (j < m) out.push({ t: b[j++], k: "add" })
  return (
    <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">
      {out.map((p, k) =>
        p.k === "same" ? (
          <span key={k}>{p.t}</span>
        ) : p.k === "add" ? (
          <ins key={k} className="rounded-sm bg-chip-green text-chip-green-fg no-underline">
            {p.t}
          </ins>
        ) : (
          <del key={k} className="text-muted-foreground">
            {p.t}
          </del>
        ),
      )}
    </p>
  )
}
