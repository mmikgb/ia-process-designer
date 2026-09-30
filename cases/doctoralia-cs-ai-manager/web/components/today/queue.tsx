"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { ChevronDown, Copy } from "lucide-react"
import { doctorHref } from "@/components/shell/doctor-sheet-host"
import { OutcomeMenu, copiedDrafts } from "@/components/today/outcome-menu"
import { BLOCK } from "@/components/today/style"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useClock } from "@/lib/clock"
import type { Day } from "@/lib/day"
import { daysBetween } from "@/lib/dates"
import type { Block, Planned } from "@/lib/dayplan"
import { loadBook } from "@/lib/dossiers"
import { useT } from "@/lib/i18n"
import type { I18n } from "@/lib/tx"
import { useShell } from "@/lib/shell"
import { cn } from "@/lib/utils"

/** The right-hand pill: lead time left for calls, due/overdue for follow-ups, risk otherwise. */
export function usePill() {
  const { t, pct } = useT()
  const clock = useClock()
  return (y: Planned): { text: string; tone: string } => {
    if (y.block === "call" && y.days_of_lead_left != null) {
      const left = clock.leadLeft(y.days_of_lead_left)
      if (left < 0) return { text: t("pill.lead_gone"), tone: "bg-chip-red text-chip-red-fg" }
      return {
        text: left === 0 ? t("pill.today") : left === 1 ? t("pill.day") : t("pill.days", { n: left }),
        tone: left <= 3 ? "bg-chip-red text-chip-red-fg" : "bg-chip-amber text-chip-amber-fg",
      }
    }
    if ((y.block === "followup" || y.origin === "followup") && y.due_at) {
      const late = daysBetween(y.due_at, clock.today)
      if (late <= 0) return { text: t("pill.due_today"), tone: "bg-chip-blue text-chip-blue-fg" }
      return { text: t("pill.overdue", { n: late }), tone: "bg-chip-amber text-chip-amber-fg" }
    }
    return { text: pct(y.risk_score), tone: "bg-muted text-muted-foreground" }
  }
}

export function QueueRow({ y, day, className }: { y: Planned; day: Day; className?: string }) {
  const { t, tx } = useT()
  const router = useRouter()
  const path = usePathname()
  const params = useSearchParams()
  const pill = usePill()(y)
  const style = BLOCK[y.block === "later" ? (y.origin ?? "later") : y.block]
  const Icon = style.icon
  const open = () => router.push(doctorHref(path, params, y.doctor_id), { scroll: false })
  const copy = async () => {
    const d = (await loadBook(day.owner)).get(y.doctor_id)
    if (!d?.copilot.draft) return
    try {
      await navigator.clipboard.writeText(d.copilot.draft)
      copiedDrafts.add(y.doctor_id)
      toast(t("row.copied"), { description: y.doctor_name })
    } catch {
      // clipboard blocked: the sheet still has the draft to select by hand
    }
  }
  return (
    <li
      data-doctor={y.doctor_id}
      className={cn("group relative flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/60", className)}
    >
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", style.chip)} aria-hidden>
        <Icon className="size-4" />
      </span>
      <button
        type="button"
        onClick={open}
        className="flex min-w-0 flex-1 flex-col items-start text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <span className="truncate text-sm font-medium text-foreground">{y.doctor_name}</span>
        <span className="line-clamp-1 text-xs text-muted-foreground">
          {tx(y.reason)}
          {y.later_reason && <> · {tx(y.later_reason)}</>}
        </span>
      </button>
      <div className="hidden items-center gap-1.5 group-focus-within:flex group-hover:flex">
        <Button size="xs" variant="outline" onClick={open}>
          {t("row.open")}
        </Button>
        {y.mode === "draft" && y.confident && (
          <Button size="xs" variant="outline" onClick={copy} aria-label={t("row.copy")}>
            <Copy />
            <span className="hidden xl:inline">{t("row.copy")}</span>
          </Button>
        )}
        {y.block !== "later" && <OutcomeMenu day={day} today={day.today} target={y} className="h-6" />}
      </div>
      <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums group-hover:hidden", pill.tone)}>
        {pill.text}
      </span>
    </li>
  )
}

