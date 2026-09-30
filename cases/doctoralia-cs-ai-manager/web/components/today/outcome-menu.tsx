"use client"

import { useState } from "react"
import { toast } from "sonner"
import { ChevronDown } from "lucide-react"
import { AgreedDialog } from "@/components/today/agreed-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuGroup,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Day, LogExtra } from "@/lib/day"
import type { Outcome } from "@/lib/dayplan"
import { useT } from "@/lib/i18n"
import type { Key } from "@/lib/i18n/es"
import { cn } from "@/lib/utils"

export const OUTCOME_LABEL: Record<Outcome, Key> = {
  sent: "outcome.sent",
  no_answer: "outcome.no_answer",
  agreed: "outcome.agreed",
  not_applicable: "outcome.na",
  routed: "outcome.routed",
  skipped: "outcome.skip",
}
export const NA_REASONS: Key[] = ["outcome.na.resolved", "outcome.na.not_mine", "outcome.na.changed", "outcome.na.other"]

// Drafts copied from a row this session: the outcome logged next carries draft_copied.
export const copiedDrafts = new Set<string>()
// AI features used on a doctor this session: the outcome logged next carries ai_used.
export const aiUsed = new Map<string, Set<string>>()

type Target = { doctor_id: string; doctor_name: string; play: string | null; mode?: string | null }

/** Log an outcome with a toast that can undo it. Shared by rows, focus mode and the sheet. */
export function useLogOutcome(day: Pick<Day, "log">) {
  const { t, day: fmtDay } = useT()
  return async (x: Target, outcome: Outcome, extra: LogExtra = {}) => {
    const used = [...(aiUsed.get(x.doctor_id) ?? [])]
    const e = await day.log(x, outcome, {
      draft_copied: copiedDrafts.has(x.doctor_id),
      ...(used.length ? { ai_used: used } : {}),
      ...extra,
    })
    copiedDrafts.delete(x.doctor_id)
    aiUsed.delete(x.doctor_id)
    if (outcome === "skipped") return e
    toast(t("outcome.logged", { outcome: t(OUTCOME_LABEL[outcome]), name: x.doctor_name }), {
      description: e.next_due ? t("outcome.returns", { date: fmtDay(e.next_due) }) : undefined,
      action: { label: t("today.undo"), onClick: () => void day.log(x, "undo", { undo_of: e.id }) },
    })
    return e
  }
}

/** "Resultado ▾" on a row or in the sheet header. */
export function OutcomeMenu({
  day,
  target,
  today,
  className,
  onLogged,
}: {
  day: Pick<Day, "log">
  target: Target
  today: string
  className?: string
  onLogged?: () => void
}) {
  const { t } = useT()
  const logOutcome = useLogOutcome(day)
  const [agreed, setAgreed] = useState(false)
  const go = async (o: Outcome, extra?: LogExtra) => {
    await logOutcome(target, o, extra)
    onLogged?.()
  }
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            "inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            className,
          )}
        >
          {t("row.outcome")}
          <ChevronDown className="size-3.5" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          {target.mode === "handoff" ? (
            <DropdownMenuItem onClick={() => go("routed")}>{t("outcome.routed")}</DropdownMenuItem>
          ) : (
            <>
              <DropdownMenuItem onClick={() => go("sent")}>{t("outcome.sent")}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => go("no_answer")}>{t("outcome.no_answer")}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setAgreed(true)}>{t("outcome.agreed")}</DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>{t("outcome.na")}</DropdownMenuLabel>
            {NA_REASONS.map((r) => (
              <DropdownMenuItem key={r} onClick={() => go("not_applicable", { reason: r.split(".").pop() })}>
                {t(r)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <AgreedDialog
        open={agreed}
        onOpenChange={setAgreed}
        today={today}
        name={target.doctor_name}
        onSave={(next_due, note) => {
          setAgreed(false)
          void go("agreed", { next_due, note: note || null })
        }}
      />
    </>
  )
}
