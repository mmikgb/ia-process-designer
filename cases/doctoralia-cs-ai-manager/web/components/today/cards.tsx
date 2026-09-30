"use client"

import { useEffect } from "react"
import { Play } from "lucide-react"
import { ContextButton, Flagged, RegenerateButton, SourceBadge } from "@/components/ai/bits"
import { BLOCK } from "@/components/today/style"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useAi } from "@/lib/ai/client"
import { actorOf, type Day } from "@/lib/day"
import { useIdentity } from "@/lib/identity"
import { addBusinessDays } from "@/lib/dates"
import type { Block } from "@/lib/dayplan"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

/** The day's briefing: the AI one when it is on, the template over the same numbers meanwhile or without it. */
export function BriefingCard({ day, children }: { day: Day; children?: React.ReactNode }) {
  const { t, tx, locale } = useT()
  const { who } = useIdentity()
  const ai = useAi<string>("/api/ai/briefing")
  const first = day.pending[0]
  const tomorrow = day.returning.filter((r) => r.due === addBusinessDays(day.today, 1)).length
  const template = first
    ? t("today.briefing.text", {
        calls: day.counts.call,
        fu: day.counts.followup,
        msg: day.counts.message,
        name: first.doctor_name,
        reason: tx(first.reason).replace(/\.$/, "").toLowerCase(),
      })
    : t("today.briefing.done", { done: day.done.length })
  const body = (refresh = false) => ({
    scope: day.owner,
    app_day: day.today,
    locale,
    capacity: day.opts.capacity,
    quota: day.opts.quota,
    window: day.opts.window,
    actor: actorOf(who),
    refresh,
  })
  const run = ai.run
  useEffect(() => {
    void run(body())
    // cached per owner per app day; changing capacity or the day asks again
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, day.owner, day.today, locale, day.opts.capacity, day.opts.quota, day.opts.window])
  const text = ai.text || template
  return (
    <div className="relative flex min-h-44 flex-col gap-3 overflow-hidden rounded-lg bg-linear-to-br from-[#005446] via-[#006a59] to-[#00806a] p-6 text-white shadow-card lg:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold">{t("today.briefing.title")}</h2>
        <span className="flex items-center gap-1">
          {ai.meta ? <SourceBadge meta={ai.meta} onDark /> : <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium">{t("today.briefing.auto")}</span>}
          <ContextButton context={ai.context} onDark />
          <RegenerateButton onClick={() => void run(body(true))} disabled={ai.loading} onDark />
        </span>
      </div>
      <p className="max-w-3xl text-[15px] leading-relaxed whitespace-pre-line text-pretty text-white/95">
        <Flagged text={text} numbers={ai.meta?.flags.unverified_numbers ?? []} />
      </p>
      {!ai.text && tomorrow > 0 && <p className="text-sm text-white/80">{t("today.briefing.returning", { n: tomorrow })}</p>}
      {children}
    </div>
  )
}

export function ProgressCard({ day, onStart }: { day: Day; onStart: () => void }) {
  const { t } = useT()
  const done = day.done.filter((e) => e.outcome !== "skipped").length
  const planned = done + day.pending.filter((y) => y.block !== "handoff").length
  const share = planned ? done / planned : 0
  const next = day.pending[0]
  const R = 34
  const C = 2 * Math.PI * R
  return (
    <Card className="justify-between gap-4 p-6">
      <div className="flex items-center gap-4">
        <svg viewBox="0 0 80 80" className="size-20 shrink-0 -rotate-90" role="img" aria-label={t("today.progress", { done, plan: planned })}>
          <circle cx="40" cy="40" r={R} fill="none" stroke="var(--color-muted)" strokeWidth="8" />
          {done > 0 && <circle
            cx="40"
            cy="40"
            r={R}
            fill="none"
            stroke="var(--color-primary)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${C * share} ${C}`}
          />}
        </svg>
        <div className="flex flex-col">
          <span className="text-2xl font-semibold tabular-nums text-foreground">{t("today.progress", { done, plan: planned })}</span>
          <span className="text-sm text-muted-foreground">{t("today.progress.label")}</span>
        </div>
      </div>
      <p className="line-clamp-2 text-sm text-foreground">
        {next ? t("today.next", { name: next.doctor_name, what: t(BLOCK[next.block].what) }) : t("today.next.none")}
      </p>
      <Button size="lg" onClick={onStart} disabled={!next} className="w-full">
        <Play />
        {t("today.start")}
      </Button>
    </Card>
  )
}

const STATS: { block: Block; total?: "followup" | "message" }[] = [
  { block: "call" },
  { block: "followup", total: "followup" },
  { block: "message", total: "message" },
  { block: "handoff" },
]

/** Nexchat-style stat row. Clicking one scrolls to its block. No deltas: nothing here has n ≥ 10 history. */
export function StatCards({ day, onPick }: { day: Day; onPick: (b: Block) => void }) {
  const { t, num } = useT()
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {STATS.map(({ block, total }) => {
        const s = BLOCK[block]
        const Icon = s.icon
        const n = day.counts[block as keyof Day["counts"]]
        const all = total ? day.totals[total] : n
        return (
          <button
            key={block}
            type="button"
            onClick={() => onPick(block)}
            className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5 text-left shadow-card transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <span className={cn("flex size-9 items-center justify-center rounded-full", s.chip)} aria-hidden>
              <Icon className="size-4" />
            </span>
            <span className="text-sm font-medium text-muted-foreground">{t(s.label)}</span>
            <span className="flex items-end justify-between gap-2">
              <span className="text-3xl font-semibold tabular-nums text-foreground">{num(n)}</span>
              {all > n ? (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{t("today.stat.total", { n: num(all) })}</span>
              ) : n === 0 ? (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{t("today.stat.none")}</span>
              ) : null}
            </span>
          </button>
        )
      })}
    </div>
  )
}