function BlockCard({
  block,
  rows,
  day,
  total,
  children,
  tools,
  limit,
}: {
  block: Block
  rows: Planned[]
  day: Day
  total?: number
  children?: React.ReactNode
  tools?: React.ReactNode
  limit?: number
}) {
  const { t, num } = useT()
  const [all, setAll] = useState(false)
  const shown = limit && !all ? rows.slice(0, limit) : rows
  return (
    <Card id={`block-${block}`} className="scroll-mt-6 gap-3 py-5">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-foreground">
          {t(BLOCK[block].label)}
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
            {num(rows.length)}
            {total != null && total > rows.length && ` / ${num(total)}`}
          </span>
        </h2>
        {tools}
      </div>
      {children}
      {rows.length ? (
        <ul className="flex flex-col px-3">
          {shown.map((y) => (
            <QueueRow key={y.doctor_id} y={y} day={day} />
          ))}
        </ul>
      ) : (
        <p className="px-5 text-sm text-muted-foreground">{t("today.empty.block")}</p>
      )}
      {limit != null && rows.length > limit && (
        <button
          type="button"
          onClick={() => setAll((a) => !a)}
          className="mx-5 self-start text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {all ? t("today.later.hide") : t("today.showall", { n: num(rows.length) })}
        </button>
      )}
    </Card>
  )
}

export function Queue({ day, playFilter, setPlayFilter }: { day: Day; playFilter: string; setPlayFilter: (p: string) => void }) {
  const { t, tx, num } = useT()
  const shell = useShell()
  const [showLater, setShowLater] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const by = (b: Block) => day.items.filter((y) => y.block === b)
  const messages = by("message")
  const plays = shell.plays.filter((p) => messages.some((y) => y.play === p.key))
  const later = by("later")
  const handoffs = by("handoff")
  const label = (key: string): I18n | string => shell.plays.find((p) => p.key === key)?.label ?? key

  const routeAll = async () => {
    setConfirm(false)
    for (const y of handoffs) await day.log(y, "routed")
    toast(t("outcome.logged", { outcome: t("outcome.routed"), name: num(handoffs.length) }))
  }

  return (
    <div className="flex flex-col gap-4">
      <BlockCard block="call" rows={by("call")} day={day} />
      <BlockCard block="followup" rows={by("followup")} day={day} total={day.totals.followup} />
      <BlockCard
        block="message"
        rows={playFilter === "all" ? messages : messages.filter((y) => y.play === playFilter)}
        day={day}
        total={day.totals.message}
        tools={<span className="text-xs text-muted-foreground">{t("today.order")}</span>}
      >
        {plays.length > 1 && (
          <div role="radiogroup" aria-label={t("today.order")} className="flex flex-wrap gap-1.5 px-5">
            {[{ key: "all", label: t("today.filter.all") as I18n | string }, ...plays.map((p) => ({ key: p.key, label: label(p.key) }))].map((p) => (
              <button
                key={p.key}
                type="button"
                role="radio"
                aria-checked={playFilter === p.key}
                onClick={() => setPlayFilter(p.key)}
                className={cn(
                  "h-7 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  playFilter === p.key ? "border-primary bg-chip-green text-chip-green-fg" : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                {tx(p.label)}
                {p.key !== "all" && ` · ${messages.filter((y) => y.play === p.key).length}`}
              </button>
            ))}
          </div>
        )}
      </BlockCard>
      <BlockCard
        block="handoff"
        rows={handoffs}
        day={day}
        limit={5}
        tools={
          handoffs.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => setConfirm(true)}>
              {t("today.handoff.bulk")}
            </Button>
          )
        }
      />
      <Card className="gap-3 py-4">
        <button
          type="button"
          onClick={() => setShowLater((s) => !s)}
          aria-expanded={showLater}
          className="flex items-center justify-between gap-2 px-5 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <span className="text-[15px] font-semibold text-foreground">
            {t("block.later")} <span className="font-normal text-muted-foreground">({num(later.length)})</span>
          </span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {showLater ? t("today.later.hide") : t("today.later.show")}
            <ChevronDown className={cn("size-4 transition-transform", showLater && "rotate-180")} aria-hidden />
          </span>
        </button>
        {showLater && (
          <ul className="flex flex-col px-3">
            {later.map((y) => (
              <QueueRow key={y.doctor_id} y={y} day={day} />
            ))}
          </ul>
        )}
      </Card>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent className="max-w-md" closeLabel={t("sheet.close")}>
          <DialogHeader>
            <DialogTitle>{t("today.handoff.confirm.title", { n: handoffs.length })}</DialogTitle>
            <DialogDescription>{t("today.handoff.confirm.body")}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirm(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={routeAll}>{t("today.handoff.confirm.ok", { n: handoffs.length })}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
