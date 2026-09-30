"use client"

// T4.5: the "Explícame" icon button, on any KPI card, control chart, team row or signal.
import { useState } from "react"
import { MessageCircleQuestion } from "lucide-react"
import { ContextButton, Flagged, RegenerateButton, SourceBadge } from "@/components/ai/bits"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import { useAi } from "@/lib/ai/client"
import { actorOf } from "@/lib/day"
import { useT } from "@/lib/i18n"
import { useIdentity } from "@/lib/identity"
import { cn } from "@/lib/utils"

export function ExplainButton({
  kind,
  itemKey,
  scope = "all",
  period = "30",
  label,
  className,
}: {
  kind: "kpi" | "spc" | "team_row" | "signal"
  itemKey: string
  scope?: string
  period?: string
  label?: string
  className?: string
}) {
  const { t, locale } = useT()
  const { who } = useIdentity()
  const ai = useAi<string>("/api/ai/explain")
  const [open, setOpen] = useState(false)
  const body = (refresh = false) => ({ kind, key: itemKey, scope, period, locale, actor: actorOf(who), refresh })
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o && !ai.text && !ai.loading) void ai.run(body())
      }}
    >
      <PopoverTrigger
        aria-label={label ? `${t("ai.explain")}: ${label}` : t("ai.explain")}
        title={t("ai.explain")}
        className={cn(
          "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          className,
        )}
      >
        <MessageCircleQuestion className="size-4" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-80 flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-foreground">{t("ai.explain")}</span>
          <SourceBadge meta={ai.meta} />
        </div>
        {ai.text ? (
          <p className="text-sm leading-relaxed text-foreground">
            <Flagged text={ai.text} numbers={ai.meta?.flags.unverified_numbers ?? []} />
          </p>
        ) : ai.error ? (
          <p className="text-sm text-destructive">{t("ai.error")}</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-5/6" />
            <Skeleton className="h-3.5 w-2/3" />
          </div>
        )}
        <div className="flex items-center justify-end gap-1">
          <ContextButton context={ai.context} />
          <RegenerateButton onClick={() => void ai.run(body(true))} disabled={ai.loading} />
        </div>
      </PopoverContent>
    </Popover>
  )
}
